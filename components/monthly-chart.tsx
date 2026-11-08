const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export function MonthlyChart({ counts }: { counts: number[] }) {
  const top = Math.max(...counts);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-xl font-semibold">Finished by month</h2>
      <ol className="grid grid-cols-12 gap-1">
        {MONTHS.map((month, i) => (
          <li key={month} className="flex flex-col items-center gap-1 text-sm">
            <div className="flex h-24 w-full items-end" aria-hidden="true">
              <div className="w-full rounded-t bg-primary" style={{ height: `${top === 0 ? 0 : (counts[i] / top) * 100}%` }} />
            </div>
            <span>{month}</span>
            <span>{counts[i]}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
