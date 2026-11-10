"use server";

import { revalidatePath } from "next/cache";
import { parseDisplayName, saveDisplayName, type NameFormState } from "@/lib/profile";
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
