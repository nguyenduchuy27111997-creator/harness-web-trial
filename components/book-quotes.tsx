import { ConfirmDeleteButton } from "@/components/confirm-delete-button";
import { QuoteForm } from "@/components/quote-form";
import type { BookQuote, QuoteFormState } from "@/lib/quotes";

type Props = {
  quotes: BookQuote[];
  action: (prev: QuoteFormState, formData: FormData) => Promise<QuoteFormState>;
  deleteAction: (quoteId: string, formData: FormData) => Promise<void>;
};

export function BookQuotes({ quotes, action, deleteAction }: Props) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-xl font-semibold">Quotes</h2>
      {quotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">This book has no quotes yet.</p>
      ) : (
        <ul aria-label="Quotes from this book" className="flex flex-col gap-3">
          {quotes.map((quote) => (
            <li key={quote.id} className="flex flex-col gap-1 border-l-2 border-border pl-3">
              <blockquote className="whitespace-pre-wrap break-words">{quote.body}</blockquote>
              {quote.page !== null && <p className="text-sm text-muted-foreground">Page {quote.page}</p>}
              <ConfirmDeleteButton
                heading="Delete this quote?"
                description="This quote will be deleted. This cannot be undone."
                size="sm"
                action={deleteAction.bind(null, quote.id)}
              />
            </li>
          ))}
        </ul>
      )}
      <QuoteForm action={action} />
    </section>
  );
}
