import type { Metadata } from "next";
import Link from "next/link";
import { saveGoal } from "@/app/stats/actions";
import { ChangeGoal, GoalForm } from "@/components/goal-form";
import { MonthlyChart } from "@/components/monthly-chart";
import { Progress } from "@/components/ui/progress";
import { getReadingGoal, goalProgress } from "@/lib/goals";
import { formatAverage, formatPagesRead, getFinishedByMonth, getStats } from "@/lib/stats";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Stats · Bookshelf" };

export default async function StatsPage() {
  await requireUser();
  const supabase = await createClient();
  const [stats, byMonth, goal] = await Promise.all([getStats(supabase), getFinishedByMonth(supabase), getReadingGoal(supabase)]);
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:p-8">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">Stats</h1>
      <p>Books finished this year: {stats.finishedThisYear}</p>
      <p>Average rating: {formatAverage(stats.averageRating)}</p>
      <p>{formatPagesRead(stats.pagesRead)}</p>
      <MonthlyChart byMonth={byMonth} />
      <Link href={`/stats/${new Date().getUTCFullYear()}`} className="self-start text-primary hover:underline">
        Year in review
      </Link>
      {goal === null ? (
        <section className="flex flex-col gap-3">
          <p>Set a reading goal for this year: how many books do you want to finish?</p>
          <GoalForm goal={null} submitLabel="Set goal" action={saveGoal} />
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <p>
            {stats.finishedThisYear} of {goal} books finished this year
          </p>
          <Progress value={goalProgress(stats.finishedThisYear, goal)} aria-label="Reading goal progress" />
          <div>
            <ChangeGoal goal={goal} action={saveGoal} />
          </div>
        </section>
      )}
    </main>
  );
}
