import type { Metadata } from "next";
import Link from "next/link";
import { BookList } from "@/components/book-list";
import { Button } from "@/components/ui/button";
import { SearchForm } from "@/components/search-form";
import { ShelfSelect } from "@/components/shelf-select";
import { SortSelect } from "@/components/sort-select";
import { StatusTabs } from "@/components/status-tabs";
import { booksHref, countByStatus, filterBooks, listBooks, parseSearch, parseSort, parseStatusFilter, sortBooks } from "@/lib/books";
import { filterByShelf, listShelfBookIds, listShelves, parseShelfFilter } from "@/lib/shelves";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My books · Bookshelf" };

export default async function BooksPage({ searchParams }: { searchParams: Promise<{ status?: string | string[]; q?: string | string[]; sort?: string | string[]; shelf?: string | string[] }> }) {
  await requireUser();
  const params = await searchParams;
  const status = parseStatusFilter(params.status);
  const q = parseSearch(params.q);
  const sort = parseSort(params.sort);
  const supabase = await createClient();
  const [rows, shelves] = await Promise.all([listBooks(supabase), listShelves(supabase)]);
  const shelf = parseShelfFilter(params.shelf, shelves);
  const visible = filterBooks(filterByShelf(rows, shelf ? await listShelfBookIds(supabase, shelf) : undefined), q);
  const counts = countByStatus(visible);
  const books = sortBooks(status ? visible.filter((book) => book.status === status) : visible, sort);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:p-8">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">My books</h1>
      <SearchForm key={q} status={status} q={q} sort={sort} shelf={shelf} />
      {shelves.length > 0 && <ShelfSelect status={status} q={q} sort={sort} shelf={shelf} shelves={shelves} />}
      <SortSelect status={status} q={q} sort={sort} shelf={shelf} />
      <StatusTabs current={status} counts={counts} q={q} sort={sort} shelf={shelf} />
      {(books.length > 0 || status || shelf || q) && (
        <Button asChild className="self-start">
          <Link href="/books/new">Add book</Link>
        </Button>
      )}
      {books.length > 0 && <BookList books={books} />}
      {books.length === 0 && q && (
        <div className="flex flex-col items-start gap-2">
          <p className="text-muted-foreground">No books match &ldquo;{q}&rdquo;.</p>
          <Button asChild variant="link" className="h-auto p-0">
            <Link href={booksHref({ status, sort, shelf })}>Clear search</Link>
          </Button>
        </div>
      )}
      {books.length === 0 && (status || shelf) && !q && <p className="text-muted-foreground">No books here. Add one or switch tabs.</p>}
      {books.length === 0 && !status && !shelf && !q && (
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
