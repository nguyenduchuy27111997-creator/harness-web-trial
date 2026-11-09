import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addBookWithStatus, finishAndRateBook, pastReadsBlock } from "./reads";

// F063: no one else can see or change my reading history. Fresh accounts per test (golden principle 7).
const tag = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}`;
const year = new Date().getUTCFullYear();

test("another account sees none of my reads on /stats, /stats/<year> or my book's page", async ({ page }) => {
  test.setTimeout(180_000); // long journey on a dev server
  const t = tag();
  const title = `Middlemarch ${t}`;
  await signUpAs(page, `f063-a-${t}@example.com`);
  await addBookWithStatus(page, title, "Reading");
  await finishAndRateBook(page, 4);
  await page.getByRole("button", { name: "Read again" }).click();
  await expect(pastReadsBlock(page)).toBeVisible();
  await finishAndRateBook(page, 5);
  const bookUrl = page.url();
  expect(bookUrl).toMatch(/\/books\/[0-9a-f-]{36}$/);

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await signUpAs(page, `f063-b-${t}@example.com`);

  await page.goto("/stats");
  await expect(page.getByText("Books finished this year: 0")).toBeVisible();
  await expect(page.getByText(title)).toHaveCount(0);
  await expectAccessible(page);

  await page.goto(`/stats/${year}`);
  await expect(page.getByRole("heading", { name: `${year} in review` })).toBeVisible();
  await expect(page.getByText(`You finished no books in ${year}.`)).toBeVisible();
  await expect(page.getByText(title)).toHaveCount(0);
  await expect(page.getByRole("link", { name: title })).toHaveCount(0);
  await expectAccessible(page);

  const res = await page.goto(bookUrl);
  expect(res?.status()).toBe(404);
  await expect(page.getByRole("heading", { name: "Book not found" })).toBeVisible();
  await expect(page.getByText(title)).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Past reads" })).toHaveCount(0);
  await expect(page.getByText(/Started on|Finished on/)).toHaveCount(0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F063-foreign-book-history.png", { stylePath: "e2e/hide-dev-overlay.css" });
});

test("another session cannot read, update or delete my past read; mine is unchanged", async () => {
  const t = tag();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const signUp = async (who: string) => {
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { error } = await client.auth.signUp({ email: `f063-${who}-${t}@example.com`, password: "secret123" });
    expect(error).toBeNull();
    return client;
  };
  const a = await signUp("api-a");
  const b = await signUp("api-b");

  // A finishes a book and reads it again, which files the first read under reads.
  const { data: book, error: bookError } = await a
    .from("books")
    .insert({ title: `Middlemarch ${t}`, author: "George Eliot", status: "finished" })
    .select("id")
    .single();
  expect(bookError).toBeNull();
  const { error: rpcError } = await a.rpc("read_again", { p_book_id: book!.id });
  expect(rpcError).toBeNull();
  const { data: mine } = await a.from("reads").select("id, finished_on, rating").eq("book_id", book!.id);
  expect(mine).toHaveLength(1);
  const readId = mine![0].id;

  // B: read, update and delete by id touch nothing.
  const read = await b.from("reads").select("id").eq("id", readId);
  expect(read.data ?? []).toHaveLength(0);
  const update = await b.from("reads").update({ rating: 1 }).eq("id", readId).select();
  expect(update.data ?? []).toHaveLength(0);
  const del = await b.from("reads").delete().eq("id", readId).select();
  expect(del.data ?? []).toHaveLength(0);

  // A again: the read is unchanged.
  const { data: after } = await a.from("reads").select("id, finished_on, rating").eq("book_id", book!.id);
  expect(after).toEqual(mine);
});
