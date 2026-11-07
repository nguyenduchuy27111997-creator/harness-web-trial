import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/database.types";
import type { FieldErrors, FormState, Parsed } from "@/lib/forms";

export const BOOK_STATUSES = ["want_to_read", "reading", "finished"] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export type Book = Pick<Tables<"books">, "id" | "title" | "author" | "created_at"> & { status: BookStatus };

export type ShelfBook = Book & Pick<Tables<"books">, "rating" | "total_pages" | "current_page">;

export type BookDetail = Book & Pick<Tables<"books">, "started_on" | "finished_on" | "rating" | "review" | "total_pages" | "current_page">;

// Row Level Security limits the rows to the signed-in user's own.
export async function listBooks(supabase: SupabaseClient<Database>, status?: BookStatus): Promise<ShelfBook[]> {
  let query = supabase.from("books").select("id, title, author, status, created_at, rating, total_pages, current_page");
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as ShelfBook[];
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
    .select("id, title, author, status, created_at, started_on, finished_on, rating, review, total_pages, current_page")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data as BookDetail | null;
}

// A known status from the URL, else undefined (All).
export function parseStatusFilter(value: string | string[] | undefined): BookStatus | undefined {
  return typeof value === "string" && isBookStatus(value) ? value : undefined;
}

// Trimmed search text from the URL; empty means no search.
export function parseSearch(value: string | string[] | undefined): string | undefined {
  const q = typeof value === "string" ? value.trim() : "";
  return q || undefined;
}

// In memory over the one user's rows, so q never reaches a query (design M3).
export function filterBooks<T extends Book>(books: T[], q?: string): T[] {
  if (!q) return books;
  const needle = q.toLocaleLowerCase("en");
  return books.filter(
    (book) => book.title.toLocaleLowerCase("en").includes(needle) || book.author.toLocaleLowerCase("en").includes(needle),
  );
}

export type StatusCounts = Record<BookStatus | "all", number>;

export function countByStatus(books: Book[]): StatusCounts {
  const counts: StatusCounts = { all: books.length, want_to_read: 0, reading: 0, finished: 0 };
  for (const book of books) counts[book.status] += 1;
  return counts;
}

export type BookSort = "newest" | "title" | "rating";

export const SORT_LABELS: Record<BookSort, string> = {
  newest: "Newest added",
  title: "Title A to Z",
  rating: "Highest rated",
};

// A known sort from the URL, else newest.
export function parseSort(value: string | string[] | undefined): BookSort {
  return value === "title" || value === "rating" ? value : "newest";
}

// A new array, stable over the newest-first input, so ties stay newest first. Only Finished books count as rated.
export function sortBooks(books: ShelfBook[], sort: BookSort): ShelfBook[] {
  const rated = (b: ShelfBook) => (b.status === "finished" ? (b.rating ?? 0) : 0);
  if (sort === "title") return [...books].sort((a, b) => a.title.localeCompare(b.title, "en", { sensitivity: "base" }));
  if (sort === "rating") return [...books].sort((a, b) => rated(b) - rated(a));
  return [...books];
}

// The one URL builder for /books: parameters in the order status, q, sort, shelf.
export function booksHref({ status, q, sort, shelf }: { status?: BookStatus; q?: string; sort?: BookSort; shelf?: string }): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (q) params.set("q", q);
  if (sort && sort !== "newest") params.set("sort", sort);
  if (shelf) params.set("shelf", shelf);
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

export function parseBookFields(formData: FormData): Parsed<{ title: string; author: string }, "title" | "author"> {
  const title = String(formData.get("title") ?? "").trim();
  const author = String(formData.get("author") ?? "").trim();
  const fieldErrors: FieldErrors<"title" | "author"> = {};
  if (!title) fieldErrors.title = "Title is required";
  else if (title.length > 200) fieldErrors.title = "Title must be at most 200 characters";
  if (!author) fieldErrors.author = "Author is required";
  else if (author.length > 120) fieldErrors.author = "Author must be at most 120 characters";
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, value: { title, author } };
}

