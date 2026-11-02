"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { insertBook, parseNewBook, type BookFormState } from "@/lib/books";
import { createClient, requireUser } from "@/lib/supabase/server";

export async function createBook(_prev: BookFormState, formData: FormData): Promise<BookFormState> {
  await requireUser();
  const parsed = parseNewBook(formData);
  const values = {
    title: String(formData.get("title") ?? ""),
    author: String(formData.get("author") ?? ""),
    status: String(formData.get("status") ?? ""),
  };
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values };
  try {
    await insertBook(await createClient(), parsed.value);
  } catch {
    return { formError: "Could not save the book. Try again.", values };
  }
  revalidatePath("/books");
  redirect("/books");
}
