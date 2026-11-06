"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getBook,
  isUuid,
  parseBookFields,
  parseProgress,
  parseRating,
  parseReview,
  parseStatus,
  removeBook,
  updateBookFields,
  updateBookProgress,
  updateBookRating,
  updateBookReview,
  updateBookStatus,
  type EditBookFormState,
  type ProgressFormState,
  type RatingFormState,
  type ReviewFormState,
  type StatusFormState,
} from "@/lib/books";
import { insertQuote, parseQuote, removeQuote, type QuoteFormState } from "@/lib/quotes";
import { addBookToShelf, parseShelfChoice, removeBookFromShelf, type AddToShelfFormState } from "@/lib/shelves";
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

export async function saveRating(
  id: string,
  _prev: RatingFormState,
  formData: FormData,
): Promise<RatingFormState> {
  await requireUser();
  const parsed = parseRating(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values: { rating: String(formData.get("rating") ?? "") } };
  if (!isUuid(id)) return { formError: "Book not found" };
  try {
    if (!(await updateBookRating(await createClient(), id, parsed.value))) return { formError: "Book not found" };
  } catch {
    return { formError: "Could not save. Try again." };
  }
  revalidatePath("/books");
  revalidatePath(`/books/${id}`);
  return { saved: true };
}

export async function deleteBook(id: string, _formData: FormData): Promise<void> {
  await requireUser();
  if (isUuid(id)) await removeBook(await createClient(), id);
  revalidatePath("/books");
  redirect("/books");
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

export async function editBook(
  id: string,
  _prev: EditBookFormState,
  formData: FormData,
): Promise<EditBookFormState> {
  await requireUser();
  const parsed = parseBookFields(formData);
  if (!parsed.ok) {
    return {
      fieldErrors: parsed.fieldErrors,
      values: { title: String(formData.get("title") ?? ""), author: String(formData.get("author") ?? "") },
    };
  }
  if (!isUuid(id)) return { formError: "Book not found" };
  try {
    if (!(await updateBookFields(await createClient(), id, parsed.value))) return { formError: "Book not found" };
  } catch {
    return { formError: "Could not save. Try again." };
  }
  revalidatePath("/books");
  revalidatePath(`/books/${id}`);
  return { saved: true };
}

export async function saveProgress(
  id: string,
  _prev: ProgressFormState,
  formData: FormData,
): Promise<ProgressFormState> {
  await requireUser();
  const parsed = parseProgress(formData);
  if (!parsed.ok) {
    return {
      fieldErrors: parsed.fieldErrors,
      values: {
        total_pages: String(formData.get("total_pages") ?? ""),
        current_page: String(formData.get("current_page") ?? ""),
      },
    };
  }
  if (!isUuid(id)) return { formError: "Book not found" };
  try {
    if (!(await updateBookProgress(await createClient(), id, parsed.value))) return { formError: "Book not found" };
  } catch {
    return { formError: "Could not save. Try again." };
  }
  revalidatePath("/books");
  revalidatePath(`/books/${id}`);
  return { saved: true };
}

export async function addToShelf(
  bookId: string,
  _prev: AddToShelfFormState,
  formData: FormData,
): Promise<AddToShelfFormState> {
  await requireUser();
  const parsed = parseShelfChoice(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors };
  if (!isUuid(bookId)) return { formError: "Shelf not found" };
  try {
    if ((await addBookToShelf(await createClient(), bookId, parsed.value)) === "missing") {
      return { formError: "Shelf not found" };
    }
  } catch {
    return { formError: "Could not save. Try again." };
  }
  revalidatePath("/books");
  revalidatePath(`/books/${bookId}`);
  return { saved: true };
}

export async function removeFromShelf(bookId: string, shelfId: string, _formData: FormData): Promise<void> {
  await requireUser();
  if (isUuid(bookId) && isUuid(shelfId)) await removeBookFromShelf(await createClient(), bookId, shelfId);
  revalidatePath("/books");
  revalidatePath(`/books/${bookId}`);
}

export async function addQuote(
  bookId: string,
  _prev: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  await requireUser();
  if (!isUuid(bookId)) return { formError: "Book not found" };
  try {
    const supabase = await createClient();
    const book = await getBook(supabase, bookId);
    if (!book) return { formError: "Book not found" };
    const parsed = parseQuote(formData, book.total_pages);
    if (!parsed.ok) {
      return {
        fieldErrors: parsed.fieldErrors,
        values: { quote: String(formData.get("quote") ?? ""), page: String(formData.get("page") ?? "") },
      };
    }
    if ((await insertQuote(supabase, bookId, parsed.value)) === "missing") return { formError: "Book not found" };
  } catch {
    return { formError: "Could not save. Try again." };
  }
  revalidatePath(`/books/${bookId}`);
  revalidatePath("/quotes");
  return { saved: true };
}

export async function deleteQuote(bookId: string, quoteId: string, _formData: FormData): Promise<void> {
  await requireUser();
  if (isUuid(bookId) && isUuid(quoteId)) await removeQuote(await createClient(), bookId, quoteId);
  revalidatePath(`/books/${bookId}`);
  revalidatePath("/quotes");
}
