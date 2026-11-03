import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type Stats = { finishedThisYear: number; averageRating: number | null };

export function summarizeStats(rows: { rating: number | null }[]): Stats {
  const ratings = rows.flatMap((row) => (row.rating === null ? [] : [row.rating]));
  const average = ratings.length === 0 ? null : ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  return { finishedThisYear: rows.length, averageRating: average === null ? null : Math.round(average * 10) / 10 };
}

// Row Level Security limits the rows to the signed-in user's own; the year is the UTC calendar year.
export async function getStats(supabase: SupabaseClient<Database>, now = new Date()): Promise<Stats> {
  const year = now.getUTCFullYear();
  const { data, error } = await supabase
    .from("books")
    .select("rating")
    .gte("finished_on", `${year}-01-01`)
    .lt("finished_on", `${year + 1}-01-01`);
  if (error) throw new Error(error.message);
  return summarizeStats(data);
}

export function formatAverage(value: number | null): string {
  return value === null ? "No ratings yet" : value.toFixed(1);
}
