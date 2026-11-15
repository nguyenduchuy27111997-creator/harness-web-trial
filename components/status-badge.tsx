import { Check } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type BookStatus } from "@/lib/books";

// Want to read secondary, Reading the accent tint, Finished outline with a check (docs/design-system.md).
const VARIANT_CLASS: Record<BookStatus, string> = {
  want_to_read: "",
  reading: "bg-accent text-accent-foreground",
  finished: "",
};

const VARIANT: Record<BookStatus, "secondary" | "outline"> = {
  want_to_read: "secondary",
  reading: "secondary",
  finished: "outline",
};

export function StatusBadge({ status }: { status: BookStatus }) {
  return (
    <Badge variant={VARIANT[status]} className={VARIANT_CLASS[status]}>
      {status === "finished" && <Check aria-hidden="true" />}
      {STATUS_LABELS[status]}
    </Badge>
  );
}
