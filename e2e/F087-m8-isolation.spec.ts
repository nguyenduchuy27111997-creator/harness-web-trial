import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook } from "./books";
import { coverFile } from "./covers";
import { createShelves, shareShelfLink, shelveOpenBook } from "./shelves";
import type { Database } from "../lib/database.types";

// F087: account B cannot reach account A's covers, live book changes or shared shelves.
const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const fresh = () => createClient<Database>(url, anonKey, { auth: { persistSession: false } });
const png = coverFile("image/png").buffer;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function signUp(who: string, t: string) {
  const client = fresh();
  const { data, error } = await client.auth.signUp({ email: `f087-${who}-${t}@example.com`, password: "secret123" });
  expect(error).toBeNull();
  return { client, userId: data.user!.id };
}

async function bookWithCover(a: ReturnType<typeof fresh>, userId: string, t: string) {
  const { data, error } = await a.from("books").insert({ title: `Covered ${t}`, author: "A", status: "reading" }).select("id").single();
  expect(error).toBeNull();
  const path = `${userId}/${data!.id}-${t}.png`;
  expect((await a.storage.from("covers").upload(path, png, { contentType: "image/png" })).error).toBeNull();
  expect((await a.from("books").update({ cover_path: path }).eq("id", data!.id)).error).toBeNull();
  return { id: data!.id, path };
}

test("B cannot open A's cover by path, and a stale or removed cover's signed URL stops working", async () => {
  const t = stamp();
  const { client: a, userId } = await signUp("a", t);
  const { client: b } = await signUp("b", t);
  const { path } = await bookWithCover(a, userId, t);

  expect((await b.storage.from("covers").createSignedUrl(path, 60)).error).not.toBeNull();
  expect((await b.storage.from("covers").download(path)).error).not.toBeNull();

  const live = await a.storage.from("covers").createSignedUrl(path, 60);
  expect((await fetch(live.data!.signedUrl)).ok).toBe(true);

  const short = await a.storage.from("covers").createSignedUrl(path, 1);
  await sleep(2_500);
  expect((await fetch(short.data!.signedUrl)).ok).toBe(false);

  expect((await a.storage.from("covers").remove([path])).error).toBeNull();
  expect((await fetch(live.data!.signedUrl)).ok).toBe(false);
});

test("B's live channel gets nothing of A's books and cannot join A's channel", async () => {
  const t = stamp();
  const { client: a, userId: aUserId } = await signUp("a-rt", t);
  const { client: b, userId: bId } = await signUp("b-rt", t);

  await b.realtime.setAuth();
  const received: unknown[] = [];
  const own = b.channel(`books:${bId}`, { config: { private: true } }).on("broadcast", { event: "*" }, (m) => received.push(m));
  const ownStatus = new Promise<string>((resolve) => own.subscribe((s) => ["SUBSCRIBED", "CHANNEL_ERROR", "TIMED_OUT", "CLOSED"].includes(s) && resolve(s)));
  const foreignStatuses: string[] = [];
  const foreign = b.channel(`books:${aUserId}`, { config: { private: true } }).on("broadcast", { event: "*" }, (m) => received.push(m));
  foreign.subscribe((s) => foreignStatuses.push(s));
  expect(await ownStatus).toBe("SUBSCRIBED");

  const added = await a.from("books").insert({ title: `Live ${t}`, author: "A", status: "reading" }).select("id").single();
  expect(added.error).toBeNull();
  expect((await a.from("books").update({ status: "finished" }).eq("id", added.data!.id)).error).toBeNull();
  expect((await a.from("books").delete().eq("id", added.data!.id)).error).toBeNull();

  await sleep(4_000);
  expect(received).toHaveLength(0);
  expect(foreignStatuses).not.toContain("SUBSCRIBED");
  await b.removeAllChannels();
});

test("a made-up share token is not found", async ({ page }) => {
  const missing = await page.goto(`/s/${"a1".repeat(24)}`);
  expect(missing?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Shelf not found" })).toBeVisible();
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F087-made-up-token.png", { stylePath: "e2e/hide-dev-overlay.css" });
});

test("after A stops sharing, B and a signed-out visitor get not found on the old link", async ({ page, browser }) => {
  const t = stamp();
  const shelf = `Iso ${t}`;
  await signUpAs(page, `f087-share-a-${t}@example.com`);
  await createShelves(page, [shelf]);
  await addAndOpenBook(page, `Iso book ${t}`, "Reading");
  await expect(page.getByRole("heading", { name: `Iso book ${t}` })).toBeVisible();
  await shelveOpenBook(page, shelf);
  await page.goto("/shelves");
  const link = await shareShelfLink(page, shelf);

  const row = page.getByRole("listitem").filter({ hasText: shelf });
  await row.getByRole("button", { name: "Stop sharing" }).click();
  await expect(row.getByRole("button", { name: "Share" })).toBeVisible();

  const ctxB = await browser.newContext();
  const pageB = await ctxB.newPage();
  await signUpAs(pageB, `f087-share-b-${t}@example.com`);
  const ctxAnon = await browser.newContext();
  const anon = await ctxAnon.newPage();
  for (const visitor of [pageB, anon]) {
    const res = await visitor.goto(link);
    expect(res?.status()).toBe(404);
    await expect(visitor.getByRole("heading", { name: "Shelf not found" })).toBeVisible();
    await expect(visitor.getByText(shelf)).toHaveCount(0);
    await expectAccessible(visitor);
  }
  await expect(anon).toHaveScreenshot("F087-stopped-sharing.png", { stylePath: "e2e/hide-dev-overlay.css" });
  await ctxB.close();
  await ctxAnon.close();
});
