import Link from "next/link";
import { BookCover } from "@/components/book-cover";
import { BOOK_GRID } from "@/components/book-grid";
import { StatusBadge } from "@/components/status-badge";
import { TagChip } from "@/components/tag-chip";
import { Progress } from "@/components/ui/progress";
import { progressPercent, type ShelfBook } from "@/lib/books";

// Rows with a small cover on a phone, two columns of rows on a tablet, a grid of covers from 1024 px (design M9).
// The title link stretches over its cell, so the whole cell is one link.
export function BookList({ books, tagsByBook, coverUrls }: { books: ShelfBook[]; tagsByBook?: Map<string, string[]>; coverUrls?: Map<string, string> }) {
  return (
    <ul className={`w-full max-w-3xl lg:max-w-none ${BOOK_GRID}`}>
      {books.map((book) => {
        const percent =
          book.status === "reading" && book.total_pages !== null && book.current_page !== null
            ? progressPercent(book.current_page, book.total_pages)
            : null;
        return (
          <li key={book.id} className="group relative flex items-center gap-4 py-2 lg:flex-col lg:items-stretch lg:gap-2 lg:py-0">
            <BookCover
              title={book.title}
              url={(book.cover_path && coverUrls?.get(book.cover_path)) || null}
              size="fill"
              className="transition-opacity duration-150 group-hover:opacity-90 group-active:opacity-80"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1 break-words">
              <Link
                href={`/books/${book.id}`}
                className="link-target font-heading text-headline font-semibold after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-background lg:line-clamp-2"
              >
                {book.title}
              </Link>
              <span className="text-subheadline text-muted-foreground lg:line-clamp-1">{book.author}</span>
              {(tagsByBook?.get(book.id)?.length ?? 0) > 0 && (
                <ul aria-label={`Tags for ${book.title}`} className="flex flex-wrap gap-1">
                  {tagsByBook?.get(book.id)?.map((name) => (
                    <li key={name} className="max-w-full">
                      <TagChip name={name} />
                    </li>
                  ))}
                </ul>
              )}
              {percent !== null && (
                <div className="flex items-center gap-2">
                  <Progress value={percent} aria-label={`Reading progress for ${book.title}`} className="w-32" />
                  <span className="text-subheadline text-muted-foreground">{percent}%</span>
                </div>
              )}
            </div>
            <div className="shrink-0 lg:self-start">
              <StatusBadge status={book.status} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
