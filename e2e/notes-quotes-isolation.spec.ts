import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { openNewBookPage } from "./notes";

// F051: no one else can see or change my notes and quotes. Fresh accounts per run (golden principle 7).
const tag = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
const QUOTE = "It is a narrow mind which cannot look at a subject from various points of view.";

test("another account sees none of my notes and quotes", async ({ page }) => {
  test.slow();
  const t = tag();
  await signUpAs(page, `f051-a-${t}@example.com`);
  await openNewBookPage(page, "Middlemarch", "George Eliot");
  await expect(page).toHaveURL(/\/books\/[0-9a-f-]{36}$/);
  const bookUrl = page.url();

  const notes = page.getByRole("region", { name: "Notes" });
  await notes.getByRole("textbox", { name: "Note" }).fill("Private note from A");
  await notes.getByRole("button", { name: "Add note" }).click();
  await expect(notes.getByRole("listitem").first()).toContainText("Private note from A");
  const quoteItem = page.getByRole("list", { name: "Quotes from this book" }).getByRole("listitem").first();
  // The add form resets after a save, which can overwrite a fill made too early, so retry until it shows.
  await expect(async () => {
    await page.getByRole("textbox", { name: "Quote", exact: true }).fill(QUOTE);
    await page.getByRole("button", { name: "Save quote" }).click();
    await expect(quoteItem).toContainText(QUOTE, { timeout: 3000 });
  }).toPass();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await signUpAs(page, `f051-b-${t}@example.com`);

  await page.goto("/quotes");
  await expect(page.getByText("You have no quotes yet.")).toBeVisible();
  await page.goto("/quotes?q=narrow");
  await expect(page.getByText(QUOTE)).toHaveCount(0);
  await expect(page.getByRole("list", { name: "My quotes" })).toHaveCount(0);

  const res = await page.goto(bookUrl);
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Book not found" })).toBeVisible();
  await expect(page.getByText("Private note from A")).toHaveCount(0);
  await expect(page.getByText(QUOTE)).toHaveCount(0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F051-foreign-book.png", { stylePath: "e2e/hide-dev-overlay.css" });
});

test("another session cannot read, update or delete my note and quote", async () => {
  const t = tag();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const signUp = async (who: string) => {
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await client.auth.signUp({ email: `f051-${who}-${t}@example.com`, password: "secret123" });
    expect(error).toBeNull();
    return client;
  };
  const a = await signUp("api-a");
  const book = await a.from("books").insert({ title: "Middlemarch", author: "George Eliot" }).select("id").single();
  expect(book.error).toBeNull();
  const bookId = book.data!.id;
  const note = await a.from("notes").insert({ book_id: bookId, body: "Private note from A" }).select("id").single();
  const quote = await a.from("quotes").insert({ book_id: bookId, body: QUOTE }).select("id").single();
  expect(note.error).toBeNull();
  expect(quote.error).toBeNull();
  const noteId = note.data!.id;
  const quoteId = quote.data!.id;

  const b = await signUp("api-b");
  for (const [table, id] of [["notes", noteId], ["quotes", quoteId]] as const) {
    expect((await b.from(table).select("id").eq("id", id)).data).toEqual([]);
    const upd = await b.from(table).update({ body: "hacked" }).eq("id", id).select("id");
    expect(upd.data ?? []).toEqual([]);
    const del = await b.from(table).delete().eq("id", id).select("id");
    expect(del.data ?? []).toEqual([]);
  }
  expect((await b.from("quotes").select("id").ilike("body", "%narrow%")).data).toEqual([]);

  const own = await a.from("notes").select("body").eq("id", noteId);
  expect(own.data).toEqual([{ body: "Private note from A" }]);
  const ownQuote = await a.from("quotes").select("body").eq("id", quoteId);
  expect(ownQuote.data).toEqual([{ body: QUOTE }]);
});
