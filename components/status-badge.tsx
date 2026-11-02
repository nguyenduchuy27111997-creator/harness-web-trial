import { Badge } from "@/components/ui/badge";
import { STATUS_LABELS, type BookStatus } from "@/lib/books";

const VARIANT_CLASS: Record<BookStatus, string> = {
  want_to_read: "",
  reading: "bg-accent text-accent-foreground",
  finished: "",
};

const VARIANT: Record<BookStatus, "secondary" | "default"> = {
  want_to_read: "secondary",
  reading: "secondary",
  finished: "default",
};

export function StatusBadge({ status }: { status: BookStatus }) {
  return (
    <Badge variant={VARIANT[status]} className={VARIANT_CLASS[status]}>
      {STATUS_LABELS[status]}
    </Badge>
  );
}
