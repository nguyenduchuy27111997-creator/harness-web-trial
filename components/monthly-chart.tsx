const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// byMonth: 12 counts, index 0 = January. Bars are decorative; the list reads as "Mar 2".
export function MonthlyChart({ byMonth }: { byMonth: number[] }) {
  const top = Math.max(...byMonth);
  return (
    <section aria-labelledby="monthly-chart-heading" className="flex flex-col gap-3">
      <h2 id="monthly-chart-heading" className="font-heading text-2xl font-semibold">
        Finished by month
      </h2>
      <ol className="grid grid-cols-6 gap-x-1 gap-y-4 sm:grid-cols-12">
        {MONTHS.map((month, i) => (
          <li key={month} className="flex flex-col items-center gap-1 text-sm">
            <div aria-hidden="true" className="flex h-24 w-full items-end border-b border-border">
              <div className="w-full rounded-sm bg-primary" style={{ height: `${top === 0 ? 0 : (byMonth[i] / top) * 100}%` }} />
            </div>
            <span className="text-muted-foreground">{month}</span>
            <span>{byMonth[i]}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
