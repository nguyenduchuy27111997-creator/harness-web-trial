"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/books";
import { parseTagName, renameTag, type TagFormState } from "@/lib/tags";
import { createClient, requireUser } from "@/lib/supabase/server";

export async function renameTagAction(id: string, _prev: TagFormState, formData: FormData): Promise<TagFormState> {
  await requireUser();
  const parsed = parseTagName(formData);
  const values = { name: String(formData.get("name") ?? "") };
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values };
  if (!isUuid(id)) return { formError: "Tag not found", values };
  try {
    const result = await renameTag(await createClient(), id, parsed.value);
    if (result === "taken") return { fieldErrors: { name: "You already have that tag" }, values };
    if (result === "missing") return { formError: "Tag not found", values };
  } catch {
    return { formError: "Could not save. Try again.", values };
  }
  revalidatePath("/tags");
  revalidatePath("/books", "layout");
  return { saved: true };
}
