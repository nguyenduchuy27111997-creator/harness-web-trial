import type { Metadata } from "next";
import Link from "next/link";
import { QuoteItem } from "@/components/quote-item";
import { listQuotes } from "@/lib/quotes";
import { createClient, requireUser } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Quotes · Bookshelf" };

export default async function QuotesPage() {
  await requireUser();
  const quotes = await listQuotes(await createClient());
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-4 py-8 sm:p-8">
      <h1 className="font-heading text-4xl font-semibold tracking-tight">Quotes</h1>
      {quotes.length === 0 ? (
        <p className="text-muted-foreground">You have no quotes yet.</p>
      ) : (
        <ul aria-label="My quotes" className="flex flex-col gap-3">
          {quotes.map((quote) => (
            <QuoteItem
              key={quote.id}
              body={quote.body}
              meta={
                <>
                  <Link href={`/books/${quote.book.id}`} className="font-heading font-medium text-primary underline-offset-4 hover:underline">
                    {quote.book.title}
                  </Link>
                  {quote.page !== null && <> · Page {quote.page}</>}
                </>
              }
            />
          ))}
        </ul>
      )}
    </main>
  );
}
