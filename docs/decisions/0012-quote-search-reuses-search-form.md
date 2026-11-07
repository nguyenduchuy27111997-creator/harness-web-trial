# 0012: Quote search reuses SearchForm

Design M5 names a separate `quote-search-form`. It would copy `SearchForm` almost line for line and push the duplication budget (jscpd) over its threshold. Instead `SearchForm` takes an optional `quotes` flag and navigates with `quotesHref`. Behaviour on `/quotes` is as the design describes (role `search`, label "Search", empty search leaves no `q`).
