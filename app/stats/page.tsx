import type { Metadata } from "next";
import { formatAverage, getStats } from "@/lib/stats";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Stats · Bookshelf" };

export default async function StatsPage() {
  await requireUser();
  const stats = await getStats(await createClient());
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:p-8">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">Stats</h1>
      <p>Books finished this year: {stats.finishedThisYear}</p>
      <p>Average rating: {formatAverage(stats.averageRating)}</p>
    </main>
  );
}
