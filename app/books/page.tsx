import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { BookList } from "@/components/book-list";
import { BookListPending, BookListSkeleton, BookListSlot } from "@/components/book-list-skeleton";
import { Button } from "@/components/ui/button";
import { SearchForm } from "@/components/search-form";
import { listTaggedBookIds, listTagsForBooks, parseTagFilter, sortTags } from "@/lib/tags";
import { ShelfSelect } from "@/components/shelf-select";
import { TagSelect } from "@/components/tag-select";
import { SortSelect } from "@/components/sort-select";
import { LoadMore } from "@/components/load-more";
import { LiveRefresh } from "./live-refresh";
import { StatusTabs } from "@/components/status-tabs";
import { booksHref, countByStatus, filterBooks, listBooks, PAGE_SIZE, pageBooks, parseLimit, parseSearch, parseSort, parseStatusFilter, sortBooks } from "@/lib/books";
import { filterByShelf, listShelfBookIds, listShelves, parseShelfFilter } from "@/lib/shelves";
import { signCovers } from "@/lib/covers";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "My books · Bookshelf" };

type BooksParams = { status?: string | string[]; q?: string | string[]; sort?: string | string[]; shelf?: string | string[]; tag?: string | string[]; limit?: string | string[] };

function Header({ add }: { add: boolean }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h1 className="font-heading text-large-title">My books</h1>
      {add && (
        <Button asChild>
          <Link href="/books/new">Add book</Link>
        </Button>
      )}
    </div>
  );
}

// The title and Add book come at once; the list streams in behind book-shaped placeholders (design M9).
export default async function BooksPage({ searchParams }: { searchParams: Promise<BooksParams> }) {
  const user = await requireUser();
  const params = await searchParams;
  return (
    <div className="flex w-full flex-col gap-6">
      <LiveRefresh userId={user.id} />
      <Suspense
        key={JSON.stringify(params)}
        fallback={
          <>
            <Header add />
            <BookListSkeleton />
          </>
        }
      >
        <Books params={params} />
      </Suspense>
    </div>
  );
}

async function Books({ params }: { params: BooksParams }) {
  const status = parseStatusFilter(params.status);
  const q = parseSearch(params.q);
  const sort = parseSort(params.sort);
  const limit = parseLimit(params.limit);
  const supabase = await createClient();
  const [rows, shelves, tagsByBook] = await Promise.all([listBooks(supabase), listShelves(supabase), listTagsForBooks(supabase)]);
  const shelf = parseShelfFilter(params.shelf, shelves);
  const tagNames = sortTags([...new Set([...tagsByBook.values()].flat())].map((name) => ({ id: name, name })));
  const tag = parseTagFilter(params.tag, tagNames);
  const taggedIds = tag ? await listTaggedBookIds(supabase, tag) : undefined;
  const byShelf = filterByShelf(rows, shelf ? await listShelfBookIds(supabase, shelf) : undefined);
  const visible = filterBooks(taggedIds ? byShelf.filter((book) => taggedIds.has(book.id)) : byShelf, q);
  const counts = countByStatus(visible);
  const sorted = sortBooks(status ? visible.filter((book) => book.status === status) : visible, sort);
  const { books, hasMore } = pageBooks(sorted, limit);
  const coverUrls = await signCovers(supabase, books.flatMap((b) => (b.cover_path ? [b.cover_path] : [])));
  // No books at all: only the title and what to do next.
  if (books.length === 0 && !status && !shelf && !tag && !q) {
    return (
      <>
        <Header add={false} />
        <div className="flex max-w-prose flex-col items-start gap-4">
          <h2 className="text-title-2">No books yet</h2>
          <p className="text-body text-muted-foreground">Your shelf is empty. Add your first book to get started.</p>
          <Button asChild>
            <Link href="/books/new">Add book</Link>
          </Button>
        </div>
      </>
    );
  }
  return (
    <BookListPending>
      <Header add />
      <SearchForm key={q} status={status} q={q} sort={sort} shelf={shelf} tag={tag} placeholder="Search books" hideLabel />
      <div className="flex flex-wrap items-end gap-4">
        <StatusTabs current={status} counts={counts} q={q} sort={sort} shelf={shelf} tag={tag} />
        {shelves.length > 0 && <ShelfSelect status={status} q={q} sort={sort} shelf={shelf} tag={tag} shelves={shelves} />}
        {tagNames.length > 0 && <TagSelect status={status} q={q} sort={sort} shelf={shelf} tag={tag} tags={tagNames.map((t) => t.name)} />}
        <SortSelect status={status} q={q} sort={sort} shelf={shelf} tag={tag} />
      </div>
      <BookListSlot>
        {books.length > 0 && <BookList books={books} tagsByBook={tagsByBook} coverUrls={coverUrls} />}
        {hasMore && <LoadMore href={booksHref({ status, q, sort, shelf, tag, limit: limit + PAGE_SIZE })} />}
        {books.length === 0 && q && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-muted-foreground">No books match &ldquo;{q}&rdquo;.</p>
            <Button asChild variant="link" className="h-auto p-0">
              <Link href={booksHref({ status, sort, shelf, tag })}>Clear search</Link>
            </Button>
          </div>
        )}
        {books.length === 0 && (status || shelf || tag) && !q && (
          <div className="flex flex-col items-start gap-2">
            <p className="text-muted-foreground">No books here. Add one or switch tabs.</p>
            {tag && (
              <Button asChild variant="link" className="h-auto p-0">
                <Link href={booksHref({ status, sort, shelf })}>Show all tags</Link>
              </Button>
            )}
          </div>
        )}
      </BookListSlot>
    </BookListPending>
  );
}
