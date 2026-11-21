"use client";

import { AnimatePresence, motion } from "motion/react";
import Link from "next/link";
import { useState } from "react";
import { BookCover } from "@/components/book-cover";
import { BOOK_GRID } from "@/components/book-grid";
import { appear, fadeIn } from "@/components/motion";
import { StatusBadge } from "@/components/status-badge";
import { TagChip } from "@/components/tag-chip";
import { Progress } from "@/components/ui/progress";
import { progressPercent, type ShelfBook } from "@/lib/books";

// Rows with a small cover on a phone, two columns of rows on a tablet, a grid of covers from 1024 px (design M9).
// The title link stretches over its cell, so the whole cell is one link.
export function BookList({ books, tagsByBook, coverUrls }: { books: ShelfBook[]; tagsByBook?: Map<string, string[]>; coverUrls?: Map<string, string> }) {
  // Books appended after the ones already shown (Load more) only fade in; any other new book slides in.
  const [prev, setPrev] = useState(books);
  const [appended, setAppended] = useState<ReadonlySet<string>>(new Set());
  if (books !== prev) {
    const extends_ = prev.length < books.length && prev.every((b, i) => b.id === books[i].id);
    setPrev(books);
    setAppended(new Set(extends_ ? books.slice(prev.length).map((b) => b.id) : []));
  }
  return (
    <ul className={`w-full max-w-3xl lg:max-w-none ${BOOK_GRID}`}>
      <AnimatePresence initial={false}>
      {books.map((book) => {
        const percent =
          book.status === "reading" && book.total_pages !== null && book.current_page !== null
            ? progressPercent(book.current_page, book.total_pages)
            : null;
        return (
          <motion.li key={book.id} layout="position" {...(appended.has(book.id) ? fadeIn : appear)} className="group relative flex min-w-0 items-center gap-4 py-2 lg:flex-col lg:items-stretch lg:gap-2 lg:py-0">
            <BookCover
              title={book.title}
              url={(book.cover_path && coverUrls?.get(book.cover_path)) || null}
              size="fill"
              className="transition-opacity duration-150 group-hover:opacity-90 group-active:opacity-80"
            />
            <div className="flex min-w-0 flex-1 flex-col gap-1 break-words">
              <Link
                href={`/books/${book.id}`}
                className="link-target max-w-full font-heading text-headline font-semibold [overflow-wrap:anywhere] after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-ring focus-visible:after:ring-offset-2 focus-visible:after:ring-offset-background lg:line-clamp-2"
              >
                {book.title}
              </Link>
              <span className="truncate text-subheadline text-muted-foreground lg:line-clamp-1">{book.author}</span>
              {(tagsByBook?.get(book.id)?.length ?? 0) > 0 && (
                <ul aria-label={`Tags for ${book.title}`} className="flex flex-wrap gap-1">
                  {tagsByBook?.get(book.id)?.map((name) => (
                    <li key={name} className="max-w-full">
                      <TagChip name={name} />
                    </li>
                  ))}
                </ul>
              )}
              {percent !== null && (
                <div className="flex items-center gap-2">
                  <Progress value={percent} aria-label={`Reading progress for ${book.title}`} className="w-32" />
                  <span className="text-subheadline text-muted-foreground">{percent}%</span>
                </div>
              )}
            </div>
            <div className="shrink-0 lg:self-start">
              <StatusBadge status={book.status} />
            </div>
          </motion.li>
        );
      })}
      </AnimatePresence>
    </ul>
  );
}
