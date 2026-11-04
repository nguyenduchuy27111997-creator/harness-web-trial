"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { SORT_LABELS, booksHref, parseSort, type BookSort, type BookStatus } from "@/lib/books";

export function SortSelect({ status, q, sort }: { status?: BookStatus; q?: string; sort: BookSort }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="sort">Sort</Label>
      <Select value={sort} onValueChange={(value) => router.push(booksHref({ status, q, sort: parseSort(value) }))}>
        <SelectTrigger id="sort" className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {(Object.keys(SORT_LABELS) as BookSort[]).map((s) => (
            <SelectItem key={s} value={s}>
              {SORT_LABELS[s]}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
