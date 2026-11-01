import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database, Tables } from "@/lib/database.types";

export const BOOK_STATUSES = ["want_to_read", "reading", "finished"] as const;
export type BookStatus = (typeof BOOK_STATUSES)[number];

export type Book = Pick<Tables<"books">, "id" | "title" | "author" | "created_at"> & { status: BookStatus };

// Row Level Security limits the rows to the signed-in user's own.
export async function listBooks(supabase: SupabaseClient<Database>): Promise<Book[]> {
  const { data, error } = await supabase
    .from("books")
    .select("id, title, author, status, created_at")
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return data as Book[];
}
