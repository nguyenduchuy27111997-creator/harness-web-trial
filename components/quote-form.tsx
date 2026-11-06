"use client";

import { useActionState, useId } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { QuoteFormState } from "@/lib/quotes";

type Props = { action: (prev: QuoteFormState, formData: FormData) => Promise<QuoteFormState> };

// The form resets after each save; on an error the typed values come back through defaultValue.
export function QuoteForm({ action }: Props) {
  const id = useId();
  const [state, formAction, pending] = useActionState(action, {} as QuoteFormState);
  const quoteError = state.fieldErrors?.quote;
  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label htmlFor={`${id}-quote`}>Quote</Label>
        <Textarea
          id={`${id}-quote`}
          name="quote"
          rows={3}
          defaultValue={state.values?.quote ?? ""}
          aria-invalid={quoteError ? true : undefined}
          aria-describedby={quoteError ? `${id}-quote-error` : undefined}
        />
        {quoteError && (
          <p id={`${id}-quote-error`} className="text-sm text-destructive">
            {quoteError}
          </p>
        )}
      </div>
      <FormField
        id={`${id}-page`}
        name="page"
        label="Page (optional)"
        inputMode="numeric"
        className="max-w-32"
        defaultValue={state.values?.page ?? ""}
        error={state.fieldErrors?.page}
      />
      {state.formError && (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      )}
      <div>
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save quote"}
        </Button>
      </div>
    </form>
  );
}
