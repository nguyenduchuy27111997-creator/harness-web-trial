"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  getBook,
  isUuid,
  parseBookFields,
  parseReadingDates,
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
  updateReadingDates,
  type DatesFormState,
  type EditBookFormState,
  type ProgressFormState,
  type RatingFormState,
  type ReviewFormState,
  type StatusFormState,
} from "@/lib/books";
import {
  getCoverPath,
  parseCoverFile,
  removeCover,
  removeCoverObject,
  sniffImageType,
  uploadCover,
  type CoverFormState,
  COVER_ERROR,
  COVER_TYPES,
} from "@/lib/covers";
import { readAgain, removePastRead } from "@/lib/reads";
import { insertNote, parseNote, removeNote, updateNote, type NoteFormState } from "@/lib/notes";
import { insertQuote, parseQuote, removeQuote, updateQuote, type QuoteFormState } from "@/lib/quotes";
import { addBookToShelf, parseShelfChoice, removeBookFromShelf, type AddToShelfFormState } from "@/lib/shelves";
import { addTag, parseTagName, removeTag, type TagFormState } from "@/lib/tags";
import { queueBook } from "@/lib/queue";
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
  revalidatePath("/stats");
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
  if (isUuid(id)) {
    const supabase = await createClient();
    const coverPath = await getCoverPath(supabase, id);
    if (await removeBook(supabase, id)) await removeCoverObject(supabase, coverPath);
  }
  revalidatePath("/books");
  revalidatePath("/quotes");
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

export async function addNote(bookId: string, _prev: NoteFormState, formData: FormData): Promise<NoteFormState> {
  await requireUser();
  const parsed = parseNote(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values: { note: String(formData.get("note") ?? "") } };
  if (!isUuid(bookId)) return { formError: "Book not found" };
  try {
    if ((await insertNote(await createClient(), bookId, parsed.value)) === "missing") return { formError: "Book not found" };
  } catch {
    return { formError: "Could not save. Try again." };
  }
  revalidatePath(`/books/${bookId}`);
  return { saved: true };
}

export async function editNote(
  bookId: string,
  noteId: string,
  _prev: NoteFormState,
  formData: FormData,
): Promise<NoteFormState> {
  await requireUser();
  const parsed = parseNote(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values: { note: String(formData.get("note") ?? "") } };
  if (!isUuid(bookId) || !isUuid(noteId)) return { formError: "Note not found" };
  try {
    if (!(await updateNote(await createClient(), bookId, noteId, parsed.value))) return { formError: "Note not found" };
  } catch {
    return { formError: "Could not save. Try again." };
  }
  revalidatePath(`/books/${bookId}`);
  return { saved: true };
}

export async function deleteNote(bookId: string, noteId: string, _formData: FormData): Promise<void> {
  await requireUser();
  if (isUuid(bookId) && isUuid(noteId)) await removeNote(await createClient(), bookId, noteId);
  revalidatePath(`/books/${bookId}`);
}

// The book must exist and the quote must fit it; otherwise the form state to return.
async function checkQuote(
  supabase: Awaited<ReturnType<typeof createClient>>,
  bookId: string,
  formData: FormData,
): Promise<{ error: QuoteFormState } | { error?: undefined; parsed: Extract<ReturnType<typeof parseQuote>, { ok: true }> }> {
  const book = await getBook(supabase, bookId);
  if (!book) return { error: { formError: "Book not found" } as QuoteFormState };
  const parsed = parseQuote(formData, book.total_pages);
  if (parsed.ok) return { parsed };
  const values = { quote: String(formData.get("quote") ?? ""), page: String(formData.get("page") ?? "") };
  return { error: { fieldErrors: parsed.fieldErrors, values } as QuoteFormState };
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
    const checked = await checkQuote(supabase, bookId, formData);
    if (checked.error) return checked.error;
    const parsed = checked.parsed;
    if ((await insertQuote(supabase, bookId, parsed.value)) === "missing") return { formError: "Book not found" };
  } catch {
    return { formError: "Could not save. Try again." };
  }
  revalidatePath(`/books/${bookId}`);
  revalidatePath("/quotes");
  return { saved: true };
}

