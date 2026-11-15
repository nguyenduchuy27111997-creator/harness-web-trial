"use client";

import { User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AccountMenuProps = {
  displayName?: string | null;
  signOut: () => Promise<void>;
};

// The display name and Sign out (docs/design/M9.md, Account menu).
export function AccountMenu({ displayName, signOut }: AccountMenuProps) {
  const label = displayName || "Account";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost">
          <User aria-hidden />
          <span className="max-w-40 truncate">{label}</span>
          {displayName && <span className="sr-only">, account</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-48">
        <DropdownMenuLabel className="break-all">{label}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={signOut}>
          <DropdownMenuItem asChild>
            <Button type="submit" variant="ghost" className="w-full justify-start">
              Sign out
            </Button>
          </DropdownMenuItem>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
