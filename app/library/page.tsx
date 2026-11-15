import type { Metadata } from "next";
import { ImportForm } from "@/components/import-form";
import { Button } from "@/components/ui/button";
import { confirmImport, previewImport } from "./actions";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Import / export · Bookshelf" };

export default async function LibraryPage() {
  await requireUser();
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <h1 className="font-heading text-large-title">Import / export</h1>
      <div>
        <Button asChild>
          <a href="/api/export" download>
            Download CSV
          </a>
        </Button>
      </div>
      <ImportForm preview={previewImport} confirm={confirmImport} />
    </div>
  );
}
