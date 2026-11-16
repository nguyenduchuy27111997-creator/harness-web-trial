import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MonthlyChart } from "@/components/monthly-chart";
import { StatsTiles } from "@/components/stats-tiles";
import { YearReview } from "@/components/year-review";
import { countByMonth, listFinishedReads, parseYear, sumPages, summarizeYear } from "@/lib/stats";
import { createClient, requireUser } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ year: string }> }): Promise<Metadata> {
  const year = parseYear((await params).year);
  return { title: year === null ? "Page not found · Bookshelf" : `${year} in review · Bookshelf` };
}

export default async function YearReviewPage({ params }: { params: Promise<{ year: string }> }) {
  await requireUser();
  const year = parseYear((await params).year);
  if (year === null) notFound();
  const reads = await listFinishedReads(await createClient(), year);
  // The average tile matches the review's "Average rating" sentence (summarizeYear).
  const summary =
    reads.length === 0 ? (
      <section className="flex flex-col gap-2">
        <p className="text-headline">No books finished in {year}</p>
        <Link href="/books" className="link-target self-start text-primary hover:underline">
          Go to my books
        </Link>
      </section>
    ) : (
      <>
        <StatsTiles
          thisYear={false}
          finished={reads.length}
          pagesRead={sumPages(reads)}
          average={summarizeYear(reads).averageRating}
        />
        <MonthlyChart byMonth={countByMonth(reads)} />
      </>
    );
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <YearReview year={year} reads={reads} hasNextYear={year < new Date().getUTCFullYear()} summary={summary} />
    </div>
  );
}
