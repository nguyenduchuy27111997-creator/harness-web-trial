import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addQueuedBook, addAndOpenBook, tagOpenBook } from "./books";
import { IMPORT_HEADER, importFile, openLibrary } from "./imports";

// F075: no one else can see or change my tags, queue, display name or imported books.
// Fresh accounts per test (golden principle 7).
const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;

test("account B sees none of A's tags, queue, name or imported books; A's are unchanged", async ({ page }) => {
  test.setTimeout(240_000); // long journey on a dev server
  const t = stamp();
  const emailA = `f075-a-${t}@example.com`;
  const tagged = `Tagged ${t}`;
  const queuedOne = `Queued One ${t}`;
  const queuedTwo = `Queued Two ${t}`;
  const imported = `Imported ${t}`;
  const name = `Ada${Math.floor(Math.random() * 1e4)}`;
  const header = page.getByRole("banner");

  // A: tag, queue two books, set a name, import a CSV.
  await signUpAs(page, emailA);
  await addAndOpenBook(page, tagged, "Reading");
  await expect(page.getByRole("heading", { name: tagged })).toBeVisible();
  await tagOpenBook(page, ["classic"]);
  await addQueuedBook(page, queuedOne);
  await addQueuedBook(page, queuedTwo);
  await page.goto("/settings");
  await page.getByLabel("Display name").fill(name);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(header.getByText(name, { exact: true })).toBeVisible();
  await openLibrary(page);
  await importFile(page, [IMPORT_HEADER, `${imported},Ann Author,want_to_read,,200,,`, ""].join("\n"));
  await page.getByRole("button", { name: "Add 1 book" }).click();
  await expect(page.getByText(/Added 1 book/)).toBeVisible();

  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  // B sees nothing of it.
  await signUpAs(page, `f075-b-${t}@example.com`);
  await expect(header.getByText(name, { exact: true })).toHaveCount(0);
  for (const title of [tagged, queuedOne, queuedTwo, imported]) await expect(page.getByText(title)).toHaveCount(0);

  await page.goto("/tags");
  await expect(page.getByText("No tags yet")).toBeVisible();
  await expect(page.getByText("classic")).toHaveCount(0);
  await expectAccessible(page);

  await page.goto("/up-next");
  await expect(page.getByText("Nothing up next")).toBeVisible();
  await expect(page.getByText(queuedOne)).toHaveCount(0);
  await expectAccessible(page);

  await page.goto("/books?tag=classic");
  await expect(page.getByRole("heading", { name: "My books" }).or(page.getByRole("heading", { level: 1 }))).toBeVisible();
  for (const title of [tagged, queuedOne, queuedTwo, imported]) await expect(page.getByText(title)).toHaveCount(0);
  await expectAccessible(page);

  await page.goto("/books");
  for (const title of [tagged, queuedOne, queuedTwo, imported]) await expect(page.getByText(title)).toHaveCount(0);
  await expect(header.getByText(name, { exact: true })).toHaveCount(0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F075-b-empty-shelf.png", { stylePath: "e2e/hide-dev-overlay.css" });

  // A again: everything is unchanged.
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);
  await page.getByLabel("Email").fill(emailA);
  await page.getByLabel("Password").fill("secret123");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/books$/);
  await expect(header.getByText(name, { exact: true })).toBeVisible();
  for (const title of [tagged, queuedOne, queuedTwo, imported]) await expect(page.getByRole("link", { name: title })).toBeVisible();
  await page.goto("/tags");
  await expect(page.getByRole("link", { name: /classic/ })).toBeVisible();
  await page.goto("/up-next");
  await expect(page.getByRole("link", { name: queuedOne })).toBeVisible();
  await expect(page.getByRole("link", { name: queuedTwo })).toBeVisible();
  await page.goto("/books?tag=classic");
  await expect(page.getByRole("link", { name: tagged })).toBeVisible();
});

test("another session cannot read, update or delete my tags, queue rows or profile; mine are unchanged", async () => {
  const t = stamp();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const signUp = async (who: string) => {
    const client = createClient(url, key, { auth: { persistSession: false } });
    const { data, error } = await client.auth.signUp({ email: `f075-${who}-${t}@example.com`, password: "secret123" });
    expect(error).toBeNull();
    return { client, userId: data.user!.id };
  };
  const { client: a, userId } = await signUp("api-a");
  const { client: b } = await signUp("api-b");

  // A: a Want to read book that is tagged and queued, and a display name.
  const { data: book, error: bookError } = await a
    .from("books")
    .insert({ title: `Queued ${t}`, author: "George Eliot", status: "want_to_read" })
    .select("id")
    .single();
  expect(bookError).toBeNull();
  const bookId = book!.id;
  const { data: tag, error: tagError } = await a.from("tags").insert({ name: "classic" }).select("id").single();
  expect(tagError).toBeNull();
  const tagId = tag!.id;
  expect((await a.from("book_tags").insert({ book_id: bookId, tag_id: tagId })).error).toBeNull();
  expect((await a.from("up_next").insert({ book_id: bookId })).error).toBeNull();
  expect((await a.from("profiles").insert({ display_name: "Ada" })).error).toBeNull();

  const snapshot = async () => ({
    tags: (await a.from("tags").select("id, name").eq("id", tagId)).data,
    bookTags: (await a.from("book_tags").select("book_id, tag_id").eq("book_id", bookId)).data,
    queue: (await a.from("up_next").select("book_id, position").eq("book_id", bookId)).data,
    profile: (await a.from("profiles").select("user_id, display_name").eq("user_id", userId)).data,
  });
  const mine = await snapshot();
  expect(mine.tags).toHaveLength(1);
  expect(mine.bookTags).toHaveLength(1);
  expect(mine.queue).toHaveLength(1);
  expect(mine.profile).toEqual([{ user_id: userId, display_name: "Ada" }]);

  // B: read, update and delete by id touch nothing.
  const none = (r: { data: unknown[] | null }) => expect(r.data ?? []).toHaveLength(0);
  none(await b.from("tags").select("id").eq("id", tagId));
  none(await b.from("tags").update({ name: "hacked" }).eq("id", tagId).select());
  none(await b.from("tags").delete().eq("id", tagId).select());
  none(await b.from("book_tags").select("tag_id").eq("tag_id", tagId));
  none(await b.from("book_tags").delete().eq("book_id", bookId).select());
  none(await b.from("up_next").select("book_id").eq("book_id", bookId));
  none(await b.from("up_next").update({ position: 99 }).eq("book_id", bookId).select());
  none(await b.from("up_next").delete().eq("book_id", bookId).select());
  none(await b.from("profiles").select("user_id").eq("user_id", userId));
  none(await b.from("profiles").update({ display_name: "Hacked" }).eq("user_id", userId).select());
  // B cannot queue or tag A's book either.
  expect((await b.from("up_next").insert({ book_id: bookId })).error).not.toBeNull();
  expect((await b.from("book_tags").insert({ book_id: bookId, tag_id: tagId })).error).not.toBeNull();
  const moved = await b.rpc("move_up_next", { p_book_id: bookId, p_up: true });
  expect(moved.data).toBe(false);

  // A again: unchanged.
  expect(await snapshot()).toEqual(mine);
});
