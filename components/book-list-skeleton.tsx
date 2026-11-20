"use client";

import { useRouter } from "next/navigation";
import { createContext, useContext, useTransition, type ReactNode } from "react";
import { BOOK_GRID } from "@/components/book-grid";
import { Skeleton } from "@/components/ui/skeleton";

// Book-shaped placeholders in the list's own layout: rows on a phone, 2:3 covers on a computer (design M9).
// Invisible for the first 300 ms, so a fast load shows nothing.
export function BookListSkeleton() {
  return (
    <div role="status" className="w-full max-w-3xl lg:max-w-none">
      <span className="sr-only">Loading books</span>
      <ul aria-hidden="true" className={`${BOOK_GRID} animate-in fade-in fill-mode-backwards delay-300`}>
        {Array.from({ length: 10 }, (_, i) => (
          <li key={i} className="flex items-center gap-4 py-2 lg:flex-col lg:items-stretch lg:gap-2 lg:py-0">
            <Skeleton className="h-15 w-10 shrink-0 lg:aspect-2/3 lg:h-auto lg:w-full" />
            <div className="flex flex-1 flex-col gap-2">
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-3 w-1/2" />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

// While a filter change is on its way the list shows the placeholders; the controls stay.
const PendingContext = createContext<{ pending: boolean; navigate: (href: string) => void }>({ pending: false, navigate: () => {} });

export function BookListPending({ children }: { children: ReactNode }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  return (
    <PendingContext.Provider value={{ pending, navigate: (href) => startTransition(() => router.push(href)) }}>
      {children}
    </PendingContext.Provider>
  );
}

export const useBookListNavigate = () => useContext(PendingContext).navigate;

export function BookListSlot({ children }: { children: ReactNode }) {
  return useContext(PendingContext).pending ? <BookListSkeleton /> : children;
}
