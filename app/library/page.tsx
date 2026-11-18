import type { Metadata } from "next";
import { ImportForm } from "@/components/import-form";
import { Button } from "@/components/ui/button";
import { confirmImport, previewImport } from "./actions";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Import / export · Bookshelf" };

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h2 className="px-1 text-footnote font-medium uppercase tracking-wide text-muted-foreground">{title}</h2>
      <div className="rounded-xl bg-card p-4 ring-1 ring-foreground/10">{children}</div>
    </section>
  );
}

export default async function LibraryPage() {
  await requireUser();
  return (
    <div className="flex w-full max-w-xl flex-col gap-6">
      <h1 className="font-heading text-large-title">Import / export</h1>
      <Group title="Import">
        <ImportForm preview={previewImport} confirm={confirmImport} />
      </Group>
      <Group title="Export">
        <div>
          <Button asChild variant="secondary">
            <a href="/api/export" download>
              Download CSV
            </a>
          </Button>
        </div>
      </Group>
    </div>
  );
}
