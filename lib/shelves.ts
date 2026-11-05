import type { SupabaseClient } from "@supabase/supabase-js";
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
