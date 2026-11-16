import type { Metadata } from "next";
import Link from "next/link";
import { saveGoal } from "@/app/stats/actions";
import { ChangeGoal, GoalForm } from "@/components/goal-form";
import { GoalRing } from "@/components/goal-ring";
import { MonthlyChart } from "@/components/monthly-chart";
import { StatsSentences, StatsTiles } from "@/components/stats-tiles";
import { getReadingGoal } from "@/lib/goals";
import { getFinishedByMonth, getStats } from "@/lib/stats";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Stats · Bookshelf" };

export default async function StatsPage() {
  await requireUser();
  const supabase = await createClient();
  const [stats, byMonth, goal] = await Promise.all([getStats(supabase), getFinishedByMonth(supabase), getReadingGoal(supabase)]);
  const year = new Date().getUTCFullYear();
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <h1 className="font-heading text-large-title">Stats</h1>
      {stats.finishedThisYear === 0 ? (
        // Empty year: no tiles. The chart stays with its empty line (decision 0027).
        <section className="flex flex-col gap-2">
          <StatsSentences finished={0} pagesRead={stats.pagesRead} average={stats.averageRating} />
          <p className="text-headline">No books finished in {year}</p>
          <Link href="/books" className="link-target self-start text-primary hover:underline">
            Go to my books
          </Link>
        </section>
      ) : (
        <StatsTiles finished={stats.finishedThisYear} pagesRead={stats.pagesRead} average={stats.averageRating} />
      )}
      <MonthlyChart byMonth={byMonth} />
      <Link href={`/stats/${year}`} className="link-target self-start text-primary hover:underline">
        Year in review
      </Link>
      {goal === null ? (
        <section className="flex flex-col gap-3">
          <p id="goal-prompt">Set a reading goal for this year: how many books do you want to finish?</p>
          <GoalForm goal={null} submitLabel="Set goal" action={saveGoal} labelledBy="goal-prompt" />
        </section>
      ) : (
        <section className="flex flex-col gap-4 md:flex-row md:items-center">
          <GoalRing finished={stats.finishedThisYear} goal={goal} />
          <div>
            <ChangeGoal goal={goal} action={saveGoal} />
          </div>
        </section>
      )}
    </div>
  );
}
