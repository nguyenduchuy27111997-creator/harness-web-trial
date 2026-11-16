"use client";

import { startTransition, useActionState } from "react";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { BOOK_STATUSES, STATUS_LABELS, type BookStatus, type StatusFormState } from "@/lib/books";

type Props = {
  status: BookStatus;
  action: (prev: StatusFormState, formData: FormData) => Promise<StatusFormState>;
};

// Status as segments: picking one saves it at once.
export function BookStatusForm({ status, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as StatusFormState);
  const pick = (value: string) => {
    const formData = new FormData();
    formData.set("status", value);
    startTransition(() => formAction(formData));
  };
  return (
    <div className="flex flex-col gap-2">
      <Label id="status-label">Status</Label>
      <RadioGroup
        key={status}
        aria-labelledby="status-label"
        defaultValue={status}
        disabled={pending}
        onValueChange={pick}
        className="w-fit max-w-full rounded-lg bg-muted p-1 dark:border dark:bg-card"
      >
        {BOOK_STATUSES.map((s) => (
          <RadioGroupItem
            key={s}
            value={s}
            className="h-11 rounded-md px-3 text-subheadline text-foreground transition-none aria-checked:bg-background aria-checked:font-medium aria-checked:text-foreground lg:h-8 dark:aria-checked:border dark:aria-checked:bg-popover"
          >
            {STATUS_LABELS[s]}
          </RadioGroupItem>
        ))}
      </RadioGroup>
      {state.fieldErrors?.status && <p className="text-subheadline text-destructive">{state.fieldErrors.status}</p>}
      {state.formError && (
        <p role="alert" className="text-subheadline text-destructive">
          {state.formError}
        </p>
      )}
      {state.saved && !pending && (
        <p role="status" className="text-subheadline text-muted-foreground">
          Saved
        </p>
      )}
    </div>
  );
}
