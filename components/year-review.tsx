import { StarIcon } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { formatFinishDate } from "@/lib/books";
import { type FinishedRead, summarizeYear } from "@/lib/stats";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-1 text-subheadline">
      {Array.from({ length: rating }, (_, i) => (
        <StarIcon key={i} aria-hidden className="size-4 text-primary" fill="currentColor" />
      ))}
      <span>{rating === 1 ? "1 star" : `${rating} stars`}</span>
    </span>
  );
}

// summary: the tiles and chart (or the empty year), shown under the opening sentence.
export function YearReview({
  year,
  reads,
  hasNextYear,
  summary,
}: {
  year: number;
  reads: FinishedRead[];
  hasNextYear: boolean;
  summary?: ReactNode;
}) {
  const { averageRating, highestRated } = summarizeYear(reads);
  return (
    <>
      <h1 className="font-heading text-title-1">{year} in review</h1>
      {/* An empty year shows only the empty state; the sentence stays for screen readers (F061, F063 read it). */}
      <p className={reads.length === 0 ? "sr-only" : undefined}>{reads.length === 0 ? `You finished no books in ${year}.` : `You finished ${reads.length} ${reads.length === 1 ? "book" : "books"} in ${year}.`}</p>
      {summary}
      {averageRating !== null && <p>Average rating: {averageRating.toFixed(1)}</p>}
      {highestRated.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-title-2 font-semibold">Highest rated</h2>
          <ul className="flex flex-col gap-3">
            {highestRated.map((read) => (
              <li key={`${read.bookId}-${read.pastReadId ?? "current"}`} className="flex flex-col gap-1">
                <Link href={`/books/${read.bookId}`} className="font-heading font-medium text-primary hover:underline">
                  {read.title}
                </Link>
                {read.rating !== null && <Stars rating={read.rating} />}
              </li>
            ))}
          </ul>
        </section>
      )}
      {reads.length > 0 && (
        <section aria-labelledby="finished-reads" className="flex flex-col gap-3">
          <h2 id="finished-reads" className="font-heading text-title-2 font-semibold">
            Finished reads
          </h2>
          <ul aria-labelledby="finished-reads" className="flex flex-col gap-3">
            {reads.map((read) => (
              <li key={`${read.bookId}-${read.pastReadId ?? "current"}`} className="flex flex-col gap-1">
                <Link href={`/books/${read.bookId}`} className="font-heading font-medium text-primary hover:underline">
                  {read.title}
                </Link>
                <span className="text-subheadline text-muted-foreground">Finished on {formatFinishDate(read.finishedOn)}</span>
                {read.rating !== null && <Stars rating={read.rating} />}
              </li>
            ))}
          </ul>
        </section>
      )}
      <nav aria-label="Years" className="flex justify-between">
        {year > 1000 ? (
          <Link href={`/stats/${year - 1}`} className="link-target text-primary hover:underline">
            Previous year
          </Link>
        ) : (
          <span />
        )}
        {hasNextYear && (
          <Link href={`/stats/${year + 1}`} className="link-target text-primary hover:underline">
            Next year
          </Link>
        )}
      </nav>
    </>
  );
}
