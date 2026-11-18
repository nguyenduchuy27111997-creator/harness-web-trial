"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { booksHref, parseSearch, type BookSort, type BookStatus } from "@/lib/books";

// Navigates instead of a GET form so an empty search leaves no q in the URL (design M3). `href`, when given, builds the target instead of booksHref (QuoteSearchForm, design M5). `tall` gives /books its 36 px controls (F090).
export function SearchForm({ status, q, sort, shelf, tag, href, placeholder, hideLabel, tall }: { status?: BookStatus; q?: string; sort?: BookSort; shelf?: string; tag?: string; href?: (q?: string) => string; placeholder?: string; hideLabel?: boolean; tall?: boolean }) {
  const router = useRouter();
  const id = useId();
  return (
    <form
      role="search"
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get("q");
        const search = parseSearch(typeof value === "string" ? value : undefined);
        router.push(href ? href(search) : booksHref({ status, q: search, sort, shelf, tag }));
      }}
    >
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor={id} className={hideLabel ? "sr-only" : undefined}>
          Search
        </Label>
        <Input id={id} name="q" type="search" defaultValue={q} placeholder={placeholder} className={tall ? "h-9" : undefined} />
      </div>
      <Button type="submit" variant="outline" className={tall ? "h-9" : undefined}>
        Search
      </Button>
    </form>
  );
}
