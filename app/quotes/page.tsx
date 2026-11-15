import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { QuoteSearchForm } from "@/components/quote-search-form";
import { parseSearch } from "@/lib/books";
import { filterQuotes, listQuotes, quotesHref } from "@/lib/quotes";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Quotes · Bookshelf" };

export default async function QuotesPage({ searchParams }: { searchParams: Promise<{ q?: string | string[] }> }) {
  await requireUser();
  const q = parseSearch((await searchParams).q);
  const all = await listQuotes(await createClient());
  const quotes = filterQuotes(all, q);
  return (
    <div className="flex w-full max-w-3xl flex-col gap-6">
      <h1 className="font-heading text-large-title">Quotes</h1>
      <QuoteSearchForm key={q} q={q} />
      {quotes.length === 0 && q ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-muted-foreground">No quotes match &ldquo;{q}&rdquo;.</p>
          <Button asChild variant="link" className="h-auto p-0">
            <Link href={quotesHref()}>Clear search</Link>
          </Button>
        </div>
      ) : quotes.length === 0 ? (
        <div className="flex flex-col items-start gap-2">
          <p className="text-title-2">You have no quotes yet.</p>
          <Button asChild variant="secondary">
            <Link href="/books">Go to my books</Link>
          </Button>
        </div>
      ) : (
        <ul aria-label="My quotes" className="flex max-w-3xl flex-col divide-y">
          {quotes.map((quote) => (
            <li key={quote.id} className="flex flex-col gap-1 py-4">
              <blockquote className="max-w-prose whitespace-pre-wrap break-words font-heading text-body italic">{quote.body}</blockquote>
              <p className="text-subheadline text-muted-foreground">
                <Link href={`/books/${quote.book.id}`} className="font-heading font-semibold text-primary hover:underline">
                  {quote.book.title}
                </Link>
                {quote.page !== null && <> · Page {quote.page}</>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
