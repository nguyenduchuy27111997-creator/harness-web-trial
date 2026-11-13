import { toCsv } from "@/lib/csv";
import { listExportRows } from "@/lib/library";
import { createClient, requireUser } from "@/lib/supabase/server";

export async function GET() {
  await requireUser();
  const csv = toCsv(await listExportRows(await createClient()));
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="bookshelf.csv"',
    },
  });
}
