// The office's camera on each lane's app (DESIGN.md 14.12), driven by harness/preview.py: one JSON per line in on
// stdin (login, open, edited, watch, fps, qa, close), frames, stills and status out on stdout. Each save leaves a
// still for the lane's film. With `qa`, it also watches the Chrome the session's Playwright MCP drives (over CDP). One headless Chrome, one context
// per lane, signed in as the office's test user. The project's harness/office-viewer.mjs says how to sign in, what
// sample data the pages need and which page a file belongs to; without it the camera shows "/" as a visitor.
// Usage: node cam.mjs <folder with node_modules/@playwright/test> <project root>
import { createRequire } from "node:module";
import { existsSync } from "node:fs";
import { pathToFileURL } from "node:url";
import readline from "node:readline";

const [modules, project] = process.argv.slice(2);
const { chromium } = createRequire(`${modules}/package.json`)("@playwright/test");
const hooksFile = `${project}/harness/office-viewer.mjs`;
const hooks = existsSync(hooksFile) ? await import(pathToFileURL(hooksFile).href) : {};
const out = o => process.stdout.write(JSON.stringify(o) + "\n");
const say = (job, text) => out({ kind: "status", job, text });

// The installed Google Chrome, like the e2e tests; Playwright's own Chromium when there is none.
const browser = await chromium.launch({ channel: "chrome", headless: true }).catch(() => chromium.launch({ headless: true }));
const lanes = new Map();  // job -> { context, page, cdp, route, last }: the camera's own view of the app
const qas = new Map();    // job -> { endpoint, browser, page, cdp, last }: QA's browser, as the MCP drives it
const wanted = new Set();  // "job:view" someone watches, even before it opens
let fps = 4, account = null, seeded = false;

/** A route with [segments] opens its parent page and follows the first link that fits. */
async function go(lane, job, route) {
  if (!route.includes("[")) return lane.page.goto(route, { timeout: 60_000 });
  const parent = route.slice(0, route.indexOf("/[")) || "/";
  await lane.page.goto(parent, { timeout: 60_000 });
  const fits = new RegExp("^" + route.replace(/\[\.\.\.[^\]]+\]/g, ".+").replace(/\[[^\]]+\]/g, "[^/]+") + "/?$");
  const hrefs = await lane.page.$$eval("a[href]", as => as.map(a => new URL(a.href).pathname));
  // An id over a word: /books/[id] means /books/3f2a…, not the /books/new page next to it.
  const hits = hrefs.filter(h => fits.test(h)), last = h => h.split("/").filter(Boolean).pop() ?? "";
  const hit = hits.find(h => /\d/.test(last(h)) || last(h).length >= 16) ?? hits[0];
  if (hit) await lane.page.goto(hit, { timeout: 60_000 });
  else say(job, `no ${route} page to open yet: showing ${parent}`);
}

const path = page => { try { return new URL(page.url()).pathname; } catch { return ""; } };

async function shoot(job, view, t, kind = "frame", more = {}) {
  const data = (await t.page.screenshot({ type: "jpeg", quality: 60 })).toString("base64");
  out({ kind, job, view, data, url: path(t.page), ...more });
}

/** A still of the app, and of the phone on the same page, for the film. */
async function stills(job, lane, saved) {
  await shoot(job, "app", lane, "still", { path: saved }).catch(() => {});
  if (!lane.phone) return;
  const at = path(lane.page);
  if (path(lane.phone.page) !== at) await lane.phone.page.goto(at, { timeout: 60_000 }).catch(() => {});
  await lane.phone.page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});  // past "Loading…"
  await shoot(job, "mobile", lane.phone, "still", { path: saved }).catch(() => {});
}

async function open(job, port) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, baseURL: `http://localhost:${port}` });
  const page = await context.newPage();
  const lane = { context, page, cdp: null, route: "/", watching: false, last: 0 };
  lanes.set(job, lane);
  let signedIn = false;
  if (hooks.signIn && account) signedIn = await hooks.signIn(page, account).catch(() => false);
  if (hooks.signIn && !signedIn) say(job, "could not sign in as the office's test user: showing the app as a visitor");
  if (signedIn && hooks.seed && !seeded) {
    seeded = true;
    await hooks.seed(page).catch(e => say(job, `sample data not added: ${String(e).slice(0, 120)}`));
  }
  await page.goto(hooks.home ?? "/", { timeout: 60_000 }).catch(() => {});
  // The phone: the same user and page at 390×844, photographed at each save (no screencast).
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true,
                                           baseURL: `http://localhost:${port}`, storageState: await context.storageState() });
  lane.phone = { context: phone, page: await phone.newPage() };
  await stills(job, lane, "");  // the film starts where the lane is
  if (wanted.has(`${job}:app`)) await screencast(job, "app", lane, true);
}

