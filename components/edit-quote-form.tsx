"use client";

import { useActionState } from "react";
import { FormField } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { BookQuote, QuoteFormState } from "@/lib/quotes";

type Props = {
  quote: BookQuote;
  action: (prev: QuoteFormState, formData: FormData) => Promise<QuoteFormState>;
  onClose: () => void;
};

// Mounted only while editing, so closing drops any error and rejected input.
export function EditQuoteForm({ quote, action, onClose }: Props) {
  const [state, formAction, pending] = useActionState(
    async (prev: QuoteFormState, formData: FormData) => {
      const next = await action(prev, formData);
      if (next.saved) onClose();
      return next;
    },
    {} as QuoteFormState,
  );
  const quoteError = state.fieldErrors?.quote;
  return (
    <form action={formAction} noValidate className="flex flex-col gap-3">
      {state.formError && (
        <p role="alert" className="text-sm text-destructive">
          {state.formError}
        </p>
      )}
      <div className="flex flex-col gap-2">
        <Label htmlFor={`quote-${quote.id}`}>Edit quote</Label>
        <Textarea
          id={`quote-${quote.id}`}
          name="quote"
          rows={3}
          defaultValue={state.values?.quote ?? quote.body}
          aria-invalid={quoteError ? true : undefined}
          aria-describedby={quoteError ? `quote-${quote.id}-error` : undefined}
        />
        {quoteError && (
          <p id={`quote-${quote.id}-error`} className="text-sm text-destructive">
            {quoteError}
          </p>
        )}
      </div>
      <FormField
        id={`page-${quote.id}`}
        name="page"
        label="Edit page"
        inputMode="numeric"
        className="max-w-32"
        defaultValue={state.values?.page ?? quote.page ?? ""}
        error={state.fieldErrors?.page}
      />
      <div className="flex items-center gap-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
