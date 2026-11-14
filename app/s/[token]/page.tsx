import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BookCover } from "@/components/book-cover";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { signCovers } from "@/lib/covers";
import { getSharedShelf } from "@/lib/share";
import { createAnonClient } from "@/lib/supabase/server";

type Props = { params: Promise<{ token: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const shelf = await getSharedShelf(createAnonClient(), (await params).token);
  return { title: shelf ? `${shelf.name} · Bookshelf` : "Not found · Bookshelf" };
}

// A shared shelf, read-only, through the anon client: the same for every visitor.
export default async function SharedShelfPage({ params }: Props) {
  const supabase = createAnonClient();
  const shelf = await getSharedShelf(supabase, (await params).token);
  if (!shelf) notFound();
  const coverUrls = await signCovers(supabase, shelf.books.flatMap((b) => (b.coverPath ? [b.coverPath] : [])));
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:p-8">
      <h1 className="break-words font-heading text-4xl font-semibold tracking-tight">{shelf.name}</h1>
      {shelf.books.length === 0 ? (
        <p className="text-muted-foreground">This shelf has no books.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {shelf.books.map((book) => (
            <li key={book.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-4">
                  <BookCover title={book.title} url={(book.coverPath && coverUrls.get(book.coverPath)) || null} size="sm" />
                  <div className="flex min-w-0 flex-1 flex-col gap-1 break-words">
                    <span className="font-heading text-lg font-semibold">{book.title}</span>
                    <span className="text-sm text-muted-foreground">{book.author}</span>
                    {book.rating !== null && (
                      <span className="text-sm">Rating: {book.rating === 1 ? "1 star" : `${book.rating} stars`}</span>
                    )}
                  </div>
                  <StatusBadge status={book.status} />
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
