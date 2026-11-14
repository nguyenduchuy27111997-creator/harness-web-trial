import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook, tagOpenBook } from "./books";
import { coverFile } from "./covers";
import { createShelves, shelveOpenBook } from "./shelves";
import type { Database } from "../lib/database.types";

const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const fresh = () => createClient<Database>(url, anonKey, { auth: { persistSession: false } });
const png = coverFile("image/png").buffer;

test("a shared page shows no notes, quotes, review, tags, other shelves, email or display name", async ({ page, browser }) => {
  const t = stamp();
  const email = `f084-ui-${t}@example.com`;
  const shelf = `Public ${t}`;
  const other = `Private shelf ${t}`;
  const title = `Shared book ${t}`;
  const secrets = {
    note: `secret-note-${t}`,
    quote: `secret-quote-${t}`,
    review: `secret-review-${t}`,
    tag: `secrettag${Date.now()}`,
    name: `Secret Name ${Date.now()}`,
  };
  await signUpAs(page, email);

  await page.goto("/settings");
  await page.getByLabel("Display name").fill(secrets.name);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByLabel("Display name")).toHaveValue(secrets.name);

  await createShelves(page, [shelf, other]);
  await addAndOpenBook(page, title, "Finished");
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();

  const notes = page.getByRole("region", { name: "Notes" });
  await notes.getByRole("textbox", { name: "Note" }).fill(secrets.note);
  await notes.getByRole("button", { name: "Add note" }).click();
  await expect(notes.getByText(secrets.note)).toBeVisible();

  await page.getByRole("textbox", { name: "Quote", exact: true }).fill(secrets.quote);
  await page.getByRole("button", { name: "Save quote" }).click();
  await expect(page.getByText(secrets.quote)).toBeVisible();

  const review = page.getByRole("textbox", { name: "Review" });
  await review.fill(secrets.review);
  await page.getByRole("button", { name: "Post review" }).click();
  await expect(page.locator("form").filter({ has: review }).getByRole("status")).toHaveText("Saved");

  await tagOpenBook(page, [secrets.tag]);
  await shelveOpenBook(page, shelf);
  await shelveOpenBook(page, other);

  await page.goto("/shelves");
  const row = page.getByRole("listitem").filter({ hasText: shelf });
  await row.getByRole("button", { name: "Share" }).click();
  await expect(row.getByRole("button", { name: "Copy link" })).toBeVisible();
  const match = ((await row.getByText(/\/s\/[0-9a-f]{48}/).textContent()) ?? "").match(/(\S*\/s\/[0-9a-f]{48})/);
  expect(match).not.toBeNull();

  const context = await browser.newContext();
  const anon = await context.newPage();
  await anon.goto(match![1]);
  await expect(anon.getByRole("heading", { level: 1, name: shelf })).toBeVisible();
  const book = anon.getByRole("listitem").filter({ hasText: title });
  await expect(book).toBeVisible();

  const body = anon.locator("body");
  for (const secret of [...Object.values(secrets), other, email, email.split("@")[0]]) {
    await expect(body).not.toContainText(secret);
  }
  await expect(anon.getByText(/\bnotes?\b|\bquotes?\b/i)).toHaveCount(0);

  await expectAccessible(anon);
  await expect(anon).toHaveScreenshot("F084-shared-nothing-private.png", {
    stylePath: "e2e/hide-dev-overlay.css",
    mask: [anon.getByRole("heading", { level: 1 }), anon.getByRole("listitem")],
  });
  await context.close();
});

test("with the anon key a wrong or revoked token returns nothing and nothing outside a shared shelf is readable", async () => {
  const t = stamp();
  const a = fresh();
  const signUp = await a.auth.signUp({ email: `f084-api-${t}@example.com`, password: "secret123" });
  expect(signUp.error).toBeNull();
  const userId = signUp.data.user!.id;

  const shelfRes = await a.from("shelves").insert({ name: `Api ${t}` }).select("id").single();
  expect(shelfRes.error).toBeNull();
  const shelfId = shelfRes.data!.id;
  const sharedRes = await a.from("books").insert({ title: `On shelf ${t}`, author: "A", status: "reading" }).select("id").single();
  const hiddenRes = await a.from("books").insert({ title: `Off shelf ${t}`, author: "A", status: "reading" }).select("id").single();
  expect(sharedRes.error).toBeNull();
  expect(hiddenRes.error).toBeNull();
  const sharedId = sharedRes.data!.id;
  const hiddenId = hiddenRes.data!.id;
  expect((await a.from("book_shelves").insert({ book_id: sharedId, shelf_id: shelfId })).error).toBeNull();
  for (const id of [sharedId, hiddenId]) {
    expect((await a.from("notes").insert({ book_id: id, body: `note ${t}` })).error).toBeNull();
    expect((await a.from("quotes").insert({ book_id: id, body: `quote ${t}` })).error).toBeNull();
  }

  // Covers: one on the shared shelf's book, one on the other book.
  const sharedPath = `${userId}/${sharedId}-${t}.png`;
  const hiddenPath = `${userId}/${hiddenId}-${t}.png`;
  for (const [id, path] of [[sharedId, sharedPath], [hiddenId, hiddenPath]]) {
    expect((await a.storage.from("covers").upload(path, png, { contentType: "image/png" })).error).toBeNull();
    expect((await a.from("books").update({ cover_path: path }).eq("id", id)).error).toBeNull();
  }

  const shareRes = await a.from("shelf_shares").insert({ shelf_id: shelfId }).select("token").single();
  expect(shareRes.error).toBeNull();
  const token = shareRes.data!.token;

  const anon = fresh();
  const shared = await anon.rpc("shared_shelf", { p_token: token });
  expect(shared.error).toBeNull();
  expect(shared.data).toHaveLength(1);
  expect(JSON.stringify(shared.data)).not.toContain(hiddenId);
  expect(JSON.stringify(shared.data)).not.toContain(`note ${t}`);
  expect(JSON.stringify(shared.data)).not.toContain(`quote ${t}`);

  // A wrong token returns nothing.
  for (const wrong of ["0".repeat(48), token.slice(0, -1) + (token.endsWith("0") ? "1" : "0"), "x", ""]) {
    const r = await anon.rpc("shared_shelf", { p_token: wrong });
    expect(r.data ?? []).toHaveLength(0);
  }

  // No anon query reads books, notes, quotes or shelf data.
  for (const table of ["books", "notes", "quotes", "shelves", "book_shelves", "shelf_shares", "tags"] as const) {
    const r = await anon.from(table).select("*");
    expect(r.data ?? []).toHaveLength(0);
  }

  // Anon cannot list covers; signing works only for a cover on a shared shelf.
  const covers = anon.storage.from("covers");
  expect((await covers.list("")).data ?? []).toHaveLength(0);
  expect((await covers.list(userId)).data ?? []).toHaveLength(0);
  expect((await covers.download(sharedPath)).error).not.toBeNull();
  expect((await covers.createSignedUrl(hiddenPath, 60)).error).not.toBeNull();
  expect((await covers.createSignedUrl(sharedPath, 60)).error).toBeNull();

  // After Stop sharing the token returns nothing and the cover can no longer be signed.
  expect((await a.from("shelf_shares").delete().eq("shelf_id", shelfId)).error).toBeNull();
  const revoked = await anon.rpc("shared_shelf", { p_token: token });
  expect(revoked.data ?? []).toHaveLength(0);
  expect((await covers.createSignedUrl(sharedPath, 60)).error).not.toBeNull();
});
