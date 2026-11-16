import type { Metadata } from "next";
import Link from "next/link";
import { saveGoal } from "@/app/stats/actions";
import { ChangeGoal, GoalForm } from "@/components/goal-form";
import { MonthlyChart } from "@/components/monthly-chart";
import { GoalRing } from "@/components/stats-goal-ring";
import { StatsTiles } from "@/components/stats-tiles";
import { getReadingGoal, goalProgress } from "@/lib/goals";
import { getFinishedByMonth, getStats } from "@/lib/stats";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Stats · Bookshelf" };

export default async function StatsPage() {
  await requireUser();
  const supabase = await createClient();
  const [stats, byMonth, goal] = await Promise.all([getStats(supabase), getFinishedByMonth(supabase), getReadingGoal(supabase)]);
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <h1 className="font-heading text-large-title">Stats</h1>
      <StatsTiles finished={stats.finishedThisYear} pagesRead={stats.pagesRead} average={stats.averageRating} />
      <MonthlyChart byMonth={byMonth} />
      <Link href={`/stats/${new Date().getUTCFullYear()}`} className="link-target self-start text-primary hover:underline">
        Year in review
      </Link>
      {goal === null ? (
        <section className="flex flex-col gap-3">
          <p>Set a reading goal for this year: how many books do you want to finish?</p>
          <GoalForm goal={null} submitLabel="Set goal" action={saveGoal} />
        </section>
      ) : (
        <section className="flex flex-col gap-4 sm:flex-row sm:items-center">
          <GoalRing percent={goalProgress(stats.finishedThisYear, goal)} finished={stats.finishedThisYear} goal={goal} />
          <div className="flex flex-col gap-3">
            <p>
              {stats.finishedThisYear} of {goal} books finished this year
            </p>
            <div>
              <ChangeGoal goal={goal} action={saveGoal} />
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
