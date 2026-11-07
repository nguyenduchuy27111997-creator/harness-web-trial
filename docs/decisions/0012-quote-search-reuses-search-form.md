# 0012: QuoteSearchForm wraps SearchForm

Design M5 names a separate `quote-search-form`. A copy of `SearchForm` would push the duplication budget (jscpd) over its threshold. So `components/quote-search-form.tsx` (`QuoteSearchForm`) is a thin client component that renders `SearchForm` with an optional `href` builder set to `quotesHref`. `SearchForm` stays free of `lib/quotes.ts`. Behaviour on `/quotes` is as the design describes (always shown, role `search`, label "Search", empty search leaves no `q`).
