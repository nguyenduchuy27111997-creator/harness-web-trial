import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { FormState, Parsed } from "@/lib/forms";

export const NAME_REQUIRED = "Enter a name";
export const NAME_TOO_LONG = "Names are at most 40 characters";

export type NameFormState = FormState<"display_name"> & { saved?: true };

export function parseDisplayName(formData: FormData): Parsed<string, "display_name"> {
  const name = String(formData.get("display_name") ?? "").trim();
  if (!name) return { ok: false, fieldErrors: { display_name: NAME_REQUIRED } };
  if (name.length > 40) return { ok: false, fieldErrors: { display_name: NAME_TOO_LONG } };
  return { ok: true, value: name };
}

// Row Level Security limits the row to the signed-in user's own; no row means no display name.
export async function getDisplayName(supabase: SupabaseClient<Database>): Promise<string | null> {
  const { data, error } = await supabase.from("profiles").select("display_name").maybeSingle();
  if (error) throw new Error(error.message);
  return data?.display_name ?? null;
}

// user_id comes from the column default (auth.uid()), never from the client.
export async function saveDisplayName(supabase: SupabaseClient<Database>, name: string): Promise<void> {
  const { error } = await supabase.from("profiles").upsert({ display_name: name }, { onConflict: "user_id" });
  if (error) throw new Error(error.message);
}
