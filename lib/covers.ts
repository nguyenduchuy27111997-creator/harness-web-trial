import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export const COVER_TYPES: Record<string, string> = { "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp" };
export const COVER_MAX_BYTES = 2 * 1024 * 1024;
export const COVER_ERROR = "Use a JPEG, PNG or WebP image up to 2 MB";

export type CoverFormState = { error?: string };

// An empty, over-size or other-type file is refused (the bucket's limits refuse it again).
export function parseCoverFile(value: FormDataEntryValue | null): { file: File; ext: string } | { error: string } {
  if (!(value instanceof File) || value.size === 0 || value.size > COVER_MAX_BYTES) return { error: COVER_ERROR };
  const ext = COVER_TYPES[value.type];
  return ext ? { file: value, ext } : { error: COVER_ERROR };
}

// The declared type is a claim; the first bytes say what the file is: a JPEG, PNG or WebP type, or null.
export function sniffImageType(bytes: Uint8Array): string | null {
  const starts = (sig: number[], at = 0) => sig.every((b, i) => bytes[at + i] === b);
  if (starts([0xff, 0xd8, 0xff])) return "image/jpeg";
  if (starts([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "image/png";
  if (starts([0x52, 0x49, 0x46, 0x46]) && starts([0x57, 0x45, 0x42, 0x50], 8)) return "image/webp";
  return null;
}

export function coverPath(userId: string, bookId: string, ext: string): string {
  return `${userId}/${bookId}-${crypto.randomUUID()}.${ext}`;
}

type Client = SupabaseClient<Database>;

export async function getCoverPath(supabase: Client, bookId: string): Promise<string | null> {
  const { data, error } = await supabase.from("books").select("cover_path").eq("id", bookId).maybeSingle();
  if (error) throw new Error(error.message);
  return data?.cover_path ?? null;
}

// false when the book is not the user's. Uploads, points the book at the new object, then removes the old one.
export async function uploadCover(
  supabase: Client,
  userId: string,
  bookId: string,
  file: File,
  ext: string,
): Promise<boolean> {
  const { data: book, error: readError } = await supabase.from("books").select("cover_path").eq("id", bookId).maybeSingle();
  if (readError) throw new Error(readError.message);
  if (!book) return false;
  const path = coverPath(userId, bookId, ext);
  const { error: uploadError } = await supabase.storage.from("covers").upload(path, file, { contentType: Object.keys(COVER_TYPES).find((t) => COVER_TYPES[t] === ext) });
  if (uploadError) throw new Error(uploadError.message);
  const { data: updated, error: updateError } = await supabase
    .from("books")
    .update({ cover_path: path })
    .eq("id", bookId)
    .select("id");
  if (updateError || updated.length === 0) {
    await supabase.storage.from("covers").remove([path]);
    if (updateError) throw new Error(updateError.message);
    return false;
  }
  if (book.cover_path) await supabase.storage.from("covers").remove([book.cover_path]);
  return true;
}

export async function removeCover(supabase: Client, bookId: string): Promise<boolean> {
  const old = await getCoverPath(supabase, bookId);
  if (!old) return false;
  const { error } = await supabase.from("books").update({ cover_path: null }).eq("id", bookId);
  if (error) throw new Error(error.message);
  await supabase.storage.from("covers").remove([old]);
  return true;
}

// Storage forbids SQL deletes on storage.objects, so the app removes files through the Storage API.
export async function removeCoverObject(supabase: Client, path: string | null): Promise<void> {
  if (path) await supabase.storage.from("covers").remove([path]);
}

// Every file under covers/<userId>, in pages of 100; run before the account is deleted.
export async function removeAllCovers(supabase: Client, userId: string): Promise<void> {
  for (;;) {
    const { data, error } = await supabase.storage.from("covers").list(userId, { limit: 100 });
    if (error) throw new Error(error.message);
    if (!data || data.length === 0) return;
    const { error: removeError } = await supabase.storage.from("covers").remove(data.map((f) => `${userId}/${f.name}`));
    if (removeError) throw new Error(removeError.message);
  }
}

// One signed URL for the cover, or null (placeholder).
export async function signCover(supabase: Client, path: string | null): Promise<string | null> {
  if (!path) return null;
  const { data } = await supabase.storage.from("covers").createSignedUrl(path, 600);
  return data?.signedUrl ?? null;
}

// One call for many covers: path -> signed URL. A path that fails is left out (placeholder shown).
export async function signCovers(supabase: Client, paths: string[]): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  if (paths.length === 0) return urls;
  const { data } = await supabase.storage.from("covers").createSignedUrls(paths, 600);
  for (const item of data ?? []) if (item.path && item.signedUrl) urls.set(item.path, item.signedUrl);
  return urls;
}
