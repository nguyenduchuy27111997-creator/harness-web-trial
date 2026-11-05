"use server";

import { revalidatePath } from "next/cache";
import { insertShelf, parseShelfName, SHELF_NAME_TAKEN, type ShelfFormState } from "@/lib/shelves";
import { createClient, requireUser } from "@/lib/supabase/server";

export async function createShelf(_prev: ShelfFormState, formData: FormData): Promise<ShelfFormState> {
  await requireUser();
  const parsed = parseShelfName(formData);
  const values = { name: String(formData.get("name") ?? "") };
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values };
  try {
    if ((await insertShelf(await createClient(), parsed.value)) === "taken") {
      return { fieldErrors: { name: SHELF_NAME_TAKEN }, values };
    }
  } catch {
    return { formError: "Could not save. Try again.", values };
  }
  revalidatePath("/shelves");
  return { saved: true };
}
