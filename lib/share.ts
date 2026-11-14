import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookStatus } from "@/lib/books";
import type { Database } from "@/lib/database.types";

type Client = SupabaseClient<Database>;

export type SharedBook = { id: string; title: string; author: string; status: BookStatus; rating: number | null; coverPath: string | null };
export type SharedShelf = { name: string; books: SharedBook[] };

// The generated type marks every column non-null; an empty shelf has null book columns, and rating/cover may be null.
type SharedShelfRow = {
  shelf_name: string;
  book_id: string | null;
  title: string | null;
  author: string | null;
  status: string | null;
  rating: number | null;
  cover_path: string | null;
  added_at: string | null;
};

const TOKEN = /^[0-9a-f]{48}$/;

// Shelf id -> token for the user's shared shelves, in one query.
export async function listShares(supabase: Client): Promise<Map<string, string>> {
  const { data, error } = await supabase.from("shelf_shares").select("shelf_id, token");
  if (error) throw new Error(error.message);
  return new Map(data.map((row) => [row.shelf_id, row.token]));
}

// The shelf's token, new or existing; null when the shelf is not the user's.
export async function shareShelf(supabase: Client, shelfId: string): Promise<string | null> {
  const { data, error } = await supabase.from("shelf_shares").insert({ shelf_id: shelfId }).select("token").maybeSingle();
  if (data) return data.token;
  if (error && error.code !== "23505") return null;
  const { data: existing, error: readError } = await supabase.from("shelf_shares").select("token").eq("shelf_id", shelfId).maybeSingle();
  if (readError) throw new Error(readError.message);
  return existing?.token ?? null;
}

export async function stopSharing(supabase: Client, shelfId: string): Promise<void> {
  const { error } = await supabase.from("shelf_shares").delete().eq("shelf_id", shelfId);
  if (error) throw new Error(error.message);
}

export async function getSharedShelf(supabase: Client, token: string): Promise<SharedShelf | null> {
  if (!TOKEN.test(token)) return null;
  const { data, error } = await supabase.rpc("shared_shelf", { p_token: token }).overrideTypes<SharedShelfRow[], { merge: false }>();
  if (error) throw new Error(error.message);
  if (!data || data.length === 0) return null;
  const books: SharedBook[] = [];
  for (const row of data) {
    if (row.book_id === null) continue;
    books.push({
      id: row.book_id,
      title: row.title ?? "",
      author: row.author ?? "",
      status: row.status as BookStatus,
      rating: row.rating,
      coverPath: row.cover_path,
    });
  }
  return { name: data[0].shelf_name, books };
}
