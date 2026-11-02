"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { isUuid, removeBook } from "@/lib/books";
import { createClient, requireUser } from "@/lib/supabase/server";

export async function deleteBook(id: string): Promise<void> {
  await requireUser();
  if (isUuid(id)) await removeBook(await createClient(), id);
  revalidatePath("/books");
  redirect("/books");
}
