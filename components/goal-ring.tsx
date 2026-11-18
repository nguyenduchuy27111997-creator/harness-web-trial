import { goalProgress } from "@/lib/goals";

const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// The ring is the progressbar; the sentence beside it says the numbers (not color alone).
export function GoalRing({ finished, goal }: { finished: number; goal: number }) {
  const percent = goalProgress(finished, goal);
  return (
    <div className="flex items-center gap-4">
      <div className="relative size-28 shrink-0">
        <svg
          viewBox="0 0 100 100"
          role="progressbar"
          aria-label="Reading goal progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={percent}
          className="size-full -rotate-90"
        >
          <circle cx="50" cy="50" r={RADIUS} fill="none" strokeWidth="10" className="stroke-muted" />
          <circle
            cx="50"
            cy="50"
            r={RADIUS}
            fill="none"
            strokeWidth="10"
            className="stroke-chart-1"
            strokeDasharray={`${(percent / 100) * CIRCUMFERENCE} ${CIRCUMFERENCE}`}
          />
        </svg>
        <div aria-hidden="true" className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-title-2 font-semibold tabular-nums">{finished}</span>
          <span className="text-footnote text-muted-foreground tabular-nums">of {goal}</span>
        </div>
      </div>
      <p>
        {finished} of {goal} books finished this year
      </p>
    </div>
  );
}
