import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookQuotes } from "@/components/book-quotes";
import { BookShelves } from "@/components/book-shelves";
import { BookStatusForm } from "@/components/book-status-form";
import { BookNotes } from "@/components/book-notes";
import { DeleteBookButton } from "@/components/delete-book-button";
import { EditBookForm } from "@/components/edit-book-form";
import { ProgressForm } from "@/components/progress-form";
import { RatingForm } from "@/components/rating-form";
import { ReviewForm } from "@/components/review-form";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatFinishDate, getBook } from "@/lib/books";
import { listNotes } from "@/lib/notes";
import { listBookQuotes } from "@/lib/quotes";
import { listBookShelfIds, listShelves } from "@/lib/shelves";
import { createClient, requireUser } from "@/lib/supabase/server";
import {
  addNote,
  addQuote,
  addToShelf,
  deleteBook,
  editBook,
  removeFromShelf,
  saveProgress,
  saveRating,
  saveReview,
  updateStatus,
} from "./actions";

export const metadata: Metadata = { title: "Book · Bookshelf" };

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const supabase = await createClient();
  const [book, shelves, shelfIds, notes, quotes] = await Promise.all([
    getBook(supabase, id),
    listShelves(supabase),
    listBookShelfIds(supabase, id),
    listNotes(supabase, id),
    listBookQuotes(supabase, id),
  ]);
  if (!book) notFound();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:p-8">
      <Link href="/books" className="self-start text-sm text-primary hover:underline">
        Back to my books
      </Link>
      <Card>
        <CardContent className="flex flex-col gap-3 break-words">
          <h1 className="font-heading text-4xl font-semibold tracking-tight">{book.title}</h1>
          <p className="text-muted-foreground">{book.author}</p>
          <StatusBadge status={book.status} />
          {book.finished_on && <p className="text-sm text-muted-foreground">Finished on {formatFinishDate(book.finished_on)}</p>}
        </CardContent>
      </Card>
      <EditBookForm key={`${book.title}\n${book.author}`} title={book.title} author={book.author} action={editBook.bind(null, book.id)} />
      <BookStatusForm status={book.status} action={updateStatus.bind(null, book.id)} />
      <BookShelves
        shelves={shelves}
        onShelfIds={shelfIds}
        action={addToShelf.bind(null, book.id)}
        removeAction={removeFromShelf.bind(null, book.id)}
      />
      {book.status === "reading" && (
        <ProgressForm
          totalPages={book.total_pages}
          currentPage={book.current_page}
          action={saveProgress.bind(null, book.id)}
        />
      )}
      {book.status === "finished" && <RatingForm rating={book.rating} action={saveRating.bind(null, book.id)} />}
      {book.status === "finished" && <ReviewForm review={book.review} action={saveReview.bind(null, book.id)} />}
      <BookNotes notes={notes} action={addNote.bind(null, book.id)} />
      <BookQuotes quotes={quotes} action={addQuote.bind(null, book.id)} />
      <DeleteBookButton title={book.title} action={deleteBook.bind(null, book.id)} />
    </main>
  );
}
