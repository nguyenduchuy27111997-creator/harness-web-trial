import type { Metadata } from "next";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Import / export · Bookshelf" };

export default async function LibraryPage() {
  await requireUser();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:p-8">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">Import / export</h1>
      <div>
        <Button asChild>
          <a href="/api/export" download>
            Download CSV
          </a>
        </Button>
      </div>
    </main>
  );
}
