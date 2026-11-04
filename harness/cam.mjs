// The office's camera on each lane's app (DESIGN.md 14.12), driven by harness/preview.py: one JSON per line in on
// stdin (login, open, edited, watch, fps, close), frames and status out on stdout. One headless Chrome, one context
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
const lanes = new Map();  // job -> { page, cdp, route, watching, last }
const wanted = new Set();  // the lanes someone watches, even before they open
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

async function shoot(job, lane) {
  const data = (await lane.page.screenshot({ type: "jpeg", quality: 60 })).toString("base64");
  out({ kind: "frame", job, data, url: new URL(lane.page.url()).pathname });
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
  if (wanted.has(job)) await screencast(job, lane, true);
}

async function screencast(job, lane, on) {
  lane.watching = on;
  if (!on) {
    await lane.cdp?.send("Page.stopScreencast").catch(() => {});
    return;
  }
  if (!lane.cdp) {
    lane.cdp = await lane.context.newCDPSession(lane.page);
    lane.cdp.on("Page.screencastFrame", f => {
      lane.cdp.send("Page.screencastFrameAck", { sessionId: f.sessionId }).catch(() => {});  // unacked, Chrome stops sending
      const t = Date.now();
      if (t - lane.last < 1000 / fps) return;
      lane.last = t;
      out({ kind: "frame", job, data: f.data, url: new URL(lane.page.url()).pathname });
    });
  }
  await lane.cdp.send("Page.startScreencast", { format: "jpeg", quality: 60, maxWidth: 1280, maxHeight: 800 });
  await shoot(job, lane).catch(() => {});  // a still page sends no frame of its own
}

const ops = {
  login: m => { account = { email: m.email, password: m.password }; },
  open: m => open(m.job, m.port),
  fps: m => { fps = Math.max(1, Math.min(10, Number(m.value) || 4)); },
  watch: m => {
    if (m.on) wanted.add(m.job); else wanted.delete(m.job);
    const lane = lanes.get(m.job);
    if (lane) return screencast(m.job, lane, !!m.on);
  },
  close: async m => { const lane = lanes.get(m.job); lanes.delete(m.job); await lane?.context.close(); },
  edited: async m => {
    const lane = lanes.get(m.job);
    const route = lane && hooks.routeOf?.(m.path);
    if (!route || route === lane.route) return;  // the same page: hot reload shows the change
    lane.route = route;
    await go(lane, m.job, route);
  },
};

// One command at a time, in order: a page navigates before the next command touches it.
let chain = Promise.resolve();
readline.createInterface({ input: process.stdin }).on("line", line => {
  let m;
  try { m = JSON.parse(line); } catch { return; }
  chain = chain.then(() => ops[m.op]?.(m)).catch(e => say(m.job, `camera: ${String(e).slice(0, 160)}`));
}).on("close", async () => { await chain; await browser.close(); process.exit(0); });
