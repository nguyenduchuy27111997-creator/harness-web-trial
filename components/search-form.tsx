"use client";

import { useRouter } from "next/navigation";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { booksHref, parseSearch, type BookSort, type BookStatus } from "@/lib/books";

// Navigates instead of a GET form so an empty search leaves no q in the URL (design M3).
export function SearchForm({ status, q, sort }: { status?: BookStatus; q?: string; sort?: BookSort }) {
  const router = useRouter();
  const id = useId();
  return (
    <form
      role="search"
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get("q");
        router.push(booksHref({ status, q: parseSearch(typeof value === "string" ? value : undefined), sort }));
      }}
    >
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor={id}>Search</Label>
        <Input id={id} name="q" type="search" defaultValue={q} />
      </div>
      <Button type="submit" variant="outline">
        Search
      </Button>
    </form>
  );
}
