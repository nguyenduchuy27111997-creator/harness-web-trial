"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { booksHref, parseSearch, type BookSort, type BookStatus } from "@/lib/books";

// Navigates instead of a plain GET form, so an empty search leaves no q= in the URL.
export function SearchForm({ status, q, sort }: { status?: BookStatus; q?: string; sort?: BookSort }) {
  const router = useRouter();
  return (
    <form
      role="search"
      className="flex items-end gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        const value = new FormData(event.currentTarget).get("q");
        router.push(booksHref({ status, q: parseSearch(String(value ?? "")), sort }));
      }}
    >
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor="q">Search</Label>
        <Input id="q" name="q" type="search" defaultValue={q} placeholder="Title or author" />
      </div>
      <Button type="submit">Search</Button>
    </form>
  );
}
