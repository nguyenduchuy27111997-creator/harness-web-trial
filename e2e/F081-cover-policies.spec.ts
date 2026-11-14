import { createClient } from "@supabase/supabase-js";
import { expect, test } from "@playwright/test";
import { expectAccessible } from "./a11y";
import { signUpAs } from "./accounts";
import { addAndOpenBook } from "./books";
import { coverFile, submitCover } from "./covers";

// F081 acceptance 3 and 4: covers sit in a private bucket only their owner can use, and deleting
// the book or the account deletes the file. Fresh accounts per test (golden principle 7).
const stamp = () => `${process.env.HARNESS_LANE ?? "local"}-${Date.now()}-${Math.floor(Math.random() * 1e4)}`;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const fresh = (key = anonKey) => createClient(url, key, { auth: { persistSession: false } });
const png = coverFile("image/png").buffer;

async function signUp(who: string, t: string) {
  const client = fresh();
  const { data, error } = await client.auth.signUp({ email: `f081-${who}-${t}@example.com`, password: "secret123" });
  expect(error).toBeNull();
  return { client, userId: data.user!.id };
}

// Files under the user's folder, read with the service role (bypasses the policies).
async function filesOf(userId: string) {
  const { data, error } = await fresh(process.env.SUPABASE_SERVICE_ROLE_KEY!).storage.from("covers").list(userId);
  expect(error).toBeNull();
  return data!.map((f) => f.name);
}

test("only the owner can read, write or delete a cover; the bucket is private", async () => {
  const t = stamp();
  const { client: a, userId } = await signUp("a", t);
  const { client: b, userId: bUserId } = await signUp("b", t);

  const { data: book, error: bookError } = await a
    .from("books")
    .insert({ title: `Covered ${t}`, author: "George Eliot", status: "want_to_read" })
    .select("id")
    .single();
  expect(bookError).toBeNull();
  const path = `${userId}/${book!.id}-${t}.png`;
  expect((await a.storage.from("covers").upload(path, png, { contentType: "image/png" })).error).toBeNull();

  // The owner reads it.
  expect((await a.storage.from("covers").download(path)).error).toBeNull();
  expect((await a.storage.from("covers").createSignedUrl(path, 60)).error).toBeNull();

  // B and an anonymous client cannot read, list, sign, write or delete it.
  for (const other of [b, fresh()]) {
    expect((await other.storage.from("covers").download(path)).error).not.toBeNull();
    expect((await other.storage.from("covers").createSignedUrl(path, 60)).error).not.toBeNull();
    expect((await other.storage.from("covers").list(userId)).data ?? []).toHaveLength(0);
    expect((await other.storage.from("covers").upload(`${userId}/${book!.id}-other.png`, png, { contentType: "image/png" })).error).not.toBeNull();
    await other.storage.from("covers").remove([path]);
  }
  // B cannot upload into their own folder under a book that is not theirs, or move the file.
  expect((await b.storage.from("covers").upload(`${bUserId}/${book!.id}-b.png`, png, { contentType: "image/png" })).error).not.toBeNull();
  expect((await b.storage.from("covers").move(path, `${bUserId}/${book!.id}-moved.png`)).error).not.toBeNull();
  // B cannot point their own book at A's file.
  const { data: bBook } = await b.from("books").insert({ title: `B ${t}`, author: "X", status: "want_to_read" }).select("id").single();
  expect((await b.from("books").update({ cover_path: path }).eq("id", bBook!.id)).error).not.toBeNull();

  // A's file is unchanged, and the bucket is not public.
  expect(await filesOf(userId)).toEqual([path.split("/")[1]]);
  expect((await fetch(`${url}/storage/v1/object/public/covers/${path}`)).ok).toBe(false);
});

test("deleting the book deletes its cover file", async ({ page }) => {
  const t = stamp();
  const email = `f081-del-book-${t}@example.com`;
  await signUpAs(page, email);
  await addAndOpenBook(page, `Gone ${t}`, "Reading");
  await submitCover(page, coverFile("image/png"), "Add cover");
  await expect(page.getByRole("img", { name: `Cover of Gone ${t}` })).toBeVisible();
  const { data } = await fresh().auth.signInWithPassword({ email, password: "secret123" });
  const userId = data.user!.id;
  expect(await filesOf(userId)).toHaveLength(1);

  await page.getByRole("button", { name: "Delete", exact: true }).last().click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete" }).click();
  await expect(page).toHaveURL(/\/books$/);
  expect(await filesOf(userId)).toHaveLength(0);
  await expect(page.getByText(`Gone ${t}`)).toHaveCount(0);
  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F081-book-deleted.png", { stylePath: "e2e/hide-dev-overlay.css" });
});

test("deleting the account deletes its cover files", async ({ page }) => {
  const t = stamp();
  const email = `f081-del-account-${t}@example.com`;
  await signUpAs(page, email);
  await addAndOpenBook(page, `Kept ${t}`, "Reading");
  await submitCover(page, coverFile("image/png"), "Add cover");
  await expect(page.getByRole("img", { name: `Cover of Kept ${t}` })).toBeVisible();
  const { data } = await fresh().auth.signInWithPassword({ email, password: "secret123" });
  const userId = data.user!.id;
  expect(await filesOf(userId)).toHaveLength(1);

  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Type DELETE to confirm").fill("DELETE");
  await dialog.getByRole("button", { name: "Delete my account" }).click();
  await expect(page).toHaveURL(/\/sign-in/);
  expect(await filesOf(userId)).toHaveLength(0);
  await page.mouse.move(0, 0);
  await expectAccessible(page);
  await expect(page).toHaveScreenshot("F081-account-deleted.png", { stylePath: "e2e/hide-dev-overlay.css" });
});
