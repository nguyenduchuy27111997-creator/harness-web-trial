"use client";

import { MoreHorizontal } from "lucide-react";
import { Fragment } from "react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type Item = { label: string; onSelect: () => void; destructive?: boolean };

// A row's trailing "Actions for <name>" menu. A destructive item sits after a separator.
export function RowActions({ name, items }: { name: string; items: Item[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="icon" aria-label={`Actions for ${name}`} title={`Actions for ${name}`} className="size-11 shrink-0 lg:size-9">
          <MoreHorizontal aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {items.map((item) => (
          <Fragment key={item.label}>
            {item.destructive && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={item.onSelect} className={item.destructive ? "text-destructive focus:text-destructive" : undefined}>
              {item.label}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
