import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "@/lib/books";
import type { Database } from "@/lib/database.types";

export type QueuedBook = { bookId: string; title: string; author: string; position: number };

export async function listUpNext(supabase: SupabaseClient<Database>): Promise<QueuedBook[]> {
  const { data, error } = await supabase
    .from("up_next")
    .select("book_id, position, book:books!inner(title, author, status)")
    .eq("book.status", "want_to_read")
    .order("position")
    .order("created_at")
    .order("book_id");
  if (error) throw new Error(error.message);
  return data.map((row) => ({
    bookId: row.book_id,
    title: row.book.title,
    author: row.book.author,
    position: row.position,
  }));
}

export async function isQueued(supabase: SupabaseClient<Database>, bookId: string): Promise<boolean> {
  if (!isUuid(bookId)) return false;
  const { data, error } = await supabase.from("up_next").select("book_id").eq("book_id", bookId);
  if (error) throw new Error(error.message);
  return data.length > 0;
}

export async function queueBook(supabase: SupabaseClient<Database>, bookId: string): Promise<boolean> {
  // position comes from the insert trigger and is not insertable (column grant), so skip the generated type's required field.
  const { error } = await supabase.from("up_next").insert({ book_id: bookId } as never);
  if (error) {
    if (error.code === "23505" || error.code === "23514") return false;
    throw new Error(error.message);
  }
  return true;
}

export async function unqueueBook(supabase: SupabaseClient<Database>, bookId: string): Promise<boolean> {
  const { data, error } = await supabase.from("up_next").delete().eq("book_id", bookId).select("book_id");
  if (error) throw new Error(error.message);
  return data.length > 0;
}

export async function moveQueued(supabase: SupabaseClient<Database>, bookId: string, up: boolean): Promise<boolean> {
  const { data, error } = await supabase.rpc("move_up_next", { p_book_id: bookId, p_up: up });
  if (error) throw new Error(error.message);
  return data;
}
