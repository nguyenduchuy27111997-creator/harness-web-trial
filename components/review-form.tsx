"use client";

import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ReviewFormState } from "@/lib/books";

type Props = {
  review: string | null;
  action: (
    prev: ReviewFormState,
    formData: FormData,
  ) => Promise<ReviewFormState>;
};

export function ReviewForm({ review, action }: Props) {
  const [state, formAction, pending] = useActionState(
    action,
    {} as ReviewFormState,
  );
  const [value, setValue] = useState(review ?? "");
  // "Saved" only describes the text that was submitted; hide it once the text differs from it.
  const [submitted, setSubmitted] = useState(value);
  const error = state.fieldErrors?.review ?? state.formError;
  return (
    <form
      onSubmit={(event) => {
        // Submit by hand so the automatic form reset does not wipe the typed text (decision 0003).
        event.preventDefault();
        setSubmitted(value);
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
      noValidate
      className="flex flex-col gap-2"
    >
      <Label htmlFor="review">Review</Label>
      <Textarea
        id="review"
        name="review"
        rows={4}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        aria-invalid={state.fieldErrors?.review ? true : undefined}
        aria-describedby={error ? "review-error" : undefined}
      />
      {error && (
        <p id="review-error" role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Post review"}
        </Button>
        {state.saved && submitted === value && !pending && (
          <p role="status" className="text-sm text-muted-foreground">
            Saved
          </p>
        )}
      </div>
    </form>
  );
}
