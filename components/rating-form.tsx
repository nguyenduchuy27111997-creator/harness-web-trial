"use client";

import { StarIcon } from "lucide-react";
import { startTransition, useActionState, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { RatingFormState } from "@/lib/books";

type Props = {
  rating: number | null;
  action: (
    prev: RatingFormState,
    formData: FormData,
  ) => Promise<RatingFormState>;
};

const STARS = [1, 2, 3, 4, 5];

export function RatingForm({ rating, action }: Props) {
  const [state, formAction, pending] = useActionState(
    action,
    {} as RatingFormState,
  );
  const [value, setValue] = useState(rating ? String(rating) : "");
  // "Saved" only describes the value that was submitted; hide it once the choice differs from it.
  const [submitted, setSubmitted] = useState(value);
  return (
    <form
      onSubmit={(event) => {
        // Submit by hand: the automatic form reset after an action puts the radios back to their first value.
        event.preventDefault();
        setSubmitted(value);
        const data = new FormData(event.currentTarget);
        startTransition(() => formAction(data));
      }}
      noValidate
      className="flex flex-col gap-2"
    >
      <Label id="rating-label">Rating</Label>
      <div className="flex gap-3">
        <RadioGroup
          name="rating"
          aria-labelledby="rating-label"
          orientation="horizontal"
          value={value}
          onValueChange={setValue}
        >
          {STARS.map((n) => (
            <RadioGroupItem
              key={n}
              value={String(n)}
              className="p-1"
              aria-label={n === 1 ? "1 star" : `${n} stars`}
            >
              <StarIcon
                className={
                  n <= Number(value) ? "size-6 text-primary" : "size-6"
                }
                fill={n <= Number(value) ? "currentColor" : "none"}
              />
            </RadioGroupItem>
          ))}
        </RadioGroup>
        <Button type="submit" disabled={pending || value === ""}>
          {pending ? "Saving…" : "Rate"}
        </Button>
      </div>
      {(state.fieldErrors?.rating ?? state.formError) && (
        <p role="alert" className="text-sm text-destructive">
          {state.fieldErrors?.rating ?? state.formError}
        </p>
      )}
      {state.saved && submitted === value && !pending && (
        <p role="status" className="text-sm text-muted-foreground">
          Saved
        </p>
      )}
    </form>
  );
}
