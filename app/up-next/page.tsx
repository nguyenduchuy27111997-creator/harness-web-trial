import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { UpNextList } from "@/components/up-next-list";
import { booksHref } from "@/lib/books";
import { signCovers } from "@/lib/covers";
import { listUpNext } from "@/lib/queue";
import { createClient, requireUser } from "@/lib/supabase/server";
import { moveDown, moveUp, removeFromUpNext, startFirst } from "./actions";

export const metadata: Metadata = { title: "Up next · Bookshelf" };

export default async function UpNextPage() {
  await requireUser();
  const supabase = await createClient();
  const books = await listUpNext(supabase);
  const urls = await signCovers(supabase, books.flatMap((book) => book.coverPath ?? []));
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <h1 className="font-heading text-large-title">Up next</h1>
      {books.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-title-2">Nothing up next.</p>
          <Button asChild variant="secondary">
            <Link href={booksHref({ status: "want_to_read" })}>Pick from your Want to read books</Link>
          </Button>
        </div>
      ) : (
        <UpNextList books={books.map((book) => ({ ...book, coverUrl: book.coverPath ? (urls.get(book.coverPath) ?? null) : null }))} moveUp={moveUp} moveDown={moveDown} remove={removeFromUpNext} startFirst={startFirst} />
      )}
    </div>
  );
}
