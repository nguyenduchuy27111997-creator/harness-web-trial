import Link from "next/link";
import { BookCover } from "@/components/book-cover";
import { StatusBadge } from "@/components/status-badge";
import { TagChip } from "@/components/tag-chip";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { progressPercent, type ShelfBook } from "@/lib/books";

export function BookList({ books, tagsByBook, coverUrls }: { books: ShelfBook[]; tagsByBook?: Map<string, string[]>; coverUrls?: Map<string, string> }) {
  return (
    <ul className="flex flex-col gap-3">
      {books.map((book) => {
        const percent =
          book.status === "reading" && book.total_pages !== null && book.current_page !== null
            ? progressPercent(book.current_page, book.total_pages)
            : null;
        return (
          <li key={book.id}>
            <Card>
              <CardContent className="flex items-center justify-between gap-4">
                <BookCover title={book.title} url={(book.cover_path && coverUrls?.get(book.cover_path)) || null} size="sm" />
                <div className="flex min-w-0 flex-1 flex-col gap-1 break-words">
                  <Link href={`/books/${book.id}`} className="font-heading text-lg font-semibold hover:underline">
                    {book.title}
                  </Link>
                  <span className="text-sm text-muted-foreground">{book.author}</span>
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
                      <span className="text-sm text-muted-foreground">{percent}%</span>
                    </div>
                  )}
                </div>
                <StatusBadge status={book.status} />
              </CardContent>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
