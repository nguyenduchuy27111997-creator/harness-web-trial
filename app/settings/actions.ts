"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import {
  DELETE_CONFIRM_MESSAGE,
  DELETE_CONFIRM_WORD,
  deleteAccount,
  parseDisplayName,
  saveDisplayName,
  type DeleteAccountState,
  type NameFormState,
} from "@/lib/profile";
import { createClient, requireUser } from "@/lib/supabase/server";

export async function saveName(_prev: NameFormState, formData: FormData): Promise<NameFormState> {
  await requireUser();
  const parsed = parseDisplayName(formData);
  if (!parsed.ok)
    return { fieldErrors: parsed.fieldErrors, values: { display_name: String(formData.get("display_name") ?? "") } };
  try {
    await saveDisplayName(await createClient(), parsed.value);
  } catch {
    return { formError: "Could not save. Try again." };
  }
  revalidatePath("/", "layout");
  return { saved: true };
}

export async function deleteAccountAction(_prev: DeleteAccountState, formData: FormData): Promise<DeleteAccountState> {
  await requireUser();
  if (formData.get("confirm") !== DELETE_CONFIRM_WORD) return { formError: DELETE_CONFIRM_MESSAGE };
  try {
    await deleteAccount(await createClient());
  } catch {
    return { formError: "Could not delete the account. Try again." };
  }
  redirect("/sign-in?deleted=1");
}
