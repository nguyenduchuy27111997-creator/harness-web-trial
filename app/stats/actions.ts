"use server";

import { revalidatePath } from "next/cache";
import { parseGoal, saveReadingGoal, type GoalFormState } from "@/lib/goals";
import { createClient, requireUser } from "@/lib/supabase/server";

export async function saveGoal(_prev: GoalFormState, formData: FormData): Promise<GoalFormState> {
  await requireUser();
  const parsed = parseGoal(formData);
  if (!parsed.ok) return { fieldErrors: parsed.fieldErrors, values: { goal: String(formData.get("goal") ?? "") } };
  try {
    await saveReadingGoal(await createClient(), parsed.value);
  } catch {
    return { formError: "Could not save. Try again." };
  }
  revalidatePath("/stats");
  return { saved: true };
}
