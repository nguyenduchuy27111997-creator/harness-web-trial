import type { Metadata } from "next";
import Link from "next/link";
import { BookList } from "@/components/book-list";
import { Button } from "@/components/ui/button";
import { SearchForm } from "@/components/search-form";
import { SortSelect } from "@/components/sort-select";
import { StatusTabs } from "@/components/status-tabs";
import { filterBooks, listBooks, parseSearch, parseSort, parseStatusFilter, sortBooks } from "@/lib/books";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My books · Bookshelf" };

// Blocking render (design M2): no loading.tsx, so a 404 elsewhere is never committed as 200.
export const instant = false;

export default async function BooksPage({ searchParams }: { searchParams: Promise<{ status?: string | string[]; q?: string | string[]; sort?: string | string[] }> }) {
  await requireUser();
  const params = await searchParams;
  const status = parseStatusFilter(params.status);
  const q = parseSearch(params.q);
  const sort = parseSort(params.sort);
  const books = sortBooks(filterBooks(await listBooks(await createClient(), status), q), sort);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:p-8">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">My books</h1>
      <SearchForm key={q} status={status} q={q} sort={sort} />
      <SortSelect status={status} q={q} sort={sort} />
      <StatusTabs current={status} q={q} sort={sort} />
      {(books.length > 0 || status || q) && (
        <Button asChild className="self-start">
          <Link href="/books/new">Add book</Link>
        </Button>
      )}
      {books.length > 0 && <BookList books={books} />}
      {books.length === 0 && q && <p className="text-muted-foreground">No books match &ldquo;{q}&rdquo;.</p>}
      {books.length === 0 && status && !q && <p className="text-muted-foreground">No books here. Add one or switch tabs.</p>}
      {books.length === 0 && !status && !q && (
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
