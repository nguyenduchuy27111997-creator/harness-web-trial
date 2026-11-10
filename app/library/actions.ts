"use server";

import { revalidatePath } from "next/cache";
import { IMPORT_MAX_BYTES, importBooks, listAllBookKeys, parseImport, type ImportState } from "@/lib/import";
import { createClient, requireUser } from "@/lib/supabase/server";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function previewImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireUser();
  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a CSV file" };
  if (file.size > IMPORT_MAX_BYTES) return { error: "The file is too large" };
  const csv = await file.text();
  const parsed = parseImport(csv, await listAllBookKeys(await createClient()), today());
  if ("error" in parsed) return parsed;
  return { csv, ...parsed };
}

export async function confirmImport(_prev: ImportState, formData: FormData): Promise<ImportState> {
  await requireUser();
  const csv = String(formData.get("csv") ?? "");
  if (new TextEncoder().encode(csv).length > IMPORT_MAX_BYTES) return { error: "The file is too large" };
  const supabase = await createClient();
  try {
    const parsed = parseImport(csv, await listAllBookKeys(supabase), today());
    if ("error" in parsed) return parsed;
    const added = parsed.rows.length > 0 ? await importBooks(supabase, parsed.rows) : 0;
    revalidatePath("/books");
    revalidatePath("/stats");
    return { added, skippedCount: parsed.skipped.length };
  } catch {
    return { error: "Could not save. Try again." };
  }
}
