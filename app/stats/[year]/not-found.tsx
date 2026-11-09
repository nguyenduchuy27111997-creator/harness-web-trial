import Link from "next/link";

export default function YearNotFound() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-8 sm:p-8">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground">There is no year in review at this address.</p>
      <Link href="/stats" className="self-start text-primary hover:underline">
        Back to stats
      </Link>
    </main>
  );
}
