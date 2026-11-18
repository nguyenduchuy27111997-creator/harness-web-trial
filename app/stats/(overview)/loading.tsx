import { Skeleton } from "@/components/ui/skeleton";

// The shelf reads the session, so the page streams in behind this boundary.
export default function Loading() {
  return (
    <div role="status" aria-label="Loading stats" className="grid w-full max-w-3xl grid-cols-2 gap-3 md:grid-cols-3">
      <Skeleton className="h-20 rounded-lg" />
      <Skeleton className="h-20 rounded-lg" />
      <Skeleton className="h-20 rounded-lg" />
    </div>
  );
}
