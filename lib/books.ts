import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/database.types";
import type { FieldErrors, FormState, Parsed } from "@/lib/forms";

export const BOOK_STATUSES = ["want_to_read", "reading", "finished"] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export type Book = Pick<Tables<"books">, "id" | "title" | "author" | "created_at"> & { status: BookStatus };

// Row Level Security limits the rows to the signed-in user's own.
export async function listBooks(supabase: SupabaseClient<Database>, status?: BookStatus): Promise<Book[]> {
  let query = supabase.from("books").select("id, title, author, status, created_at");
  if (status) query = query.eq("status", status);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Book[];
}

// A known status from the URL, else undefined (All).
export function parseStatusFilter(value: string | string[] | undefined): BookStatus | undefined {
  return typeof value === "string" && isBookStatus(value) ? value : undefined;
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
