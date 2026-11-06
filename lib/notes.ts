import type { SupabaseClient } from "@supabase/supabase-js";
import { isUuid } from "./books";
import type { FormState, Parsed } from "@/lib/forms";
import type { Database, Tables } from "@/lib/database.types";

export type Note = Pick<Tables<"notes">, "id" | "body" | "created_at">;

export type NoteFormState = FormState<"note"> & { saved?: true };

// Trimmed; required, at most 2,000 characters.
export function parseNote(formData: FormData): Parsed<string, "note"> {
  const note = String(formData.get("note") ?? "").trim();
  if (note.length === 0) return { ok: false, fieldErrors: { note: "Note is required" } };
  if (note.length > 2000) return { ok: false, fieldErrors: { note: "Note must be at most 2,000 characters" } };
  return { ok: true, value: note };
}

// Newest first; the id breaks ties. A malformed id matches no book, so it has no notes.
export async function listNotes(supabase: SupabaseClient<Database>, bookId: string): Promise<Note[]> {
  if (!isUuid(bookId)) return [];
  const { data, error } = await supabase
    .from("notes")
    .select("id, body, created_at")
    .eq("book_id", bookId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false });
  if (error) throw new Error(error.message);
  return data;
}

// user_id and created_at come from column defaults, never from the client.
export async function insertNote(supabase: SupabaseClient<Database>, bookId: string, body: string): Promise<"ok" | "missing"> {
  const { error } = await supabase.from("notes").insert({ book_id: bookId, body });
  if (!error) return "ok";
  if (error.code === "23503" || error.code === "42501") return "missing";
  throw new Error(error.message);
}

// The UTC date of the timestamp, like finished_on.
export function formatNoteDate(createdAt: string): string {
  return new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(new Date(createdAt));
}
