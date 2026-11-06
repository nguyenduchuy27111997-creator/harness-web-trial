"use client";

import { useState } from "react";
import { EditQuoteForm } from "@/components/edit-quote-form";
import { QuoteForm } from "@/components/quote-form";
import { Button } from "@/components/ui/button";
import type { BookQuote, QuoteFormState } from "@/lib/quotes";

type Props = {
  quotes: BookQuote[];
  action: (prev: QuoteFormState, formData: FormData) => Promise<QuoteFormState>;
  editAction: (quoteId: string, prev: QuoteFormState, formData: FormData) => Promise<QuoteFormState>;
};

// At most one quote is edited at a time.
export function BookQuotes({ quotes, action, editAction }: Props) {
  const [openId, setOpenId] = useState<string | null>(null);
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-xl font-semibold">Quotes</h2>
      {quotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">This book has no quotes yet.</p>
      ) : (
        <ul aria-label="Quotes from this book" className="flex flex-col gap-3">
          {quotes.map((quote) => (
            <li key={quote.id} className="flex flex-col gap-1 border-l-2 border-border pl-3">
              {openId === quote.id ? (
                <EditQuoteForm
                  quote={quote}
                  action={editAction.bind(null, quote.id)}
                  onClose={() => setOpenId(null)}
                />
              ) : (
                <>
                  <blockquote className="whitespace-pre-wrap break-words">{quote.body}</blockquote>
                  {quote.page !== null && <p className="text-sm text-muted-foreground">Page {quote.page}</p>}
                  <div>
                    <Button type="button" variant="outline" size="sm" onClick={() => setOpenId(quote.id)}>
                      Edit
                    </Button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}
      <QuoteForm action={action} />
    </section>
  );
}
