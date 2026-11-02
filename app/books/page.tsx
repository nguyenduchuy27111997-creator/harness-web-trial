import type { Metadata } from "next";
import Link from "next/link";
import { BookList } from "@/components/book-list";
import { Button } from "@/components/ui/button";
import { listBooks } from "@/lib/books";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My books · Bookshelf" };

export default async function BooksPage() {
  await requireUser();
  const books = await listBooks(await createClient());
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:p-8">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">My books</h1>
      {books.length > 0 && (
        <>
          <Button asChild className="self-start">
            <Link href="/books/new">Add book</Link>
          </Button>
          <BookList books={books} />
        </>
      )}
      {books.length === 0 && (
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
