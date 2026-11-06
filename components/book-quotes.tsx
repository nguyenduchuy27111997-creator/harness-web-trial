import { QuoteForm } from "@/components/quote-form";
import { QuoteItem } from "@/components/quote-item";
import type { BookQuote, QuoteFormState } from "@/lib/quotes";

type Props = {
  quotes: BookQuote[];
  action: (prev: QuoteFormState, formData: FormData) => Promise<QuoteFormState>;
};

export function BookQuotes({ quotes, action }: Props) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-heading text-xl font-semibold">Quotes</h2>
      {quotes.length === 0 ? (
        <p className="text-sm text-muted-foreground">This book has no quotes yet.</p>
      ) : (
        <ul aria-label="Quotes from this book" className="flex flex-col gap-3">
          {quotes.map((quote) => (
            <QuoteItem key={quote.id} body={quote.body} meta={quote.page !== null && <>Page {quote.page}</>} />
          ))}
        </ul>
      )}
      <QuoteForm action={action} />
    </section>
  );
}
