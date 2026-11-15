"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/utils";
import { AppNav } from "@/components/app-nav";
import { AccountMenu } from "@/components/account-menu";

type AppShellProps = {
  signedIn: boolean;
  displayName?: string | null;
  signOut: () => Promise<void>;
  children: ReactNode;
};

const brand =
  "inline-flex min-h-11 items-center font-heading text-title-3 font-semibold";

// The page frame (docs/design/M9.md, Navigation): sidebar from lg, tab bar under it, a sticky blurred top bar.
// Signed out, only the top bar with the brand (decision 0022).
export function AppShell({
  signedIn,
  displayName,
  signOut,
  children,
}: AppShellProps) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 0);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="flex min-h-full flex-1">
      {signedIn && (
        <aside className="sticky top-0 hidden h-dvh w-64 shrink-0 flex-col border-r border-sidebar-border bg-sidebar lg:flex">
          <div className="px-6 py-2">
            <Link href="/books" className={brand}>
              Bookshelf
            </Link>
          </div>
          <AppNav variant="sidebar" />
        </aside>
      )}
      <div className="flex min-w-0 flex-1 flex-col">
        <header
          className={cn(
            "sticky top-0 z-10 border-b bg-background/80 backdrop-blur",
            scrolled ? "border-border" : "border-transparent",
          )}
        >
          <div className="flex min-h-14 items-center justify-between gap-2 px-4 md:px-6 lg:px-8">
            <Link
              href={signedIn ? "/books" : "/"}
              className={cn(brand, signedIn && "lg:hidden")}
            >
              Bookshelf
            </Link>
            {signedIn && (
              <div className="ml-auto">
                <AccountMenu displayName={displayName} signOut={signOut} />
              </div>
            )}
          </div>
        </header>
        <main
          className={cn(
            "flex-1 px-4 py-6 md:px-6 lg:px-8",
            signedIn && "pb-24 lg:pb-6",
          )}
        >
          {children}
          {signedIn && <div className="pb-safe lg:hidden" />}
        </main>
      </div>
      {signedIn && (
        <div className="fixed inset-x-0 bottom-0 z-10 border-t bg-background/80 pb-safe backdrop-blur lg:hidden">
          <AppNav variant="tabs" />
        </div>
      )}
    </div>
  );
}
