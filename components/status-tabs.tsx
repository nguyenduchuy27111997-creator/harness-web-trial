import Link from "next/link";
import { BOOK_STATUSES, STATUS_LABELS, type BookStatus } from "@/lib/books";
import { cn } from "@/lib/utils";

const TABS: { label: string; status?: BookStatus }[] = [
  { label: "All" },
  ...BOOK_STATUSES.map((status) => ({ label: STATUS_LABELS[status], status })),
];

export function StatusTabs({ current }: { current?: BookStatus }) {
  return (
    <nav aria-label="Book filter" className="flex flex-wrap gap-2">
      {TABS.map(({ label, status }) => (
        <Link
          key={label}
          href={status ? `/books?status=${status}` : "/books"}
          aria-current={status === current ? "page" : undefined}
          className={cn(
            "rounded-full border px-3 py-1 text-sm font-medium text-muted-foreground hover:bg-muted",
            status === current && "border-primary bg-primary text-primary-foreground hover:bg-primary",
          )}
        >
          {label}
        </Link>
      ))}
    </nav>
  );
}
