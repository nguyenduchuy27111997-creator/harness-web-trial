"use client";

import { MoreHorizontal } from "lucide-react";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Item = { label: string; onSelect: () => void; destructive?: boolean };

// A row's trailing "Actions for <name>" menu. A destructive item sits after a separator (unless it is the only item).
export function RowActions({ name, items }: { name: string; items: Item[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${name}`} title={`Actions for ${name}`} className="size-11 shrink-0 lg:size-9">
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item, i) => (
          <Fragment key={item.label}>
            {item.destructive && i > 0 && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={item.onSelect} className={`min-h-11 lg:min-h-0 ${item.destructive ? "text-destructive focus:text-destructive" : ""}`}>
              {item.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
