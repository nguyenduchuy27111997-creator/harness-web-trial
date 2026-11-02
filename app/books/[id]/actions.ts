"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid, parseStatus, removeBook, updateBookStatus, type StatusFormState } from "@/lib/books";
import { createClient, requireUser } from "@/lib/supabase/server";

export async function updateStatus(
  id: string,
  _prev: StatusFormState,
  formData: FormData,
): Promise<StatusFormState> {
  await requireUser();
  const parsed = parseStatus(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values: { status: String(formData.get("status") ?? "") } };
  if (!isUuid(id)) return { formError: "Book not found" };
  try {
    if (!(await updateBookStatus(await createClient(), id, parsed.value))) return { formError: "Book not found" };
  } catch {
    return { formError: "Could not save. Try again." };
  }
  revalidatePath("/books");
  revalidatePath(`/books/${id}`);
  return { saved: true };
}

export async function deleteBook(id: string): Promise<void> {
  await requireUser();
  if (isUuid(id)) await removeBook(await createClient(), id);
  revalidatePath("/books");
  redirect("/books");
}
