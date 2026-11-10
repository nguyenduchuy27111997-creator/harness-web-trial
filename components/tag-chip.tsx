import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";

export function TagChip({ name, children }: { name: string; children?: ReactNode }) {
  return (
    <Badge variant="secondary" className="h-auto max-w-full whitespace-normal break-words">
      <span className="min-w-0">{name}</span>
      {children}
    </Badge>
  );
}
