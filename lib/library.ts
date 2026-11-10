import type { SupabaseClient } from "@supabase/supabase-js";
import { CSV_COLUMNS } from "@/lib/csv";
import type { Database } from "@/lib/database.types";

const PAGE_SIZE = 1000;

export async function listExportRows(supabase: SupabaseClient<Database>): Promise<string[][]> {
  const rows: string[][] = [[...CSV_COLUMNS]];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from("books")
      .select(CSV_COLUMNS.join(", "))
      .order("created_at")
      .order("id")
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(error.message);
    const page = data as unknown as Record<(typeof CSV_COLUMNS)[number], string | number | null>[];
    for (const book of page) rows.push(CSV_COLUMNS.map((column) => String(book[column] ?? "")));
    if (page.length < PAGE_SIZE) return rows;
  }
}
