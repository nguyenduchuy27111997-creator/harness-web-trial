import { formatAverage, formatPagesRead } from "@/lib/stats";

function StatTile({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border bg-card p-4">
      <span className="text-footnote text-muted-foreground">{label}</span>
      {children}
    </div>
  );
}

// On /stats the tiles are drawn for the eye and the "this year" sentences (StatsSentences) are what a
// screen reader hears. On /stats/[year] the year review says the sentences, so the tiles are read as they are.
export function StatsSentences({ finished, pagesRead, average }: { finished: number; pagesRead: number; average: number | null }) {
  return (
    <>
      <p className="sr-only">Books finished this year: {finished}</p>
      <p className="sr-only">Average rating: {formatAverage(average)}</p>
      <p className="sr-only">{formatPagesRead(pagesRead)}</p>
    </>
  );
}

export function StatsTiles({
  finished,
  pagesRead,
  average,
  thisYear = true,
}: {
  finished: number;
  pagesRead: number;
  average: number | null;
  thisYear?: boolean;
}) {
  return (
    <section aria-label={thisYear ? "This year in numbers" : "The year in numbers"}>
      {thisYear && <StatsSentences finished={finished} pagesRead={pagesRead} average={average} />}
      <div aria-hidden={thisYear ? true : undefined} className="grid grid-cols-2 gap-3 md:grid-cols-3">
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
