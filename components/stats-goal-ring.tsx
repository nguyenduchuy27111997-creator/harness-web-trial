const RADIUS = 40;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// percent: 0 to 100 (goalProgress). The ring is the progressbar; the sentence beside it says the numbers.
export function GoalRing({ percent, finished, goal }: { percent: number; finished: number; goal: number }) {
  return (
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
  );
}
