"use client";

import { useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { ReviewFormState } from "@/lib/books";

type Props = {
  review: string | null;
  action: (prev: ReviewFormState, formData: FormData) => Promise<ReviewFormState>;
};

export function ReviewForm({ review, action }: Props) {
  const [state, formAction, pending] = useActionState(action, {} as ReviewFormState);
  // "Saved" only describes the text that was submitted; hide it once the text changes again.
  const [changed, setChanged] = useState(false);
  const error = state.fieldErrors?.review;
  return (
    <form action={formAction} onSubmit={() => setChanged(false)} noValidate className="flex flex-col gap-2">
      <Label htmlFor="review">Review</Label>
      <Textarea
        id="review"
        name="review"
        defaultValue={state.values?.review ?? review ?? ""}
        onChange={() => setChanged(true)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? "review-error" : undefined}
      />
      {error && (
        <p id="review-error" className="text-sm text-destructive">
          {error}
        </p>
      )}
      {state.formError && (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      )}
      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending} className="self-start">
          {pending ? "Saving…" : "Post review"}
        </Button>
        {state.saved && !changed && !pending && (
          <p role="status" className="text-sm text-muted-foreground">
            Saved
          </p>
        )}
      </div>
    </form>
  );
}
