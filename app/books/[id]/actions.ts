"use server";

import { revalidatePath } from "next/cache";
import {
  isUuid,
  parseReview,
  parseStatus,
  updateBookReview,
  updateBookStatus,
  type ReviewFormState,
  type StatusFormState,
} from "@/lib/books";
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

export async function saveReview(
  id: string,
  _prev: ReviewFormState,
  formData: FormData,
): Promise<ReviewFormState> {
  await requireUser();
  const parsed = parseReview(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values: { review: String(formData.get("review") ?? "") } };
  if (!isUuid(id)) return { formError: "Book not found" };
  try {
    if (!(await updateBookReview(await createClient(), id, parsed.value || null))) return { formError: "Book not found" };
  } catch {
    return { formError: "Could not save. Try again." };
  }
  revalidatePath("/books");
  revalidatePath(`/books/${id}`);
  return { saved: true };
}
