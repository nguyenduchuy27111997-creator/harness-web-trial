"use client";

import Link from "next/link";
import { useBookListNavigate } from "@/components/book-list-skeleton";
import { BOOK_STATUSES, booksHref, type StatusCounts, STATUS_LABELS, type BookSort, type BookStatus } from "@/lib/books";
import { cn } from "@/lib/utils";

const TABS: { label: string; status?: BookStatus }[] = [
  { label: "All" },
  ...BOOK_STATUSES.map((status) => ({ label: STATUS_LABELS[status], status })),
];

// A segmented control of links (design M9): a 2×2 grid of equal segments below sm, one row from sm.
export function StatusTabs({ current, counts, q, sort, shelf, tag }: { current?: BookStatus; counts: StatusCounts; q?: string; sort?: BookSort; shelf?: string; tag?: string }) {
  const navigate = useBookListNavigate();
  return (
    <nav aria-label="Book filter" className="w-full sm:w-auto">
      <div className="grid grid-cols-2 gap-1 rounded-lg bg-muted p-1 sm:inline-flex sm:h-9 sm:items-center dark:border dark:bg-card">
        {TABS.map(({ label, status }) => {
          const href = booksHref({ status, q, sort, shelf, tag });
          const isCurrent = status === current;
          return (
            <Link
              key={label}
              href={href}
              aria-current={isCurrent ? "page" : undefined}
              onClick={(event) => {
                if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
                event.preventDefault();
                navigate(href);
              }}
              className={cn(
                "inline-flex h-11 shrink-0 items-center justify-center gap-1 whitespace-nowrap rounded-md px-3 text-callout text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:h-7",
                isCurrent && "bg-background font-medium text-foreground dark:border dark:bg-popover",
              )}
            >
              {label} <span className="tabular-nums">({status ? counts[status] : counts.all})</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
