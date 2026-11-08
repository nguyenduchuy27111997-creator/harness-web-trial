import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type Stats = { finishedThisYear: number; averageRating: number | null; byMonth: number[] };

// 12 counts, index 0 = January, by the month of each `YYYY-MM-DD` finish date.
export function countByMonth(finishedOn: string[]): number[] {
  const counts = Array<number>(12).fill(0);
  for (const date of finishedOn) counts[Number(date.slice(5, 7)) - 1] += 1;
  return counts;
}

export function summarizeStats(rows: { rating: number | null }[]): Omit<Stats, "byMonth"> {
  const ratings = rows.flatMap((row) => (row.rating === null ? [] : [row.rating]));
  const average = ratings.length === 0 ? null : ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  return { finishedThisYear: rows.length, averageRating: average === null ? null : Math.round(average * 10) / 10 };
}

// Row Level Security limits the rows to the signed-in user's own; the year is the UTC calendar year.
// The count includes past reads finished this year; the average is of the books' current ratings only.
export async function getStats(supabase: SupabaseClient<Database>, now = new Date()): Promise<Stats> {
  const year = now.getUTCFullYear();
  const [books, reads] = await Promise.all(
    (["books", "reads"] as const).map((table) =>
      supabase
        .from(table)
        .select("rating, finished_on")
        .gte("finished_on", `${year}-01-01`)
        .lt("finished_on", `${year + 1}-01-01`),
    ),
  );
  if (books.error) throw new Error(books.error.message);
  if (reads.error) throw new Error(reads.error.message);
  const stats = summarizeStats(books.data);
  const byMonth = countByMonth([...books.data, ...reads.data].map((row) => row.finished_on as string));
  return { ...stats, finishedThisYear: stats.finishedThisYear + reads.data.length, byMonth };
}

export function formatAverage(value: number | null): string {
  return value === null ? "No ratings yet" : value.toFixed(1);
}
