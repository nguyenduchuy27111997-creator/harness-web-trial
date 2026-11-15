import type { Metadata } from "next";
import { Card, CardContent } from "@/components/ui/card";
import { requireUser } from "@/lib/supabase/server";
import { NewBookForm } from "./new-book-form";

export const metadata: Metadata = { title: "Add book · Bookshelf" };

export default async function NewBookPage() {
  await requireUser();
  return (
    <div className="flex w-full max-w-md flex-col gap-6">
      <h1 className="font-heading text-large-title">Add book</h1>
      <Card>
        <CardContent>
          <NewBookForm />
        </CardContent>
      </Card>
    </div>
  );
}
