"use client";

import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { formatProgress, type ProgressFormState } from "@/lib/books";

type Props = {
  totalPages: number | null;
  currentPage: number | null;
  action: (prev: ProgressFormState, formData: FormData) => Promise<ProgressFormState>;
};

export function ProgressForm({ totalPages, currentPage, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as ProgressFormState);
  const saved = totalPages !== null && currentPage !== null;
  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      <h2 className="font-heading text-xl font-semibold">Progress</h2>
      {saved && <p className="text-sm text-muted-foreground">{formatProgress(currentPage, totalPages)}</p>}
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
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save progress"}
        </Button>
        {state.saved && !pending && (
          <p role="status" className="text-sm text-muted-foreground">
            Saved
          </p>
        )}
      </div>
    </form>
  );
}