export async function editQuote(
  bookId: string,
  quoteId: string,
  _prev: QuoteFormState,
  formData: FormData,
): Promise<QuoteFormState> {
  await requireUser();
  if (!isUuid(bookId)) return { formError: "Book not found" };
  if (!isUuid(quoteId)) return { formError: "Quote not found" };
  try {
    const supabase = await createClient();
    const checked = await checkQuote(supabase, bookId, formData);
    if (checked.error) return checked.error;
    const parsed = checked.parsed;
    if (!(await updateQuote(supabase, bookId, quoteId, parsed.value))) return { formError: "Quote not found" };
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

export async function editDates(
  bookId: string,
  _prev: DatesFormState,
  formData: FormData,
): Promise<DatesFormState> {
  await requireUser();
  if (!isUuid(bookId)) return { formError: "Book not found" };
  try {
    const supabase = await createClient();
    const book = await getBook(supabase, bookId);
    if (!book || book.status === "want_to_read") return { formError: "Book not found" };
    const parsed = parseReadingDates(formData, book.status);
    if (!parsed.ok) {
      return {
        fieldErrors: parsed.fieldErrors,
        values: {
          started_on: String(formData.get("started_on") ?? ""),
          finished_on: String(formData.get("finished_on") ?? ""),
        },
      };
    }
    if (!(await updateReadingDates(supabase, bookId, book.status, parsed.value))) return { formError: "Book not found" };
  } catch {
    return { formError: "Could not save. Try again." };
  }
  revalidatePath("/books");
  revalidatePath(`/books/${bookId}`);
  revalidatePath("/stats");
  return { saved: true };
}

export async function readBookAgain(bookId: string, _formData: FormData): Promise<void> {
  await requireUser();
  if (isUuid(bookId)) await readAgain(await createClient(), bookId);
  revalidatePath("/books");
  revalidatePath(`/books/${bookId}`);
  revalidatePath("/stats");
}

export async function deletePastRead(bookId: string, readId: string, _formData: FormData): Promise<void> {
  await requireUser();
  if (isUuid(bookId) && isUuid(readId)) await removePastRead(await createClient(), bookId, readId);
  revalidatePath("/books");
  revalidatePath(`/books/${bookId}`);
  revalidatePath("/stats");
}

export async function addBookTag(bookId: string, _prev: TagFormState, formData: FormData): Promise<TagFormState> {
  await requireUser();
  const parsed = parseTagName(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values: { name: String(formData.get("name") ?? "") } };
  if (!isUuid(bookId)) return { formError: "Book not found" };
  try {
    const result = await addTag(await createClient(), bookId, parsed.value);
    if (result === "missing") return { formError: "Book not found" };
    if (result === "duplicate") {
      return { fieldErrors: { name: "This book already has that tag" }, values: { name: parsed.value } };
    }
    if (result === "full") {
      return { fieldErrors: { name: "A book has at most 10 tags" }, values: { name: parsed.value } };
    }
  } catch {
    return { formError: "Could not save. Try again." };
  }
  revalidatePath("/books");
  revalidatePath("/tags");
  revalidatePath(`/books/${bookId}`);
  return { saved: true };
}

export async function removeBookTag(bookId: string, tagId: string, _formData: FormData): Promise<void> {
  await requireUser();
  if (isUuid(bookId) && isUuid(tagId)) await removeTag(await createClient(), bookId, tagId);
  revalidatePath("/books");
  revalidatePath("/tags");
  revalidatePath(`/books/${bookId}`);
}

export async function addToUpNext(bookId: string, _formData: FormData): Promise<void> {
  await requireUser();
  if (!isUuid(bookId)) return;
  await queueBook(await createClient(), bookId);
  revalidatePath(`/books/${bookId}`);
  revalidatePath("/up-next");
}

export async function uploadCoverAction(bookId: string, _prev: CoverFormState, formData: FormData): Promise<CoverFormState> {
  const user = await requireUser();
  const parsed = parseCoverFile(formData.get("cover"));
  if ("error" in parsed) return { error: parsed.error };
  if (!isUuid(bookId)) return { error: "Book not found" };
  try {
    // The declared type is only a claim: the file's own bytes must be an image, and they name its type.
    const type = sniffImageType(new Uint8Array(await parsed.file.slice(0, 12).arrayBuffer()));
    if (!type) return { error: COVER_ERROR };
    if (!(await uploadCover(await createClient(), user.id, bookId, parsed.file, COVER_TYPES[type]))) return { error: "Book not found" };
  } catch {
    return { error: "Could not save. Try again." };
  }
  revalidatePath("/books");
  revalidatePath(`/books/${bookId}`);
  return {};
}

export async function removeCoverAction(bookId: string, _formData: FormData): Promise<void> {
  await requireUser();
  if (isUuid(bookId)) await removeCover(await createClient(), bookId);
  revalidatePath("/books");
  revalidatePath(`/books/${bookId}`);
}
