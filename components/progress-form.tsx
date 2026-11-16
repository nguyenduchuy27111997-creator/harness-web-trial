"use client";

import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { formatProgress, progressPercent, type ProgressFormState } from "@/lib/books";

// The bar and "N of M pages · P%" line; the page shows it in the header, beside the cover.
export function ProgressSummary({ totalPages, currentPage }: { totalPages: number | null; currentPage: number | null }) {
  if (totalPages === null || currentPage === null) return null;
  return (
    <div className="flex flex-col gap-2">
      <Progress value={progressPercent(currentPage, totalPages)} aria-label="Reading progress" className="h-2" />
      {/* One visible line; the "Page N of M (P%)" wording other screens use stays for screen readers. */}
      <p aria-hidden="true" className="text-subheadline tabular-nums">
        {currentPage} of {totalPages} pages · {progressPercent(currentPage, totalPages)}%
      </p>
      <p className="sr-only">{formatProgress(currentPage, totalPages)}</p>
    </div>
  );
}

type Props = {
  totalPages: number | null;
  currentPage: number | null;
  action: (prev: ProgressFormState, formData: FormData) => Promise<ProgressFormState>;
};

export function ProgressForm({ totalPages, currentPage, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as ProgressFormState);
  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      <h2 className="font-heading text-title-2 font-semibold">Progress</h2>
      <FormField
        id="total_pages"
        label="Total pages"
        inputMode="numeric"
        defaultValue={state.values?.total_pages ?? totalPages ?? ""}
        error={state.fieldErrors?.total_pages}
      />
      <FormField
        id="current_page"
        label="Current page"
        inputMode="numeric"
        defaultValue={state.values?.current_page ?? currentPage ?? ""}
        error={state.fieldErrors?.current_page}
      />
      {state.formError && (
        <p role="alert" className="text-subheadline text-destructive">
          {state.formError}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save progress"}
        </Button>
        {state.saved && !pending && (
          <p role="status" className="text-subheadline text-muted-foreground">
            Saved
          </p>
        )}
      </div>
    </form>
  );
}
