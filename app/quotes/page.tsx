import type { Metadata } from "next";
import Link from "next/link";
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
        <ul aria-label="My quotes" className="flex flex-col gap-4">
          {quotes.map((quote) => (
            <li key={quote.id} className="flex flex-col gap-1 border-l-2 border-border pl-3">
              <blockquote className="whitespace-pre-wrap break-words">{quote.body}</blockquote>
              <p className="text-sm text-muted-foreground">
                <Link href={`/books/${quote.book.id}`} className="font-medium text-foreground underline-offset-4 hover:underline">
                  {quote.book.title}
                </Link>
                {quote.page !== null && <> · Page {quote.page}</>}
              </p>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
