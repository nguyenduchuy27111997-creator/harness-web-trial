import Link from "next/link";
import { Button } from "@/components/ui/button";
import type { QueuedBook } from "@/lib/queue";

type Action = (bookId: string, formData: FormData) => Promise<void>;

type Props = { books: QueuedBook[]; moveUp: Action; moveDown: Action; remove: Action; startFirst: Action };

export function UpNextList({ books, moveUp, moveDown, remove, startFirst }: Props) {
  return (
    <ol className="flex flex-col gap-3">
      {books.map((book, i) => (
        <li key={book.bookId} className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3">
          <div className="min-w-0 break-words">
            <Link href={`/books/${book.bookId}`} className="font-medium text-primary hover:underline">
              {book.title}
            </Link>
            <p className="text-sm text-muted-foreground">{book.author}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {i === 0 && (
              <form action={startFirst.bind(null, book.bookId)}>
                <Button type="submit" size="sm">
                  Start reading {book.title}
                </Button>
              </form>
            )}
            {i > 0 && (
              <form action={moveUp.bind(null, book.bookId)}>
                <Button type="submit" variant="outline" size="sm">
                  Move up
                </Button>
              </form>
            )}
            {i < books.length - 1 && (
              <form action={moveDown.bind(null, book.bookId)}>
                <Button type="submit" variant="outline" size="sm">
                  Move down
                </Button>
              </form>
            )}
            <form action={remove.bind(null, book.bookId)}>
              <Button type="submit" variant="ghost" size="sm">
                Remove
              </Button>
            </form>
          </div>
        </li>
      ))}
    </ol>
  );
}
