import Link from "next/link";
import { Button } from "@/components/ui/button";
import { BOOK_STATUSES, booksHref, STATUS_LABELS, type BookSort, type BookStatus } from "@/lib/books";
import { cn } from "@/lib/utils";

const TABS: { label: string; status?: BookStatus }[] = [
  { label: "All" },
  ...BOOK_STATUSES.map((status) => ({ label: STATUS_LABELS[status], status })),
];

export function StatusTabs({ current, q, sort }: { current?: BookStatus; q?: string; sort?: BookSort }) {
  return (
    <nav aria-label="Book filter" className="flex flex-wrap gap-2">
      {TABS.map(({ label, status }) => (
        <Button
          key={label}
          asChild
          variant="ghost"
          className={cn(
            "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
            status === current && "bg-accent text-accent-foreground",
          )}
        >
          <Link
            href={booksHref({ status, q, sort })}
            aria-current={status === current ? "page" : undefined}
          >
            {label}
          </Link>
        </Button>
      ))}
    </nav>
  );
}
