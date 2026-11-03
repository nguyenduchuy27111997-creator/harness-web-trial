import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BookStatusForm } from "@/components/book-status-form";
import { DeleteBookButton } from "@/components/delete-book-button";
import { RatingForm } from "@/components/rating-form";
import { ReviewForm } from "@/components/review-form";
import { StatusBadge } from "@/components/status-badge";
import { Card, CardContent } from "@/components/ui/card";
import { formatFinishDate, getBook } from "@/lib/books";
import { createClient, requireUser } from "@/lib/supabase/server";
import { deleteBook, saveRating, saveReview, updateStatus } from "./actions";

export const metadata: Metadata = { title: "Book · Bookshelf" };

// Blocking render (design M2): an unknown id must be able to answer 404 before anything streams.
export const instant = false;

export default async function BookPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await requireUser();
  const book = await getBook(await createClient(), id);
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
      <BookStatusForm status={book.status} action={updateStatus.bind(null, book.id)} />
      {book.status === "finished" && <RatingForm rating={book.rating} action={saveRating.bind(null, book.id)} />}
      {book.status === "finished" && <ReviewForm review={book.review} action={saveReview.bind(null, book.id)} />}
      <DeleteBookButton title={book.title} action={deleteBook.bind(null, book.id)} />
    </main>
  );
}
