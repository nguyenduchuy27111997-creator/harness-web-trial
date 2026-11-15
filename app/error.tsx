"use client";

import { Button } from "@/components/ui/button";

// A page that failed to load (docs/design/M9.md, Error and not found).
export default function PageError({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex w-full max-w-3xl flex-col items-start gap-4">
      <h1 className="font-heading text-title-2">Unable to load this page</h1>
      <p className="text-body text-muted-foreground">{error.message || "Something went wrong."}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
