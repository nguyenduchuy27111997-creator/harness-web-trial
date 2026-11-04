import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { FormState, Parsed } from "@/lib/forms";

export const GOAL_ERROR = "Goal must be a whole number from 1 to 365";

export type GoalFormState = FormState<"goal"> & { saved?: true };

export function parseGoal(formData: FormData): Parsed<number, "goal"> {
  const raw = String(formData.get("goal") ?? "").trim();
  const goal = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (!(goal >= 1 && goal <= 365)) return { ok: false, fieldErrors: { goal: GOAL_ERROR } };
  return { ok: true, value: goal };
}

// Row Level Security limits the rows to the signed-in user's own; the year is the UTC calendar year.
export async function getReadingGoal(supabase: SupabaseClient<Database>, now = new Date()): Promise<number | null> {
  const { data, error } = await supabase
    .from("reading_goals")
    .select("goal")
    .eq("year", now.getUTCFullYear())
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data?.goal ?? null;
}

// user_id comes from the column default (auth.uid()), never from the client.
export async function saveReadingGoal(supabase: SupabaseClient<Database>, goal: number, now = new Date()): Promise<void> {
  const { error } = await supabase
    .from("reading_goals")
    .upsert({ year: now.getUTCFullYear(), goal }, { onConflict: "user_id,year" });
  if (error) throw new Error(error.message);
}

export function goalProgress(finished: number, goal: number): number {
  return Math.min(100, Math.round((finished / goal) * 100));
}
