import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "./books";
import type { Database, Tables } from "@/lib/database.types";
import type { FormState, Parsed } from "@/lib/forms";

export type Shelf = Pick<Tables<"shelves">, "id" | "name">;

export const SHELF_NAME_TAKEN = "You already have a shelf with that name";

export type ShelfFormState = FormState<"name"> & { saved?: true };

export function parseShelfName(formData: FormData): Parsed<string, "name"> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0) return { ok: false, fieldErrors: { name: "Name is required" } };
  if (name.length > 40) return { ok: false, fieldErrors: { name: "Name must be at most 40 characters" } };
  return { ok: true, value: name };
}

// Row Level Security limits the rows to the signed-in user's own.
export async function listShelves(supabase: SupabaseClient<Database>): Promise<Shelf[]> {
  const { data, error } = await supabase.from("shelves").select("id, name").order("name").order("id");
  if (error) throw new Error(error.message);
  return data;
}

// user_id comes from the column default (auth.uid()), never from the client.
export async function insertShelf(supabase: SupabaseClient<Database>, name: string): Promise<"ok" | "taken"> {
  const { error } = await supabase.from("shelves").insert({ name });
  if (error?.code === "23505") return "taken";
  if (error) throw new Error(error.message);
  return "ok";
}

export async function updateShelfName(
  supabase: SupabaseClient<Database>,
  id: string,
  name: string,
): Promise<"ok" | "taken" | "missing"> {
  const { data, error } = await supabase.from("shelves").update({ name }).eq("id", id).select("id");
  if (error?.code === "23505") return "taken";
  if (error) throw new Error(error.message);
  return data.length === 0 ? "missing" : "ok";
}

export async function removeShelf(supabase: SupabaseClient<Database>, id: string): Promise<boolean> {
  const { data, error } = await supabase.from("shelves").delete().eq("id", id).select("id");
  if (error) throw new Error(error.message);
  return data.length > 0;
}

// A malformed id matches no book, so it has no shelves (and never reaches Postgres as a bad uuid).
export async function listBookShelfIds(supabase: SupabaseClient<Database>, bookId: string): Promise<string[]> {
  if (!isUuid(bookId)) return [];
  const { data, error } = await supabase.from("book_shelves").select("shelf_id").eq("book_id", bookId);
  if (error) throw new Error(error.message);
  return data.map((row) => row.shelf_id);
}

export type AddToShelfFormState = FormState<"shelf"> & { saved?: true };

export function parseShelfChoice(formData: FormData): Parsed<string, "shelf"> {
  const shelf = String(formData.get("shelf") ?? "");
  if (!isUuid(shelf)) return { ok: false, fieldErrors: { shelf: "Choose a shelf" } };
  return { ok: true, value: shelf };
}

// The composite foreign keys reject a book or shelf that is not the user's (23503); RLS rejects a forged owner (42501).
export async function addBookToShelf(
  supabase: SupabaseClient<Database>,
  bookId: string,
  shelfId: string,
): Promise<"ok" | "missing"> {
  const { error } = await supabase.from("book_shelves").insert({ book_id: bookId, shelf_id: shelfId });
  if (!error || error.code === "23505") return "ok";
  if (error.code === "23503" || error.code === "42501") return "missing";
  throw new Error(error.message);
}
