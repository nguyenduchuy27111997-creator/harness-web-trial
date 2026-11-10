import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { FormState, Parsed } from "@/lib/forms";
import { isUuid } from "./books";

export type Tag = { id: string; name: string };

export const TAG_MAX = 24;
export const TAGS_PER_BOOK = 10;

export type TagFormState = FormState<"name"> & { saved?: true };

export function parseTagName(formData: FormData): Parsed<string, "name"> {
  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0) return { ok: false, fieldErrors: { name: "Enter a tag" } };
  if (name.length > TAG_MAX) return { ok: false, fieldErrors: { name: "Tags are at most 24 characters" } };
  return { ok: true, value: name };
}

export function sortTags<T extends { name: string }>(tags: T[]): T[] {
  return [...tags].sort((a, b) => a.name.localeCompare(b.name, "en", { sensitivity: "base" }));
}

// Row Level Security limits the rows to the signed-in user's own.
export async function listBookTags(supabase: SupabaseClient<Database>, bookId: string): Promise<Tag[]> {
  if (!isUuid(bookId)) return [];
  const { data, error } = await supabase.from("book_tags").select("tag:tags(id, name)").eq("book_id", bookId);
  if (error) throw new Error(error.message);
  const tags: Tag[] = [];
  for (const row of data) if (row.tag) tags.push(row.tag);
  return sortTags(tags);
}

export async function listTagsForBooks(supabase: SupabaseClient<Database>): Promise<Map<string, string[]>> {
  const { data, error } = await supabase.from("book_tags").select("book_id, tag:tags(name)");
  if (error) throw new Error(error.message);
  const byBook = new Map<string, { name: string }[]>();
  for (const row of data) {
    if (!row.tag) continue;
    byBook.set(row.book_id, [...(byBook.get(row.book_id) ?? []), row.tag]);
  }
  return new Map([...byBook].map(([id, tags]) => [id, sortTags(tags).map((tag) => tag.name)]));
}

const escapeLike = (value: string) => value.replace(/[\\%_]/g, "\\$&");

async function findOrCreateTag(supabase: SupabaseClient<Database>, name: string): Promise<string> {
  const find = async () => {
    const { data, error } = await supabase.from("tags").select("id").ilike("name", escapeLike(name)).limit(1);
    if (error) throw new Error(error.message);
    return data[0]?.id;
  };
  const existing = await find();
  if (existing) return existing;
  const { data, error } = await supabase.from("tags").insert({ name }).select("id").single();
  if (error?.code === "23505") {
    const raced = await find();
    if (raced) return raced;
  }
  if (error) throw new Error(error.message);
  return data.id;
}

export async function addTag(
  supabase: SupabaseClient<Database>,
  bookId: string,
  name: string,
): Promise<"added" | "duplicate" | "full" | "missing"> {
  if (!isUuid(bookId)) return "missing";
  const current = await listBookTags(supabase, bookId);
  if (current.some((tag) => tag.name.toLowerCase() === name.toLowerCase())) return "duplicate";
  if (current.length >= TAGS_PER_BOOK) return "full";
  const tagId = await findOrCreateTag(supabase, name);
  const { error } = await supabase.from("book_tags").insert({ book_id: bookId, tag_id: tagId });
  if (error?.code === "23505") return "duplicate";
  if (error?.code === "23503" || error?.code === "42501") return "missing";
  if (error) throw new Error(error.message);
  return "added";
}

// A tag is shown only while a book has it: the tag goes when its last book row does.
export async function removeTag(supabase: SupabaseClient<Database>, bookId: string, tagId: string): Promise<boolean> {
  if (!isUuid(bookId)) return false;
  const { data, error } = await supabase
    .from("book_tags")
    .delete()
    .eq("book_id", bookId)
    .eq("tag_id", tagId)
    .select("tag_id");
  if (error) throw new Error(error.message);
  if (data.length === 0) return false;
  const { count, error: countError } = await supabase
    .from("book_tags")
    .select("tag_id", { count: "exact", head: true })
    .eq("tag_id", tagId);
  if (countError) throw new Error(countError.message);
  if (count === 0) {
    const { error: deleteError } = await supabase.from("tags").delete().eq("id", tagId);
    if (deleteError) throw new Error(deleteError.message);
  }
  return true;
}
