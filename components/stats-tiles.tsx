import { formatAverage, formatPagesRead } from "@/lib/stats";

function StatTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
      <span className="text-footnote text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

// The tiles are drawn for the eye; the sentences under sr-only are what a screen reader hears.
export function StatsTiles({ finished, pagesRead, average }: { finished: number; pagesRead: number; average: number | null }) {
  return (
    <section aria-label="This year in numbers">
      <p className="sr-only">Books finished this year: {finished}</p>
      <p className="sr-only">Average rating: {formatAverage(average)}</p>
      <p className="sr-only">{formatPagesRead(pagesRead)}</p>
      <div aria-hidden="true" className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatTile label="Books finished">
          <span className="text-title-1 tabular-nums">{finished}</span>
        </StatTile>
        <StatTile label="Pages read">
          <span className="text-title-1 tabular-nums">{pagesRead.toLocaleString("en-US")}</span>
        </StatTile>
        <StatTile label="Average rating">
          {average === null ? (
            <span className="text-callout text-muted-foreground">No ratings</span>
          ) : (
            <span className="text-title-1 tabular-nums">{average.toFixed(1)}</span>
          )}
        </StatTile>
      </div>
    </section>
  );
}
