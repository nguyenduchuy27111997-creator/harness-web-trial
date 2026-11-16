import type { Metadata } from "next";
import Link from "next/link";
import { saveGoal } from "@/app/stats/actions";
import { ChangeGoal, GoalForm } from "@/components/goal-form";
import { EmptyYear } from "@/components/empty-year";
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
      <div className="flex items-center justify-between gap-4">
        <h1 className="font-heading text-large-title">Stats</h1>
        <Link href={`/stats/${year}`} className="link-target text-primary hover:underline">
          Year in review
        </Link>
      </div>
      {stats.finishedThisYear === 0 ? (
        // Empty year: no tiles. The chart stays with 12 zero rows (decision 0027).
        <>
          <StatsSentences finished={0} pagesRead={stats.pagesRead} average={stats.averageRating} />
          <EmptyYear year={year} />
        </>
      ) : (
        <StatsTiles finished={stats.finishedThisYear} pagesRead={stats.pagesRead} average={stats.averageRating} />
      )}
      <MonthlyChart byMonth={byMonth} />
      <section className="flex flex-col gap-3">
        <h2 className="font-heading text-title-2 font-semibold">
          Reading goal
        </h2>
        {goal === null ? (
          <div className="flex flex-col gap-3">
            <p id="goal-prompt">Set a reading goal for this year: how many books do you want to finish?</p>
            <GoalForm goal={null} submitLabel="Set goal" action={saveGoal} labelledBy="goal-prompt" />
          </div>
        ) : (
          <div className="flex flex-col gap-4 md:flex-row md:items-center">
            <GoalRing finished={stats.finishedThisYear} goal={goal} />
            <div>
              <ChangeGoal goal={goal} action={saveGoal} />
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
