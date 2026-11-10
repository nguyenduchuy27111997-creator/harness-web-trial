"use client";

import { useRouter } from "next/navigation";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { booksHref, type BookSort, type BookStatus } from "@/lib/books";

// "all" is the item for no filter: Radix refuses an empty item value.
export function TagSelect({ status, q, sort, shelf, tag, tags }: { status?: BookStatus; q?: string; sort?: BookSort; shelf?: string; tag?: string; tags: string[] }) {
  const router = useRouter();
  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor="tag">Tag</Label>
      <Select value={tag ?? "all"} onValueChange={(value) => router.push(booksHref({ status, q, sort, shelf, tag: value === "all" ? undefined : value }))}>
        <SelectTrigger id="tag" className="w-full sm:w-48">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="all">All tags</SelectItem>
          {tags.map((name) => (
            <SelectItem key={name} value={name}>
              {name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
