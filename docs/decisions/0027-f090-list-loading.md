# 0027: /books shows its skeleton during a filter change too

Status: accepted (F090)

Design M9 puts a `<Suspense>` (keyed by the search params) around the `/books` list with `BookListSkeleton` as fallback. That only shows once the server starts streaming; while a filter change's request is still on its way, Next keeps the old list. So the status segments navigate in a transition (`BookListPending` / `useBookListNavigate` in `components/book-list-skeleton.tsx`) and the list area shows the same skeleton while it is pending; the controls stay. Modified clicks (new tab) keep the plain link.

The Suspense fallback holds the title and "Add book"; the empty shelf (known only after the data) renders the title without the header button, so "Add book" is its one primary button. The list layout classes live in `components/book-grid.ts` because a constant exported from a `"use client"` module reaches a server component as a client reference, not a string.