/** CDP screencast of t.page (the camera's page, or QA's) while someone watches: JPEG frames, at most `fps` a second. */
async function screencast(job, view, t, on) {
  if (!on || !t.page) {
    await t.cdp?.send("Page.stopScreencast").catch(() => {});
    return;
  }
  if (!t.cdp) {
    const cdp = t.cdp = await t.page.context().newCDPSession(t.page);
    cdp.on("Page.screencastFrame", f => {
      cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});  // unacked, Chrome stops sending
      const now = Date.now();
      if (t.cdp !== cdp || now - t.last < 1000 / fps) return;
      t.last = now;
      out({ kind: "frame", job, view, data: f.data, url: path(t.page) });
    });
  }
  await t.cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: 1280, maxHeight: 800 });
  await shoot(job, view, t).catch(() => {});  // a still page sends no frame of its own
}

/** QA's browser: the newest page the MCP has open, in any context, looked for again every 2 s while watched. */
async function watchQa(job, on) {
  const q = qas.get(job);
  if (!q) return;
  clearInterval(q.timer);
  if (!on) return screencast(job, "qa", q, false);
  if (!q.browser) {
    q.browser = await chromium.connectOverCDP(q.endpoint);
    q.browser.on("disconnected", () => { clearInterval(q.timer); qas.delete(job); });
  }
  const pick = async () => {
    const page = q.browser.contexts().flatMap(c => c.pages()).filter(p => !p.isClosed()).at(-1) ?? null;
    if (page === q.page) return;
    if (q.cdp) await q.cdp.detach().catch(() => {});
    Object.assign(q, { page, cdp: null });
    if (page) await screencast(job, "qa", q, true).catch(() => {});
  };
  await pick();
  q.timer = setInterval(() => { chain = chain.then(pick).catch(() => {}); }, 2000);
}

const ops = {
  login: m => { account = { email: m.email, password: m.password }; },
  open: m => open(m.job, m.port),
  fps: m => { fps = Math.max(1, Math.min(10, Number(m.value) || 4)); },
  watch: m => {
    const view = m.view === "qa" ? "qa" : "app";
    if (m.on) wanted.add(`${m.job}:${view}`); else wanted.delete(`${m.job}:${view}`);
    if (view === "qa") return watchQa(m.job, !!m.on);
    const lane = lanes.get(m.job);
    if (lane) return screencast(m.job, "app", lane, !!m.on);
  },
  qa: m => {
    if (!qas.has(m.job)) qas.set(m.job, { endpoint: m.endpoint, browser: null, page: null, cdp: null, last: 0 });
    if (wanted.has(`${m.job}:qa`)) return watchQa(m.job, true);
  },
  close: async m => {
    const lane = lanes.get(m.job), q = qas.get(m.job);
    lanes.delete(m.job);
    qas.delete(m.job);
    await lane?.context.close().catch(() => {});
    await lane?.phone?.context.close().catch(() => {});
    await q?.browser?.close().catch(() => {});  // over CDP: lets go of QA's Chrome, which the loop stops
  },
  edited: async m => {
    const lane = lanes.get(m.job);
    if (!lane) return;
    const route = hooks.routeOf?.(m.path);
    if (route && route !== lane.route) {  // the same page: hot reload shows the change
      lane.route = route;
      await go(lane, m.job, route);
    }
    await lane.page.waitForTimeout(1500);  // hot reload done
    await stills(m.job, lane, m.path);
  },
};

// One command at a time, in order: a page navigates before the next command touches it.
let chain = Promise.resolve();
readline.createInterface({ input: process.stdin }).on("line", line => {
  let m;
  try { m = JSON.parse(line); } catch { return; }
  chain = chain.then(() => ops[m.op]?.(m)).catch(e => say(m.job, `camera: ${String(e).slice(0, 160)}`));
}).on("close", async () => { await chain; await browser.close(); process.exit(0); });
