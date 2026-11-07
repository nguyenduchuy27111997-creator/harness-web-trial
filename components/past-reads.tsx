import { StarIcon } from "lucide-react";
import { formatFinishDate } from "@/lib/books";
import type { PastRead } from "@/lib/reads";

export function PastReads({ reads }: { reads: PastRead[] }) {
  if (reads.length === 0) return null;
  return (
    <section className="flex flex-col gap-2">
      <h2 className="font-heading text-xl font-semibold">Past reads</h2>
      <ul className="flex flex-col gap-2">
        {reads.map((read) => (
          <li key={read.id} className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
            {read.started_on && <p>Started on {formatFinishDate(read.started_on)}</p>}
            <p>Finished on {formatFinishDate(read.finished_on)}</p>
            {read.rating && (
              <p className="flex items-center gap-1">
                {Array.from({ length: read.rating }, (_, i) => (
                  <StarIcon key={i} aria-hidden className="size-4 text-primary" fill="currentColor" />
                ))}
                <span>{read.rating === 1 ? "1 star" : `${read.rating} stars`}</span>
              </p>
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
