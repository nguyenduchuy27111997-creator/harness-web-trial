"use client";

import { SearchForm } from "@/components/search-form";
import { quotesHref } from "@/lib/quotes";

// The /quotes search (design M5): SearchForm navigating with quotesHref, so an empty search leaves no q.
export function QuoteSearchForm({ q }: { q?: string }) {
  return <SearchForm q={q} href={quotesHref} />;
}
