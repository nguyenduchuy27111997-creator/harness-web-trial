"use server";

import { revalidatePath } from "next/cache";
import { isUuid } from "@/lib/books";
import {
  insertShelf,
  parseShelfName,
  removeShelf,
  SHELF_NAME_TAKEN,
  type ShelfFormState,
  updateShelfName,
} from "@/lib/shelves";
import { shareShelf, stopSharing } from "@/lib/share";
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

export async function renameShelf(id: string, _prev: ShelfFormState, formData: FormData): Promise<ShelfFormState> {
  await requireUser();
  const parsed = parseShelfName(formData);
  const values = { name: String(formData.get("name") ?? "") };
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values };
  if (!isUuid(id)) return { formError: "Shelf not found", values };
  try {
    const result = await updateShelfName(await createClient(), id, parsed.value);
    if (result === "taken") return { fieldErrors: { name: SHELF_NAME_TAKEN }, values };
    if (result === "missing") return { formError: "Shelf not found", values };
  } catch {
    return { formError: "Could not save. Try again.", values };
  }
  revalidatePath("/shelves");
  revalidatePath("/books", "layout");
  return { saved: true };
}

export async function deleteShelf(id: string, _formData: FormData): Promise<void> {
  await requireUser();
  if (isUuid(id)) await removeShelf(await createClient(), id);
  revalidatePath("/shelves");
  revalidatePath("/books", "layout");
}

export async function shareShelfAction(shelfId: string): Promise<void> {
  await requireUser();
  if (isUuid(shelfId)) await shareShelf(await createClient(), shelfId);
  revalidatePath("/shelves");
}

export async function stopSharingAction(shelfId: string): Promise<void> {
  await requireUser();
  if (isUuid(shelfId)) await stopSharing(await createClient(), shelfId);
  revalidatePath("/shelves");
}
