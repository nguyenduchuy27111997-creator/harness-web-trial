import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookQuotes } from "@/components/book-quotes";
import { BookTags } from "@/components/book-tags";
import { BookShelves } from "@/components/book-shelves";
import { BookStatusForm } from "@/components/book-status-form";
import { BookNotes } from "@/components/book-notes";
import { DeleteBookButton } from "@/components/delete-book-button";
import { EditBookForm } from "@/components/edit-book-form";
import { EditDatesForm } from "@/components/edit-dates-form";
import { PastReads } from "@/components/past-reads";
import { ProgressForm } from "@/components/progress-form";
import { ReadAgainButton } from "@/components/read-again-button";
import { RatingForm } from "@/components/rating-form";
import { ReadingDates } from "@/components/reading-dates";
import { ReviewForm } from "@/components/review-form";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { getBook } from "@/lib/books";
import { listPastReads } from "@/lib/reads";
import { listNotes } from "@/lib/notes";
import { listBookQuotes } from "@/lib/quotes";
import { listBookTags } from "@/lib/tags";
import { listBookShelfIds, listShelves } from "@/lib/shelves";
import { createClient, requireUser } from "@/lib/supabase/server";
import {
  addNote,
  addQuote,
  deleteQuote,
  editQuote,
  editNote,
  deleteNote,
  addBookTag,
  addToShelf,
  deleteBook,
  editBook,
  editDates,
  readBookAgain,
  deletePastRead,
  removeBookTag,
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
  const [book, shelves, shelfIds, tags, notes, quotes, pastReads] = await Promise.all([
    getBook(supabase, id),
    listShelves(supabase),
    listBookShelfIds(supabase, id),
    listBookTags(supabase, id),
    listNotes(supabase, id),
    listBookQuotes(supabase, id),
    listPastReads(supabase, id),
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
          <ReadingDates startedOn={book.started_on} finishedOn={book.finished_on} />
        </CardContent>
      </Card>
      <EditBookForm key={`${book.title}\n${book.author}`} title={book.title} author={book.author} action={editBook.bind(null, book.id)} />
      {book.status !== "want_to_read" && (
        <EditDatesForm
          key={`${book.started_on}\n${book.finished_on}`}
          startedOn={book.started_on}
          finishedOn={book.status === "finished" ? book.finished_on : null}
          action={editDates.bind(null, book.id)}
        />
      )}
      <BookStatusForm status={book.status} action={updateStatus.bind(null, book.id)} />
      <BookShelves
        shelves={shelves}
        onShelfIds={shelfIds}
        action={addToShelf.bind(null, book.id)}
        removeAction={removeFromShelf.bind(null, book.id)}
      />
      <BookTags tags={tags} action={addBookTag.bind(null, book.id)} removeAction={removeBookTag.bind(null, book.id)} />
      {book.status === "reading" && (
        <ProgressForm
          totalPages={book.total_pages}
          currentPage={book.current_page}
          action={saveProgress.bind(null, book.id)}
        />
      )}
      {book.status === "finished" && <RatingForm rating={book.rating} action={saveRating.bind(null, book.id)} />}
      {book.status === "finished" && <ReadAgainButton action={readBookAgain.bind(null, book.id)} />}
      {book.status === "finished" && <ReviewForm review={book.review} action={saveReview.bind(null, book.id)} />}
      <PastReads reads={pastReads} deleteAction={deletePastRead.bind(null, book.id)} />
      <BookNotes
        notes={notes}
        action={addNote.bind(null, book.id)}
        editAction={editNote.bind(null, book.id)}
        deleteAction={deleteNote.bind(null, book.id)}
      />
      <BookQuotes
        quotes={quotes}
        action={addQuote.bind(null, book.id)}
        editAction={editQuote.bind(null, book.id)}
        deleteAction={deleteQuote.bind(null, book.id)}
      />
      <DeleteBookButton title={book.title} action={deleteBook.bind(null, book.id)} />
    </main>
  );
}
