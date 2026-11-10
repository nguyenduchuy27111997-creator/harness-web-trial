import Link from "next/link";
import { PendingSubmitButton } from "@/components/pending-submit-button";
import { Card, CardContent } from "@/components/ui/card";
import type { QueuedBook } from "@/lib/queue";

type Action = (bookId: string, formData: FormData) => Promise<void>;

type Props = { books: QueuedBook[]; moveUp: Action; moveDown: Action; remove: Action; startFirst: Action };

export function UpNextList({ books, moveUp, moveDown, remove, startFirst }: Props) {
  return (
    <ol className="flex flex-col gap-3">
      {books.map((book, i) => (
        <li key={book.bookId}>
          <Card>
            <CardContent className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1 break-words">
                <Link href={`/books/${book.bookId}`} className="font-heading text-lg font-semibold hover:underline">
                  {book.title}
                </Link>
                <span className="text-sm text-muted-foreground">{book.author}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {i === 0 && (
                  <form action={startFirst.bind(null, book.bookId)}>
                    <PendingSubmitButton size="sm" pendingLabel="Starting…">
                      Start reading {book.title}
                    </PendingSubmitButton>
                  </form>
                )}
                {i > 0 && (
                  <form action={moveUp.bind(null, book.bookId)}>
                    <PendingSubmitButton variant="outline" size="sm" pendingLabel="Moving…">
                      Move up
                    </PendingSubmitButton>
                  </form>
                )}
                {i < books.length - 1 && (
                  <form action={moveDown.bind(null, book.bookId)}>
                    <PendingSubmitButton variant="outline" size="sm" pendingLabel="Moving…">
                      Move down
                    </PendingSubmitButton>
                  </form>
                )}
                <form action={remove.bind(null, book.bookId)}>
                  <PendingSubmitButton variant="ghost" size="sm" pendingLabel="Removing…">
                    Remove
                  </PendingSubmitButton>
                </form>
              </div>
            </CardContent>
          </Card>
        </li>
      ))}
    </ol>
  );
}
