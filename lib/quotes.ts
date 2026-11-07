import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "./books";
import type { Database, Tables } from "@/lib/database.types";
import type { FormState, Parsed } from "@/lib/forms";

export type BookQuote = Pick<Tables<"quotes">, "id" | "body" | "page" | "created_at">;

export type Quote = BookQuote & { book: Pick<Tables<"books">, "id" | "title"> };

export type QuoteFormState = FormState<"quote" | "page"> & { saved?: true };

// The page bound is the book's total pages when it has one (decision 0009), else the database's 10,000.
export function parseQuote(
  formData: FormData,
  totalPages: number | null,
): Parsed<{ body: string; page: number | null }, "quote" | "page"> {
  const body = String(formData.get("quote") ?? "").trim();
  const rawPage = String(formData.get("page") ?? "").trim();
  const max = totalPages ?? 10000;
  const fieldErrors: { quote?: string; page?: string } = {};
  if (body.length === 0) fieldErrors.quote = "Quote is required";
  else if (body.length > 1000) fieldErrors.quote = "Quote must be at most 1,000 characters";
  const page = rawPage === "" ? null : Number(rawPage);
  if (page !== null && (!/^\d+$/.test(rawPage) || page < 1 || page > max)) {
    fieldErrors.page = `Page must be a whole number from 1 to ${max.toLocaleString("en-US")}`;
  }
  if (fieldErrors.quote || fieldErrors.page) return { ok: false, fieldErrors };
  return { ok: true, value: { body, page } };
}

// Row Level Security limits the rows to the signed-in user's own. A malformed id matches no book, so it has no quotes.
export async function listBookQuotes(supabase: SupabaseClient<Database>, bookId: string): Promise<BookQuote[]> {
  if (!isUuid(bookId)) return [];
  const { data, error } = await supabase
    .from("quotes")
    .select("id, body, page, created_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

// All the signed-in user's quotes (Row Level Security), newest first, each with its book.
export async function listQuotes(supabase: SupabaseClient<Database>): Promise<Quote[]> {
  const { data, error } = await supabase
    .from("quotes")
    .select("id, body, page, created_at, book:books(id, title)")
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

// The composite foreign key rejects a book that is not the user's or is gone (23503); RLS rejects a forged owner (42501).
export async function insertQuote(
  supabase: SupabaseClient<Database>,
  bookId: string,
  quote: { body: string; page: number | null },
): Promise<"ok" | "missing"> {
  const { error } = await supabase.from("quotes").insert({ book_id: bookId, body: quote.body, page: quote.page });
  if (!error) return "ok";
  if (error.code === "23503" || error.code === "42501") return "missing";
  throw new Error(error.message);
}

// Filtered on the book too, so a quote id that belongs to another book matches nothing.
export async function removeQuote(supabase: SupabaseClient<Database>, bookId: string, id: string): Promise<boolean> {
  const { data, error } = await supabase.from("quotes").delete().eq("id", id).eq("book_id", bookId).select("id");
  if (error) throw new Error(error.message);
  return data.length > 0;
}

// Filtering on the book as well as the id keeps the bound book, the page limit and the changed row in agreement.
export async function updateQuote(
  supabase: SupabaseClient<Database>,
  bookId: string,
  id: string,
  quote: { body: string; page: number | null },
): Promise<boolean> {
  const { data, error } = await supabase
    .from("quotes")
    .update({ body: quote.body, page: quote.page })
    .eq("id", id)
    .eq("book_id", bookId)
    .select("id");
  if (error) throw new Error(error.message);
  return data.length > 0;
}
