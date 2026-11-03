import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/supabase/server";
import { NewBookForm } from "./new-book-form";

export const metadata: Metadata = { title: "Add book · Bookshelf" };

// Blocking render (design M2): no loading.tsx, so a 404 elsewhere is never committed as 200.
export const instant = false;

export default async function NewBookPage() {
  await requireUser();
  return (
    <main className="mx-auto flex w-full max-w-md flex-col gap-6 px-4 py-8 sm:p-8">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">Add book</h1>
      <Card>
        <CardContent>
          <NewBookForm />
        </CardContent>
      </Card>
    </main>
  );
}
