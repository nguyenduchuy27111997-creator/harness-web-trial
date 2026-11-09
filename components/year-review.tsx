import { StarIcon } from "lucide-react";
import Link from "next/link";
import { formatFinishDate } from "@/lib/books";
import { type FinishedRead, summarizeYear } from "@/lib/stats";

function Stars({ rating }: { rating: number }) {
  return (
    <span className="flex items-center gap-1 text-sm">
      {Array.from({ length: rating }, (_, i) => (
        <StarIcon key={i} aria-hidden className="size-4 text-primary" fill="currentColor" />
      ))}
      <span>{rating === 1 ? "1 star" : `${rating} stars`}</span>
    </span>
  );
}

export function YearReview({ year, reads, hasNextYear }: { year: number; reads: FinishedRead[]; hasNextYear: boolean }) {
  const { averageRating, highestRated } = summarizeYear(reads);
  return (
    <>
      <h1 className="font-heading text-4xl font-semibold tracking-tight">{year} in review</h1>
      <p>{reads.length === 0 ? `You finished no books in ${year}.` : `You finished ${reads.length} ${reads.length === 1 ? "book" : "books"} in ${year}.`}</p>
      {averageRating !== null && <p>Average rating: {averageRating.toFixed(1)}</p>}
      {highestRated.length > 0 && (
        <section className="flex flex-col gap-3">
          <h2 className="font-heading text-2xl font-semibold">Highest rated</h2>
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
          <h2 id="finished-reads" className="font-heading text-2xl font-semibold">
            Finished reads
          </h2>
          <ul aria-labelledby="finished-reads" className="flex flex-col gap-3">
            {reads.map((read) => (
              <li key={`${read.bookId}-${read.pastReadId ?? "current"}`} className="flex flex-col gap-1">
                <Link href={`/books/${read.bookId}`} className="font-heading font-medium text-primary hover:underline">
                  {read.title}
                </Link>
                <span className="text-sm text-muted-foreground">Finished on {formatFinishDate(read.finishedOn)}</span>
                {read.rating !== null && <Stars rating={read.rating} />}
              </li>
            ))}
          </ul>
        </section>
      )}
      <nav aria-label="Years" className="flex justify-between">
        {year > 1000 ? (
          <Link href={`/stats/${year - 1}`} className="text-primary hover:underline">
            Previous year
          </Link>
        ) : (
          <span />
        )}
        {hasNextYear && (
          <Link href={`/stats/${year + 1}`} className="text-primary hover:underline">
            Next year
          </Link>
        )}
      </nav>
    </>
  );
}
