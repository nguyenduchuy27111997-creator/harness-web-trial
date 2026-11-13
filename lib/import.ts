import type { SupabaseClient } from "@supabase/supabase-js";
import { isBookStatus, isValidDate, type BookStatus } from "./books";
import { CSV_COLUMNS, parseCsv } from "./csv";
import type { Database } from "./database.types";

export const IMPORT_MAX_BYTES = 1_000_000;
export const IMPORT_MAX_ROWS = 1000;
const PAGE_SIZE = 1000;

export type ImportRow = {
  title: string;
  author: string;
  status: BookStatus;
  rating: number | null;
  total_pages: number | null;
  started_on: string | null;
  finished_on: string | null;
};
export type SkippedRow = { line: number; reason: string };
export type ImportState = {
  error?: string;
  csv?: string;
  rows?: ImportRow[];
  skipped?: SkippedRow[];
  added?: number;
  skippedCount?: number;
};
type BookKey = { title: string; author: string };

export async function listAllBookKeys(supabase: SupabaseClient<Database>): Promise<BookKey[]> {
  const keys: BookKey[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("books")
      .select("title, author")
      .order("created_at")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    keys.push(...data);
    if (data.length < PAGE_SIZE) return keys;
  }
}

function keyOf(title: string, author: string): string {
  return JSON.stringify([title.trim().toLowerCase(), author.trim().toLowerCase()]);
}

function intIn(value: string, min: number, max: number): number | null {
  if (!/^\d+$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

function date(value: string): string | null {
  return isValidDate(value) ? value : null;
}

function skipReason(cells: string[], seen: Set<string>): string | undefined {
  const [title, author, status, rating] = cells.map((c) => c.trim());
  if (!title) return "No title";
  if (!author) return "No author";
  if (title.length > 200 || author.length > 120) return "Title or author too long";
  if (!isBookStatus(status)) return "Unknown status";
  if (rating && intIn(rating, 1, 5) === null) return "Rating must be 1 to 5";
  if (seen.has(keyOf(title, author))) return "Already on your shelf";
}

export function parseImport(
  text: string,
  existing: BookKey[],
  today: string,
): { rows: ImportRow[]; skipped: SkippedRow[] } | { error: string } {
  const lines = parseCsv(text);
  const header = lines[0]?.map((c) => c.trim());
  if (!header || header.length !== CSV_COLUMNS.length || CSV_COLUMNS.some((c, i) => header[i] !== c)) {
    return { error: "This is not a Bookshelf CSV file" };
  }
  if (lines.length - 1 > IMPORT_MAX_ROWS) return { error: "The file is too large" };
  const seen = new Set(existing.map((b) => keyOf(b.title, b.author)));
  const rows: ImportRow[] = [];
  const skipped: SkippedRow[] = [];
  lines.slice(1).forEach((raw, i) => {
    const cells = CSV_COLUMNS.map((_, j) => raw[j] ?? "");
    const reason = skipReason(cells, seen);
    if (reason) {
      skipped.push({ line: i + 2, reason });
      return;
    }
    const [title, author, status, rating, pages, started, finished] = cells.map((c) => c.trim());
    seen.add(keyOf(title, author));
    const bookStatus = status as BookStatus;
    const finishedOn = bookStatus === "finished" && date(finished) && finished <= today ? finished : null;
    const startedOn = bookStatus !== "want_to_read" && date(started) && started <= (finishedOn ?? today) ? started : null;
    rows.push({
      title,
      author,
      status: bookStatus,
      rating: bookStatus === "finished" && rating ? Number(rating) : null,
      total_pages: intIn(pages, 1, 10_000),
      started_on: startedOn,
      finished_on: finishedOn,
    });
  });
  return { rows, skipped };
}

export async function importBooks(supabase: SupabaseClient<Database>, rows: ImportRow[]): Promise<number> {
  const { data, error } = await supabase.rpc("import_books", { p_rows: rows });
  if (error) throw new Error(error.message);
  return data;
}
