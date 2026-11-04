import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/database.types";
import type { FieldErrors, FormState, Parsed } from "@/lib/forms";

export const BOOK_STATUSES = ["want_to_read", "reading", "finished"] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export type Book = Pick<Tables<"books">, "id" | "title" | "author" | "created_at"> & { status: BookStatus };

export type BookDetail = Book & Pick<Tables<"books">, "finished_on" | "rating" | "review">;

// Row Level Security limits the rows to the signed-in user's own.
export async function listBooks(supabase: SupabaseClient<Database>, status?: BookStatus): Promise<Book[]> {
  let query = supabase.from("books").select("id, title, author, status, created_at");
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Book[];
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID.test(value);
}

// Another user's id, a missing one and a malformed one all give null (RLS hides foreign rows).
export async function getBook(supabase: SupabaseClient<Database>, id: string): Promise<BookDetail | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await supabase
    .from("books")
    .select("id, title, author, status, created_at, finished_on, rating, review")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as BookDetail | null;
}

// A known status from the URL, else undefined (All).
export function parseStatusFilter(value: string | string[] | undefined): BookStatus | undefined {
  return typeof value === "string" && isBookStatus(value) ? value : undefined;
}

// A trimmed search from the URL, else undefined (no search).
export function parseSearch(value: string | string[] | undefined): string | undefined {
  return (typeof value === "string" && value.trim()) || undefined;
}

// Rows whose title or author contains q, ignoring case.
export function filterBooks<T extends Book>(books: T[], q?: string): T[] {
  if (!q) return books;
  const needle = q.toLocaleLowerCase("en");
  return books.filter((b) => `${b.title}\n${b.author}`.toLocaleLowerCase("en").includes(needle));
}

// The one builder for /books links: parameters in the order status, q.
export function booksHref({ status, q }: { status?: BookStatus; q?: string }): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  const query = params.toString();
  return query ? `/books?${query}` : "/books";
}

export const STATUS_LABELS: Record<BookStatus, string> = {
  want_to_read: "Want to read",
  reading: "Reading",
  finished: "Finished",
};

export type BookFormState = FormState<"title" | "author" | "status">;

type NewBook = { title: string; author: string; status: BookStatus };

export function parseNewBook(formData: FormData): Parsed<NewBook, "title" | "author" | "status"> {
  const title = String(formData.get("title") ?? "").trim();
  const author = String(formData.get("author") ?? "").trim();
  const rawStatus = formData.get("status");
  const status = rawStatus === null || rawStatus === "" ? "want_to_read" : String(rawStatus);
  const fieldErrors: FieldErrors<"title" | "author" | "status"> = {};
  if (!title) fieldErrors.title = "Title is required";
  else if (title.length > 200) fieldErrors.title = "Title must be at most 200 characters";
  if (!author) fieldErrors.author = "Author is required";
  else if (author.length > 120) fieldErrors.author = "Author must be at most 120 characters";
  if (!isBookStatus(status)) fieldErrors.status = "Choose a status";
  if (Object.keys(fieldErrors).length > 0 || !isBookStatus(status)) return { ok: false, fieldErrors };
  return { ok: true, value: { title, author, status } };
}

function isBookStatus(value: string): value is BookStatus {
  return (BOOK_STATUSES as readonly string[]).includes(value);
}

// user_id is filled by the column default (auth.uid()), never sent by the app.
export async function insertBook(supabase: SupabaseClient<Database>, input: NewBook): Promise<void> {
  const { error } = await supabase.from("books").insert(input);
  if (error) throw new Error(error.message);
}

export type StatusFormState = FormState<"status"> & { saved?: true };

export function parseStatus(formData: FormData): Parsed<BookStatus, "status"> {
  const status = String(formData.get("status") ?? "");
  if (!isBookStatus(status)) return { ok: false, fieldErrors: { status: "Choose a status" } };
  return { ok: true, value: status };
}

// false when no row changed: missing, or someone else's (RLS).
export async function updateBookStatus(
  supabase: SupabaseClient<Database>,
  id: string,
  status: BookStatus,
): Promise<boolean> {
  const { data, error } = await supabase.from("books").update({ status }).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  return data.length > 0;
}

// "2026-11-02" -> "November 2, 2026"
export function formatFinishDate(date: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

export type RatingFormState = FormState<"rating"> & { saved?: true };

export function parseRating(formData: FormData): Parsed<number, "rating"> {
  const raw = String(formData.get("rating") ?? "");
  const rating = /^[1-5]$/.test(raw) ? Number(raw) : null;
  if (rating === null) return { ok: false, fieldErrors: { rating: "Choose a rating from 1 to 5" } };
  return { ok: true, value: rating };
}

// false when no row changed: missing, someone else's (RLS), or not Finished.
export async function updateBookRating(supabase: SupabaseClient<Database>, id: string, rating: number): Promise<boolean> {
  const { data, error } = await supabase.from("books").update({ rating }).eq("id", id).eq("status", "finished").select("id");
  if (error) throw new Error(error.message);
  return data.length > 0;
}

export async function removeBook(supabase: SupabaseClient<Database>, id: string): Promise<boolean> {
  const { data, error } = await supabase.from("books").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  return data.length > 0;
}

export type ReviewFormState = FormState<"review"> & { saved?: true };

// Trimmed; empty is allowed and saved as null.
export function parseReview(formData: FormData): Parsed<string, "review"> {
  const review = String(formData.get("review") ?? "").trim();
  if (review.length > 2000) return { ok: false, fieldErrors: { review: "Review must be at most 2,000 characters" } };
  return { ok: true, value: review };
}

// false when no row changed: missing, someone else's (RLS), or not Finished.
export async function updateBookReview(supabase: SupabaseClient<Database>, id: string, review: string | null): Promise<boolean> {
  const { data, error } = await supabase.from("books").update({ review }).eq("id", id).eq("status", "finished").select("id");
  if (error) throw new Error(error.message);
  return data.length > 0;
}
