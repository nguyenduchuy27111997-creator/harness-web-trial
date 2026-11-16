const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// byMonth: 12 counts, index 0 = January. Bars are decorative; the list reads as "Mar 2".
// Under 768 px each month is a row (label, bar, count); from 768 px a column (bar, label, count).
export function MonthlyChart({ byMonth }: { byMonth: number[] }) {
  const top = Math.max(...byMonth);
  return (
    <section aria-labelledby="monthly-chart-heading" className="flex w-full flex-col gap-3">
      <h2 id="monthly-chart-heading" className="font-heading text-title-2 font-semibold">
        Finished by month
      </h2>
      <ol className="grid grid-cols-1 gap-2 md:grid-cols-12 md:gap-1">
        {MONTHS.map((month, i) => {
          const pct = top === 0 ? 0 : (byMonth[i] / top) * 100;
          return (
            <li key={month} className="flex items-center gap-3 text-footnote tabular-nums md:flex-col md:gap-1">
              <span className="w-9 text-muted-foreground md:w-auto">{month}</span>
              <div aria-hidden="true" className="flex h-3 min-w-0 flex-1 items-center md:order-first md:h-24 md:w-full md:flex-none md:items-end md:border-b md:border-border">
                <div className="h-full rounded-sm bg-chart-1 md:hidden" style={{ width: `${pct}%` }} />
                <div className="hidden w-full rounded-sm bg-chart-1 md:block" style={{ height: `${pct}%` }} />
              </div>
              <span className="w-6 text-right md:w-auto">{byMonth[i]}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
