import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import type { Book } from "@/lib/books";

export function BookList({ books }: { books: Book[] }) {
  return (
    <ul className="flex flex-col gap-3">
      {books.map((book) => (
        <li key={book.id}>
          <Card>
            <CardContent className="flex items-center justify-between gap-4">
              <div className="flex min-w-0 flex-col gap-1 break-words">
                <span className="font-heading text-lg font-semibold">{book.title}</span>
                <span className="text-sm text-muted-foreground">{book.author}</span>
              </div>
              <StatusBadge status={book.status} />
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
