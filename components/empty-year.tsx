import Link from "next/link";
import { Button } from "@/components/ui/button";

// The empty year on /stats and /stats/[year]: one block, heading then the way back to the books.
export function EmptyYear({ year }: { year: number }) {
  return (
    <section className="flex flex-col items-start gap-3">
      <h2 className="font-heading text-title-2 font-semibold">No books finished in {year}</h2>
      <Button asChild>
        <Link href="/books">Go to my books</Link>
      </Button>
    </section>
  );
}
