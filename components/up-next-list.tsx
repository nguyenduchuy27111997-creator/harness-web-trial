"use client";

import Link from "next/link";
import { useTransition } from "react";
import { BookCover } from "@/components/book-cover";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { RowActions } from "@/components/row-actions";
import type { QueuedBook } from "@/lib/queue";

type Action = (bookId: string, formData: FormData) => Promise<void>;

type Props = { books: (QueuedBook & { coverUrl: string | null })[]; moveUp: Action; moveDown: Action; remove: Action; startFirst: Action };

export function UpNextList({ books, moveUp, moveDown, remove, startFirst }: Props) {
  const [, startTransition] = useTransition();
  const run = (action: Action, bookId: string) => () => startTransition(() => action(bookId, new FormData()));
  return (
    <ol className="flex flex-col divide-y">
      {books.map((book, i) => (
        <li key={book.bookId} className="flex items-center gap-3 py-3">
          <BookCover title={book.title} url={book.coverUrl} size="sm" />
          <div className="flex min-w-0 flex-1 flex-col break-words">
            <Link href={`/books/${book.bookId}`} className="font-heading text-headline font-semibold hover:underline">
              {book.title}
            </Link>
            <span className="text-subheadline text-muted-foreground">{book.author}</span>
          </div>
          {i === 0 && (
            <form action={startFirst.bind(null, book.bookId)}>
              <PendingSubmitButton className="h-11 lg:h-9" pendingLabel="Starting…" aria-label={`Start reading ${book.title}`}>
                Start reading
              </PendingSubmitButton>
            </form>
          )}
          <RowActions
            name={book.title}
            items={[
              ...(i > 0 ? [{ label: "Start reading", onSelect: run(startFirst, book.bookId) }] : []),
              ...(i > 0 ? [{ label: "Move up", onSelect: run(moveUp, book.bookId) }] : []),
              ...(i < books.length - 1 ? [{ label: "Move down", onSelect: run(moveDown, book.bookId) }] : []),
              { label: "Remove", onSelect: run(remove, book.bookId), destructive: true },
            ]}
          />
        </li>
      ))}
    </ol>
  );
}
