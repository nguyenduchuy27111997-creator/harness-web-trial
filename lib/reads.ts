import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "./books";
import type { Database, Tables } from "./database.types";

export type PastRead = Pick<Tables<"reads">, "id" | "started_on" | "finished_on" | "rating">;

// Moves the finished read into reads and starts a new one; false when the book is missing, foreign or not finished.
export async function readAgain(supabase: SupabaseClient<Database>, bookId: string): Promise<boolean> {
  const { data, error } = await supabase.rpc("read_again", { p_book_id: bookId });
  if (error) throw new Error(error.message);
  return data === true;
}

// Newest first; a malformed id matches no book.
export async function listPastReads(supabase: SupabaseClient<Database>, bookId: string): Promise<PastRead[]> {
  if (!isUuid(bookId)) return [];
  const { data, error } = await supabase
    .from("reads")
    .select("id, started_on, finished_on, rating")
    .eq("book_id", bookId)
    .order("finished_on", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}
