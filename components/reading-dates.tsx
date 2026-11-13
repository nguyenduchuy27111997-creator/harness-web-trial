import { formatFinishDate, formatReadDays } from "@/lib/books";

export function ReadingDates({ startedOn, finishedOn }: { startedOn: string | null; finishedOn: string | null }) {
  return (
    <>
      {startedOn && <p className="text-sm text-muted-foreground">Started on <time dateTime={startedOn}>{formatFinishDate(startedOn)}</time></p>}
      {finishedOn && (
        <p className="text-sm text-muted-foreground">
          Finished on {formatFinishDate(finishedOn)}
          {startedOn && (
            <>
              {" · "}
              <span>{formatReadDays(startedOn, finishedOn)}</span>
            </>
          )}
        </p>
      )}
    </>
  );
}