export function parseNewBook(formData: FormData): Parsed<NewBook, "title" | "author" | "status"> {
  const fields = parseBookFields(formData);
  const rawStatus = formData.get("status");
  const status = rawStatus === null || rawStatus === "" ? "want_to_read" : String(rawStatus);
  const fieldErrors: FieldErrors<"title" | "author" | "status"> = fields.ok ? {} : { ...fields.fieldErrors };
  if (!isBookStatus(status)) fieldErrors.status = "Choose a status";
  if (!fields.ok || !isBookStatus(status)) return { ok: false, fieldErrors };
  return { ok: true, value: { ...fields.value, status } };
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

// ("2026-10-01", "2026-10-12") -> "Read in 12 days"
export function formatReadDays(startedOn: string, finishedOn: string): string {
  const days = Math.round((Date.parse(`${finishedOn}T00:00:00Z`) - Date.parse(`${startedOn}T00:00:00Z`)) / 86_400_000) + 1;
  return `Read in ${days} ${days === 1 ? "day" : "days"}`;
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

export type EditBookFormState = FormState<"title" | "author"> & { saved?: true };

// false when no row changed: missing, or someone else's (RLS).
export async function updateBookFields(
  supabase: SupabaseClient<Database>,
  id: string,
  { title, author }: { title: string; author: string },
): Promise<boolean> {
  const { data, error } = await supabase.from("books").update({ title, author }).eq("id", id).select("id");
  if (error) throw new Error(error.message);
  return data.length > 0;
}

export type ProgressFormState = FormState<"total_pages" | "current_page"> & { saved?: true };

export function parseProgress(
  formData: FormData,
): Parsed<{ totalPages: number; currentPage: number }, "total_pages" | "current_page"> {
  const rawTotal = String(formData.get("total_pages") ?? "").trim();
  const rawCurrent = String(formData.get("current_page") ?? "").trim();
  const total = /^\d+$/.test(rawTotal) ? Number(rawTotal) : NaN;
  if (!(total >= 1 && total <= 10000)) {
    return { ok: false, fieldErrors: { total_pages: "Total pages must be a whole number from 1 to 10,000" } };
  }
  const current = /^\d+$/.test(rawCurrent) ? Number(rawCurrent) : NaN;
  if (!(current >= 0 && current <= total)) {
    return { ok: false, fieldErrors: { current_page: `Current page must be a whole number from 0 to ${total}` } };
  }
  return { ok: true, value: { totalPages: total, currentPage: current } };
}

// false when no row changed: missing, someone else's (RLS), or not Reading.
export async function updateBookProgress(
  supabase: SupabaseClient<Database>,
  id: string,
  { totalPages, currentPage }: { totalPages: number; currentPage: number },
): Promise<boolean> {
  const { data, error } = await supabase
    .from("books")
    .update({ total_pages: totalPages, current_page: currentPage })
    .eq("id", id)
    .eq("status", "reading")
    .select("id");
  if (error) throw new Error(error.message);
  return data.length > 0;
}

export function progressPercent(current: number, total: number): number {
  return Math.round((current / total) * 100);
}

export function formatProgress(current: number, total: number): string {
  return `Page ${current} of ${total} (${progressPercent(current, total)}%)`;
}

export type DatesFormState = FormState<"started_on" | "finished_on"> & { saved?: true };

function isValidDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

// Shape only: empty or malformed dates. `finished_on` is read only for a finished book.
export function parseReadingDates(
  formData: FormData,
  status: BookStatus,
): Parsed<{ started_on: string | null; finished_on?: string }, "started_on" | "finished_on"> {
  const started = String(formData.get("started_on") ?? "").trim();
  const finished = String(formData.get("finished_on") ?? "").trim();
  const fieldErrors: FieldErrors<"started_on" | "finished_on"> = {};
  if (started && !isValidDate(started)) fieldErrors.started_on = "Enter a valid date";
  if (status === "finished") {
    if (!finished) fieldErrors.finished_on = "Finish date is required";
    else if (!isValidDate(finished)) fieldErrors.finished_on = "Enter a valid date";
  }
  if (Object.keys(fieldErrors).length > 0) return { ok: false, fieldErrors };
  return { ok: true, value: status === "finished" ? { started_on: started || null, finished_on: finished } : { started_on: started || null } };
}

// false when no row changed: missing, someone else's (RLS), or the status changed meanwhile.
export async function updateReadingDates(
  supabase: SupabaseClient<Database>,
  id: string,
  status: BookStatus,
  dates: { started_on: string | null; finished_on?: string },
): Promise<boolean> {
  const { data, error } = await supabase.from("books").update(dates).eq("id", id).eq("status", status).select("id");
  if (error) throw new Error(error.message);
  return data.length > 0;
}
