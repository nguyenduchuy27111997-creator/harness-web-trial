"use server";

import { revalidatePath } from "next/cache";
import { isUuid, updateBookStatus } from "@/lib/books";
import { moveQueued, unqueueBook } from "@/lib/queue";
import { createClient, requireUser } from "@/lib/supabase/server";

async function move(bookId: string, up: boolean) {
  await requireUser();
  if (!isUuid(bookId)) return;
  await moveQueued(await createClient(), bookId, up);
  revalidatePath("/up-next");
}

export async function moveUp(bookId: string, _formData: FormData): Promise<void> {
  await move(bookId, true);
}

export async function moveDown(bookId: string, _formData: FormData): Promise<void> {
  await move(bookId, false);
}

export async function removeFromUpNext(bookId: string, _formData: FormData): Promise<void> {
  await requireUser();
  if (!isUuid(bookId)) return;
  await unqueueBook(await createClient(), bookId);
  revalidatePath("/up-next");
  revalidatePath(`/books/${bookId}`);
}

export async function startFirst(bookId: string, _formData: FormData): Promise<void> {
  await requireUser();
  if (!isUuid(bookId)) return;
  await updateBookStatus(await createClient(), bookId, "reading");
  revalidatePath("/up-next");
  revalidatePath("/books");
  revalidatePath(`/books/${bookId}`);
  revalidatePath("/stats");
}
