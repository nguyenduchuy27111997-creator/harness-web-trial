import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

export type Stats = { finishedThisYear: number; averageRating: number | null; pagesRead: number };

export function summarizeStats(rows: { rating: number | null }[]): Omit<Stats, "pagesRead"> {
  const ratings = rows.flatMap((row) => (row.rating === null ? [] : [row.rating]));
  const average = ratings.length === 0 ? null : ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
  return { finishedThisYear: rows.length, averageRating: average === null ? null : Math.round(average * 10) / 10 };
}

export type FinishedRead = {
  bookId: string;
  title: string;
  finishedOn: string;
  rating: number | null;
  totalPages: number | null;
  pastReadId: string | null; // null for a book's current read
};

function compareReads(a: FinishedRead, b: FinishedRead): number {
  if (a.finishedOn !== b.finishedOn) return a.finishedOn < b.finishedOn ? 1 : -1;
  if ((a.pastReadId === null) !== (b.pastReadId === null)) return a.pastReadId === null ? -1 : 1;
  if (a.bookId !== b.bookId) return a.bookId < b.bookId ? -1 : 1;
  return (a.pastReadId ?? "") < (b.pastReadId ?? "") ? -1 : (a.pastReadId ?? "") > (b.pastReadId ?? "") ? 1 : 0;
}

// Row Level Security limits the rows to the signed-in user's own: books' current reads and past reads finished in the year.
export async function listFinishedReads(supabase: SupabaseClient<Database>, year: number): Promise<FinishedRead[]> {
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;
  const [books, reads] = await Promise.all([
    supabase.from("books").select("id, title, finished_on, rating, total_pages").gte("finished_on", from).lt("finished_on", to),
    supabase.from("reads").select("id, finished_on, rating, book:books(id, title, total_pages)").gte("finished_on", from).lt("finished_on", to),
  ]);
  if (books.error) throw new Error(books.error.message);
  if (reads.error) throw new Error(reads.error.message);
  return [
    ...books.data.map((b) => ({
      bookId: b.id,
      title: b.title,
      finishedOn: b.finished_on ?? "",
      rating: b.rating,
      totalPages: b.total_pages,
      pastReadId: null,
    })),
    ...reads.data.map((r) => ({
      bookId: r.book.id,
      title: r.book.title,
      finishedOn: r.finished_on,
      rating: r.rating,
      totalPages: r.book.total_pages,
      pastReadId: r.id,
    })),
  ].sort(compareReads);
}

// The year is the UTC calendar year. The count includes past reads; the average is of the books' current ratings only (decision 0013).
export async function getStats(supabase: SupabaseClient<Database>, now = new Date()): Promise<Stats> {
  const reads = await listFinishedReads(supabase, now.getUTCFullYear());
  return {
    finishedThisYear: reads.length,
    averageRating: summarizeStats(reads.filter((r) => r.pastReadId === null)).averageRating,
    pagesRead: sumPages(reads),
  };
}

// 12 counts, index 0 = January, by the month of finishedOn (an ISO date).
export function countByMonth(reads: { finishedOn: string }[]): number[] {
  const counts = Array<number>(12).fill(0);
  for (const read of reads) counts[Number(read.finishedOn.slice(5, 7)) - 1] += 1;
  return counts;
}

export async function getFinishedByMonth(supabase: SupabaseClient<Database>, now = new Date()): Promise<number[]> {
  return countByMonth(await listFinishedReads(supabase, now.getUTCFullYear()));
}

// A read whose book has no total pages adds 0.
export function sumPages(reads: { totalPages: number | null }[]): number {
  return reads.reduce((sum, r) => sum + (r.totalPages ?? 0), 0);
}

export function formatPagesRead(n: number): string {
  return `${n.toLocaleString("en-US")} ${n === 1 ? "page" : "pages"} read this year`;
}

export function formatAverage(value: number | null): string {
  return value === null ? "No ratings yet" : value.toFixed(1);
}
