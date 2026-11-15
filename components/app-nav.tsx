"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowDownUp,
  BookOpen,
  ChartColumn,
  Ellipsis,
  Library,
  ListOrdered,
  Quote,
  Settings,
  Tag,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";

type Destination = { href: string; label: string; icon: LucideIcon };

const MY_BOOKS = { href: "/books", label: "My books", icon: BookOpen };
const UP_NEXT = { href: "/up-next", label: "Up next", icon: ListOrdered };
const SHELVES = { href: "/shelves", label: "Shelves", icon: Library };
const TAGS = { href: "/tags", label: "Tags", icon: Tag };
const QUOTES = { href: "/quotes", label: "Quotes", icon: Quote };
const STATS = { href: "/stats", label: "Stats", icon: ChartColumn };
const LIBRARY = {
  href: "/library",
  label: "Import / export",
  icon: ArrowDownUp,
};
const SETTINGS = { href: "/settings", label: "Settings", icon: Settings };

const SIDEBAR_TOP: Destination[] = [
  MY_BOOKS,
  UP_NEXT,
  SHELVES,
  TAGS,
  QUOTES,
  STATS,
];
const SIDEBAR_BOTTOM: Destination[] = [LIBRARY, SETTINGS];
const TABS: Destination[] = [MY_BOOKS, UP_NEXT, SHELVES, STATS];
const MORE: Destination[] = [TAGS, QUOTES, LIBRARY, SETTINGS];

function isCurrent(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

// The app's navigation (docs/design/M9.md, Navigation): a sidebar from lg, a bottom tab bar under it.
export function AppNav({ variant }: { variant: "sidebar" | "tabs" }) {
  const pathname = usePathname();
  return variant === "sidebar" ? (
    <Sidebar pathname={pathname} />
  ) : (
    <TabBar pathname={pathname} />
  );
}

function Sidebar({ pathname }: { pathname: string }) {
  const row = ({ href, label, icon: Icon }: Destination) => {
    const current = isCurrent(pathname, href);
    return (
      <Link
        key={href}
        href={href}
        aria-current={current ? "page" : undefined}
        className={cn(
          "flex h-10 items-center gap-3 rounded-md px-3 text-callout text-sidebar-foreground hover:bg-sidebar-accent/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring",
          current &&
            "bg-sidebar-accent text-sidebar-accent-foreground font-medium",
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        {label}
      </Link>
    );
  };
  return (
    <nav
      aria-label="Main"
      className="flex flex-1 flex-col justify-between gap-4 px-3 pb-4"
    >
      <div className="flex flex-col gap-1">{SIDEBAR_TOP.map(row)}</div>
      <div className="flex flex-col gap-1">{SIDEBAR_BOTTOM.map(row)}</div>
    </nav>
  );
}

// Not merged through cn(): tailwind-merge reads text-caption-2 as a colour and drops it.
const TAB_LABEL = "w-full truncate text-caption-2 font-medium leading-none";

const tabClass = (current: boolean) =>
  cn(
    "flex min-h-11 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    current ? "text-primary" : "text-muted-foreground hover:text-foreground",
  );

function TabBar({ pathname }: { pathname: string }) {
  const [open, setOpen] = useState(false);
  const moreCurrent = MORE.some((d) => isCurrent(pathname, d.href));
  return (
    <nav aria-label="Main" className="flex">
      {TABS.map(({ href, label, icon: Icon }) => {
        const current = isCurrent(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={current ? "page" : undefined}
            className={tabClass(current)}
          >
            <Icon className="size-6" aria-hidden />
            <span className={TAB_LABEL}>{label}</span>
          </Link>
        );
      })}
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger
          aria-current={moreCurrent ? "page" : undefined}
          className={tabClass(moreCurrent)}
        >
          <Ellipsis className="size-6" aria-hidden />
          <span className={TAB_LABEL}>More</span>
        </SheetTrigger>
        <SheetContent side="bottom" className="pb-safe">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="flex flex-col px-4 pb-4">
            {MORE.map(({ href, label, icon: Icon }) => {
              const current = isCurrent(pathname, href);
              return (
                <Link
                  key={href}
                  href={href}
                  onClick={() => setOpen(false)}
                  aria-current={current ? "page" : undefined}
                  className={cn(
                    "flex min-h-11 items-center gap-3 rounded-md px-3 text-body hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    current && "text-primary font-medium",
                  )}
                >
                  <Icon className="size-5 shrink-0" aria-hidden />
                  {label}
                </Link>
              );
            })}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}
