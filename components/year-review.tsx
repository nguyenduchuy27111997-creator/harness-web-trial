import { StarIcon } from "lucide-react";
import Link from "next/link";
import { formatFinishDate } from "@/lib/books";
import type { FinishedRead } from "@/lib/stats";

export function YearReview({ year, reads }: { year: number; reads: FinishedRead[] }) {
  return (
    <>
      <h1 className="font-heading text-4xl font-semibold tracking-tight">{year} in review</h1>
      <p>{reads.length === 0 ? `You finished no books in ${year}.` : `You finished ${reads.length} ${reads.length === 1 ? "book" : "books"} in ${year}.`}</p>
      {reads.length > 0 && (
        <ul className="flex flex-col gap-3">
          {reads.map((read) => (
            <li key={`${read.bookId}-${read.pastReadId ?? "current"}`} className="flex flex-col gap-1">
              <Link href={`/books/${read.bookId}`} className="font-medium text-primary hover:underline">
                {read.title}
              </Link>
              <span className="text-sm text-muted-foreground">Finished on {formatFinishDate(read.finishedOn)}</span>
              {read.rating !== null && (
                <span className="flex items-center gap-1 text-sm">
                  {Array.from({ length: read.rating }, (_, i) => (
                    <StarIcon key={i} aria-hidden className="size-4 text-primary" fill="currentColor" />
                  ))}
                  <span>{read.rating === 1 ? "1 star" : `${read.rating} stars`}</span>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
