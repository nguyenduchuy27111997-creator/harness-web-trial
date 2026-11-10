import type { Metadata } from "next";
import Link from "next/link";
import { UpNextList } from "@/components/up-next-list";
import { booksHref } from "@/lib/books";
import { listUpNext } from "@/lib/queue";
import { createClient, requireUser } from "@/lib/supabase/server";
import { moveDown, moveUp, removeFromUpNext, startFirst } from "./actions";

export const metadata: Metadata = { title: "Up next · Bookshelf" };

export default async function UpNextPage() {
  await requireUser();
  const books = await listUpNext(await createClient());
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:p-8">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">Up next</h1>
      {books.length === 0 ? (
        <p className="text-muted-foreground">
          Nothing up next.{" "}
          <Link href={booksHref({ status: "want_to_read" })} className="text-primary underline">
            Pick from your Want to read books
          </Link>
          .
        </p>
      ) : (
        <UpNextList books={books} moveUp={moveUp} moveDown={moveDown} remove={removeFromUpNext} startFirst={startFirst} />
      )}
    </main>
  );
}
