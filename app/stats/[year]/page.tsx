import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { YearReview } from "@/components/year-review";
import { listFinishedReads, parseYear } from "@/lib/stats";
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
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <YearReview year={year} reads={reads} hasNextYear={year < new Date().getUTCFullYear()} />
    </div>
  );
}
