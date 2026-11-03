import type { Metadata } from "next";
import Link from "next/link";
import { BookList } from "@/components/book-list";
import { Button } from "@/components/ui/button";
import { StatusTabs } from "@/components/status-tabs";
import { listBooks, parseStatusFilter } from "@/lib/books";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My books · Bookshelf" };

// Blocking render (design M2): no loading.tsx, so a 404 elsewhere is never committed as 200.
export const instant = false;

export default async function BooksPage({ searchParams }: { searchParams: Promise<{ status?: string | string[] }> }) {
  await requireUser();
  const status = parseStatusFilter((await searchParams).status);
  const books = await listBooks(await createClient(), status);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:p-8">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">My books</h1>
      <StatusTabs current={status} />
      {(books.length > 0 || status) && (
        <Button asChild className="self-start">
          <Link href="/books/new">Add book</Link>
        </Button>
      )}
      {books.length > 0 && <BookList books={books} />}
      {books.length === 0 && status && <p className="text-muted-foreground">No books here. Add one or switch tabs.</p>}
      {books.length === 0 && !status && (
        <div className="flex flex-col items-start gap-4">
          <p className="text-muted-foreground">Your shelf is empty. Add your first book to get started.</p>
          <Button asChild>
            <Link href="/books/new">Add book</Link>
          </Button>
        </div>
      )}
    </main>
  );
}
