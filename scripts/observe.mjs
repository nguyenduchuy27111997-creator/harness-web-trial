#!/usr/bin/env node
// Observe a web page or a short flow and keep what a designer or an architect needs from it (the idea of
// morluto/rea's browser scenarios): a screenshot and the accessibility tree per step and width, the API it calls
// (grouped by endpoint, JSON shapes without values), the scripts it loads and the stack they hint at, console errors.
//
//   node scripts/observe.mjs <url | scenario.json> [--out docs/design/references/<M>/<name>]
//
// A scenario: {"name", "start_url", "viewports": [{"name", "width", "height"}], "color_scheme": "light|dark",
//   "steps": [{"id", "click"|"fill"|"press"|"wait_for"|"goto": <css or "role=button[name=Save]">, "value"}],
//   "capture": ["screenshot", "aria", "network", "scripts", "console"]}
// Defaults: desktop 1440x900 and phone 390x844, every capture. Nothing is typed into a login or payment form,
// and no step submits one: it looks, it does not act for anyone. Output is bounded; what was not captured is
// listed as not_requested, and a step that failed says so (a missing screenshot is not a blank page).
import { chromium } from "@playwright/test";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ALL = ["screenshot", "aria", "network", "scripts", "console"];
const TEMPLATES = [
  [/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i, "{uuid}"],
  [/^\d+$/, "{numeric}"],
  [/^[0-9a-f]{32,}$/i, "{hex}"],
  [/^\d{4}-\d\d-\d\d/, "{iso-date}"],
];
const HINTS = [ // what a page's scripts and markup say about its stack
  [/\/_next\//, "Next.js"], [/__NEXT_DATA__|self\.__next_f/, "Next.js (app router: __next_f)"], [/\/_nuxt\//, "Nuxt"],
  [/data-reactroot|react-dom/, "React"], [/\/@vite\/|\/assets\/index-[\w-]+\.js/, "Vite"], [/svelte/, "Svelte"],
  [/supabase\.co/, "Supabase"], [/firebaseio|firebase/, "Firebase"], [/stripe\.com/, "Stripe"],
  [/sentry/, "Sentry"], [/googletagmanager|gtag\(/, "Google Analytics"], [/posthog/, "PostHog"],
  [/tailwind/, "Tailwind"], [/radix-/, "Radix UI"],
];
const MAX_ENDPOINTS = 40;

const args = process.argv.slice(2);
const outAt = args.indexOf("--out");
const out = outAt >= 0 ? args[outAt + 1] : "observe-out";
const target = args.find((a, i) => i !== outAt && i !== outAt + 1);
if (!target) {
  console.error("usage: node scripts/observe.mjs <url | scenario.json> [--out dir]");
  process.exit(2);
}
const sc = target.endsWith(".json") ? JSON.parse(readFileSync(target, "utf8")) : { start_url: target };
const viewports = sc.viewports ?? [{ name: "desktop", width: 1440, height: 900 }, { name: "phone", width: 390, height: 844 }];
const capture = new Set(sc.capture ?? ALL);
mkdirSync(out, { recursive: true });

const endpoint = (method, url) => {
  const u = new URL(url);
  const path = u.pathname.split("/").map((s) => TEMPLATES.find(([rx]) => rx.test(s))?.[1] ?? s).join("/");
  return `${method} ${u.host}${path}`;
};
const shape = (v, depth = 0) => { // the JSON's form without its values
  if (Array.isArray(v)) return v.length ? [shape(v[0], depth + 1)] : [];
  if (v && typeof v === "object") {
    if (depth >= 3) return "{…}";
    return Object.fromEntries(Object.keys(v).slice(0, 20).map((k) => [k, shape(v[k], depth + 1)]));
  }
  return v === null ? "null" : typeof v;
};
const locate = (page, sel) => {
  const m = /^role=(\w+)(?:\[name=(.+)\])?$/.exec(sel);
  return m ? page.getByRole(m[1], m[2] ? { name: m[2] } : {}) : page.locator(sel);
};
const SENSITIVE = /password|card|cvc|cvv|iban|ssn|otp|token/i;

const browser = process.env.PW_WS
  ? await chromium.connect(process.env.PW_WS)
  : await chromium.launch({ channel: process.env.CI ? undefined : "chrome" }).catch(() => chromium.launch());
const summary = { url: sc.start_url, name: sc.name ?? null, steps: [], endpoints: {}, scripts: [], hints: [], console: [],
                  not_requested: ALL.filter((c) => !capture.has(c)) };
try {
  for (const vp of viewports) {
    const ctx = await browser.newContext({ viewport: { width: vp.width, height: vp.height }, colorScheme: sc.color_scheme ?? "light" });
    const page = await ctx.newPage();
    page.on("console", (m) => { if (m.type() === "error" && summary.console.length < 20) summary.console.push(m.text().slice(0, 200)); });
    page.on("pageerror", (e) => { if (summary.console.length < 20) summary.console.push(`pageerror: ${String(e.message).slice(0, 200)}`); });
    page.on("response", async (res) => {
      const req = res.request();
      const kind = req.resourceType();
      if (kind === "script" && !summary.scripts.includes(res.url()) && summary.scripts.length < 60) summary.scripts.push(res.url());
      if (!["fetch", "xhr"].includes(kind)) return;
      const key = endpoint(req.method(), res.url());
      if (!summary.endpoints[key] && Object.keys(summary.endpoints).length >= MAX_ENDPOINTS) return;
      const e = (summary.endpoints[key] ??= { statuses: [], types: [], count: 0, shape: null });
      e.count += 1;
      if (!e.statuses.includes(res.status())) e.statuses.push(res.status());
      const type = (res.headers()["content-type"] ?? "").split(";")[0];
      if (type && !e.types.includes(type)) e.types.push(type);
      if (!e.shape) { // JSON by its type, or by its first character when a server labels it badly
        const body = await res.text().catch(() => "");
        if (type.includes("json") || /^\s*[[{]/.test(body)) {
          try { e.shape = shape(JSON.parse(body)); } catch { e.shape = type.includes("json") ? "unreadable" : null; }
        }
      }
    });
    const steps = [{ id: "start", goto: sc.start_url }, ...(sc.steps ?? [])];
    for (const [n, st] of steps.entries()) {
      const rec = { viewport: vp.name, step: st.id ?? `step-${n}`, status: "ok" };
      try {
        if (st.goto) await page.goto(new URL(st.goto, sc.start_url).href, { waitUntil: "domcontentloaded", timeout: 30000 });
        if (st.fill) {
          if (SENSITIVE.test(st.fill)) throw new Error("refused: a sensitive field");
          await locate(page, st.fill).fill(String(st.value ?? ""), { timeout: 10000 });
        }
        if (st.click) await locate(page, st.click).first().click({ timeout: 10000 });
        if (st.press) await page.keyboard.press(st.press);
        if (st.wait_for) await locate(page, st.wait_for).first().waitFor({ timeout: 15000 });
        await page.waitForLoadState("networkidle", { timeout: 8000 }).catch(() => { rec.note = "network still busy after 8 s"; });
        const base = join(out, `${vp.name}-${String(n).padStart(2, "0")}-${rec.step}`);
        if (capture.has("screenshot")) { await page.screenshot({ path: `${base}.png`, fullPage: true }); rec.screenshot = `${base}.png`; }
        if (capture.has("aria")) {
          const tree = await page.locator("body").ariaSnapshot().catch(() => null);
          if (tree) { writeFileSync(`${base}.aria.yml`, tree.slice(0, 60000)); rec.aria = `${base}.aria.yml`; } else rec.aria = "unknown";
        }
        if (n === 0 && capture.has("scripts")) {
          const html = (await page.content()).slice(0, 2_000_000) + summary.scripts.join(" ");
          for (const [rx, name] of HINTS) if (rx.test(html) && !summary.hints.includes(name)) summary.hints.push(name);
        }
      } catch (e) {
        rec.status = "failed";
        rec.error = String(e.message).split("\n")[0].slice(0, 200);
      }
      summary.steps.push(rec);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}
if (!capture.has("network")) summary.endpoints = "not_requested";
if (!capture.has("console")) summary.console = "not_requested";
writeFileSync(join(out, "summary.json"), JSON.stringify(summary, null, 1));
const md = [
  `# Observed: ${summary.name ?? summary.url}`, `URL: ${summary.url}`,
  "", "## Steps", ...summary.steps.map((s) => `- ${s.viewport} ${s.step}: ${s.status}${s.error ? ` (${s.error})` : ""}${s.screenshot ? ` → ${s.screenshot}` : ""}`),
  "", `## Stack hints: ${summary.hints.join(", ") || "none seen"}`,
  "", "## API (method, host and path template → statuses; JSON shape without values)",
  ...(typeof summary.endpoints === "string" ? ["not_requested"] : Object.entries(summary.endpoints).map(([k, e]) =>
    `- ${k} → ${e.statuses.join("/")} ×${e.count}${e.shape ? `: ${JSON.stringify(e.shape).slice(0, 300)}` : ""}`)),
  "", `## Console errors: ${Array.isArray(summary.console) ? summary.console.length : "not_requested"}`,
  ...(Array.isArray(summary.console) ? summary.console.slice(0, 8).map((c) => `- ${c}`) : []),
  ...(summary.not_requested.length ? ["", `Not requested: ${summary.not_requested.join(", ")}`] : []),
].join("\n");
writeFileSync(join(out, "summary.md"), md.slice(0, 8000));
console.log(md.slice(0, 8000));
process.exit(summary.steps.every((s) => s.status === "failed") ? 1 : 0);
