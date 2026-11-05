"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { booksHref, type BookSort, type BookStatus } from "@/lib/books";
import type { Shelf } from "@/lib/shelves";

// "all" is the item for no filter: Radix refuses an empty item value, and it cannot collide with a UUID.
export function ShelfSelect({ status, q, sort, shelf, shelves }: { status?: BookStatus; q?: string; sort?: BookSort; shelf?: string; shelves: Shelf[] }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="shelf">Shelf</Label>
      <Select value={shelf ?? "all"} onValueChange={(value) => router.push(booksHref({ status, q, sort, shelf: value === "all" ? undefined : value }))}>
        <SelectTrigger id="shelf" className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All shelves</SelectItem>
          {shelves.map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
