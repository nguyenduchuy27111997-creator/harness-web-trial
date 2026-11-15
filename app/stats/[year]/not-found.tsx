import Link from "next/link";

export default function YearNotFound() {
  return (
    <div className="flex w-full max-w-3xl flex-col gap-4">
      <h1 className="font-heading text-title-1">Page not found</h1>
      <p className="text-muted-foreground">There is no year in review at this address.</p>
      <Link href="/stats" className="self-start text-primary hover:underline">
        Back to stats
      </Link>
    </div>
  );
}
