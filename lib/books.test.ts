import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import { booksHref, filterBooks, formatFinishDate, insertBook, listBooks, parseBookFields, parseNewBook, parseProgress, parseRating, parseReview, parseSearch, parseSort, parseStatus, parseStatusFilter, formatProgress, progressPercent, removeBook, sortBooks, type ShelfBook, updateBookFields, updateBookProgress, updateBookRating, updateBookReview, updateBookStatus } from "./books";

function stubClient(result: { data: unknown; error: { message: string } | null }) {
  const calls: unknown[][] = [];
  const query = {
    select: () => query,
    eq: (...args: unknown[]) => {
      calls.push(["eq", ...args]);
      return query;
    },
    order: (...args: unknown[]) => {
      calls.push(args);
      return Promise.resolve(result);
    },
  };
  return { client: { from: () => query } as unknown as SupabaseClient<Database>, calls };
}

describe("listBooks", () => {
  it("returns an empty list when the user has no books", async () => {
    const { client } = stubClient({ data: [], error: null });
    expect(await listBooks(client)).toEqual([]);
  });

  it("asks for the newest first", async () => {
    const { client, calls } = stubClient({ data: [], error: null });
    await listBooks(client);
    expect(calls).toEqual([["created_at", { ascending: false }]]);
  });

  it("filters by status when given", async () => {
    const { client, calls } = stubClient({ data: [], error: null });
    await listBooks(client, "reading");
    expect(calls[0]).toEqual(["eq", "status", "reading"]);
  });

  it("throws on a database error", async () => {
    const { client } = stubClient({ data: null, error: { message: "boom" } });
    await expect(listBooks(client)).rejects.toThrow("boom");
  });
});

describe("parseStatusFilter", () => {
  it("accepts a known status", () => {
    expect(parseStatusFilter("finished")).toBe("finished");
  });

  it("falls back to All for unknown, repeated or missing values", () => {
    expect(parseStatusFilter("nope")).toBeUndefined();
    expect(parseStatusFilter(["reading", "finished"])).toBeUndefined();
    expect(parseStatusFilter(undefined)).toBeUndefined();
  });
});

function form(fields: Record<string, string>) {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) fd.set(k, v);
  return fd;
}

describe("parseNewBook", () => {
  it("trims and defaults the status to want_to_read", () => {
    expect(parseNewBook(form({ title: " Middlemarch ", author: " George Eliot " }))).toEqual({
      ok: true,
      value: { title: "Middlemarch", author: "George Eliot", status: "want_to_read" },
    });
  });

  it("keeps a valid status", () => {
    const r = parseNewBook(form({ title: "A", author: "B", status: "reading" }));
    expect(r).toEqual({ ok: true, value: { title: "A", author: "B", status: "reading" } });
  });

  it("reports each field error", () => {
    expect(parseNewBook(form({ title: " ", author: "x".repeat(121), status: "nope" }))).toEqual({
      ok: false,
      fieldErrors: {
        title: "Title is required",
        author: "Author must be at most 120 characters",
        status: "Choose a status",
      },
    });
    const r = parseNewBook(form({ title: "x".repeat(201), author: "" }));
    expect(r).toEqual({
      ok: false,
      fieldErrors: { title: "Title must be at most 200 characters", author: "Author is required" },
    });
  });
});

describe("insertBook", () => {
  const input = { title: "A", author: "B", status: "reading" as const };

  it("inserts title, author and status only", async () => {
    const inserted: unknown[] = [];
    const client = {
      from: () => ({ insert: (row: unknown) => (inserted.push(row), Promise.resolve({ error: null })) }),
    } as unknown as SupabaseClient<Database>;
    await insertBook(client, input);
    expect(inserted).toEqual([input]);
  });

  it("throws on a database error", async () => {
    const client = {
      from: () => ({ insert: () => Promise.resolve({ error: { message: "boom" } }) }),
    } as unknown as SupabaseClient<Database>;
    await expect(insertBook(client, input)).rejects.toThrow("boom");
  });
});

describe("parseStatus", () => {
  it("accepts a known status", () => {
    expect(parseStatus(form({ status: "reading" }))).toEqual({ ok: true, value: "reading" });
  });

  it("rejects an unknown or missing status", () => {
    const error = { ok: false, fieldErrors: { status: "Choose a status" } };
    expect(parseStatus(form({ status: "nope" }))).toEqual(error);
    expect(parseStatus(form({}))).toEqual(error);
  });
});

describe("formatFinishDate", () => {
  it("writes the date out in long form", () => {
    expect(formatFinishDate("2026-11-02")).toBe("November 2, 2026");
  });
});

function updateClient(result: { data: unknown; error: { message: string } | null }) {
  const query = { update: () => query, delete: () => query, eq: () => query, select: () => Promise.resolve(result) };
  return { from: () => query } as unknown as SupabaseClient<Database>;
}

describe("updateBookStatus", () => {
  it("is true when a row changed and false when none did", async () => {
    expect(await updateBookStatus(updateClient({ data: [{ id: "x" }], error: null }), "x", "reading")).toBe(true);
    expect(await updateBookStatus(updateClient({ data: [], error: null }), "x", "reading")).toBe(false);
  });

  it("throws on a database error", async () => {
    await expect(updateBookStatus(updateClient({ data: null, error: { message: "boom" } }), "x", "reading")).rejects.toThrow("boom");
  });
});

describe("parseRating", () => {
  it("accepts 1 to 5", () => {
    expect(parseRating(form({ rating: "4" }))).toEqual({ ok: true, value: 4 });
  });

  it("rejects anything else", () => {
    const error = { ok: false, fieldErrors: { rating: "Choose a rating from 1 to 5" } };
    for (const rating of ["0", "6", "3.5", "x", ""]) expect(parseRating(form({ rating }))).toEqual(error);
    expect(parseRating(form({}))).toEqual(error);
  });
});

describe("updateBookRating", () => {
  it("is true when a row changed and false when none did", async () => {
    expect(await updateBookRating(updateClient({ data: [{ id: "x" }], error: null }), "x", 4)).toBe(true);
    expect(await updateBookRating(updateClient({ data: [], error: null }), "x", 4)).toBe(false);
  });

  it("throws on a database error", async () => {
    await expect(updateBookRating(updateClient({ data: null, error: { message: "boom" } }), "x", 4)).rejects.toThrow("boom");
  });
});

describe("parseReview", () => {
  it("trims and allows empty", () => {
    expect(parseReview(form({ review: "  Loved the ending.  " }))).toEqual({ ok: true, value: "Loved the ending." });
    expect(parseReview(form({}))).toEqual({ ok: true, value: "" });
  });

  it("accepts 2,000 characters and rejects 2,001", () => {
    expect(parseReview(form({ review: "a".repeat(2000) })).ok).toBe(true);
    expect(parseReview(form({ review: "a".repeat(2001) }))).toEqual({ ok: false, fieldErrors: { review: "Review must be at most 2,000 characters" } });
  });
});

describe("updateBookReview", () => {
  it("is true when a row changed and false when none did", async () => {
    expect(await updateBookReview(updateClient({ data: [{ id: "x" }], error: null }), "x", "Good")).toBe(true);
    expect(await updateBookReview(updateClient({ data: [], error: null }), "x", null)).toBe(false);
  });

  it("throws on a database error", async () => {
    await expect(updateBookReview(updateClient({ data: null, error: { message: "boom" } }), "x", "Good")).rejects.toThrow("boom");
  });
});

describe("removeBook", () => {
  it("is true when a row was deleted and false when none was", async () => {
    expect(await removeBook(updateClient({ data: [{ id: "x" }], error: null }), "x")).toBe(true);
    expect(await removeBook(updateClient({ data: [], error: null }), "x")).toBe(false);
  });

  it("throws on a database error", async () => {
    await expect(removeBook(updateClient({ data: null, error: { message: "boom" } }), "x")).rejects.toThrow("boom");
  });
});

describe("parseBookFields", () => {
  it("trims title and author", () => {
    expect(parseBookFields(form({ title: " Middlemarch ", author: " George Eliot " }))).toEqual({
      ok: true,
      value: { title: "Middlemarch", author: "George Eliot" },
    });
  });

  it("reports each field's problem", () => {
    expect(parseBookFields(form({ title: " ", author: "x".repeat(121) }))).toEqual({
      ok: false,
      fieldErrors: { title: "Title is required", author: "Author must be at most 120 characters" },
    });
    const r = parseBookFields(form({ title: "x".repeat(201), author: "" }));
    expect(r).toEqual({
      ok: false,
      fieldErrors: { title: "Title must be at most 200 characters", author: "Author is required" },
    });
  });
});

describe("updateBookFields", () => {
  const fields = { title: "Middlemarch", author: "George Eliot" };

  it("is true when a row changed and false when none did", async () => {
    expect(await updateBookFields(updateClient({ data: [{ id: "x" }], error: null }), "x", fields)).toBe(true);
    expect(await updateBookFields(updateClient({ data: [], error: null }), "x", fields)).toBe(false);
  });

  it("throws on a database error", async () => {
    await expect(updateBookFields(updateClient({ data: null, error: { message: "boom" } }), "x", fields)).rejects.toThrow("boom");
  });
});

describe("parseSearch", () => {
  it("trims the text", () => {
    expect(parseSearch("  eliot ")).toBe("eliot");
  });

  it("treats empty, blank, missing and repeated values as no search", () => {
    expect(parseSearch("")).toBeUndefined();
    expect(parseSearch("   ")).toBeUndefined();
    expect(parseSearch(undefined)).toBeUndefined();
    expect(parseSearch(["a", "b"])).toBeUndefined();
  });
});

describe("filterBooks", () => {
  const book = (title: string, author: string) => ({ id: title, title, author, status: "reading" as const, created_at: "" });
  const books = [book("Middlemarch", "George Eliot"), book("Silas Marner", "George Eliot"), book("Emma", "Jane Austen")];

  it("returns every book without a search", () => {
    expect(filterBooks(books)).toEqual(books);
  });

  it("matches title or author ignoring case", () => {
    expect(filterBooks(books, "ELIO").map((b) => b.title)).toEqual(["Middlemarch", "Silas Marner"]);
    expect(filterBooks(books, "march").map((b) => b.title)).toEqual(["Middlemarch"]);
    expect(filterBooks(books, "zzz")).toEqual([]);
  });
});

describe("booksHref", () => {
  it("builds /books with status then q, encoding q", () => {
    expect(booksHref({})).toBe("/books");
    expect(booksHref({ status: "reading" })).toBe("/books?status=reading");
    expect(booksHref({ q: "a&b c" })).toBe("/books?q=a%26b+c");
    expect(booksHref({ status: "reading", q: "eliot" })).toBe("/books?status=reading&q=eliot");
  });

  it("adds sort last and omits the default", () => {
    expect(booksHref({ status: "reading", q: "a", sort: "rating" })).toBe("/books?status=reading&q=a&sort=rating");
    expect(booksHref({ sort: "title" })).toBe("/books?sort=title");
    expect(booksHref({ sort: "newest" })).toBe("/books");
  });

  it("adds shelf after sort", () => {
    expect(booksHref({ shelf: "s1" })).toBe("/books?shelf=s1");
    expect(booksHref({ status: "reading", q: "a", sort: "title", shelf: "s1" })).toBe("/books?status=reading&q=a&sort=title&shelf=s1");
  });
});

describe("parseSort", () => {
  it("accepts title and rating, else newest", () => {
    expect(parseSort("title")).toBe("title");
    expect(parseSort("rating")).toBe("rating");
    expect(parseSort("nope")).toBe("newest");
    expect(parseSort(["title", "rating"])).toBe("newest");
    expect(parseSort(undefined)).toBe("newest");
  });
});

describe("sortBooks", () => {
  const book = (title: string, status: ShelfBook["status"], rating: number | null): ShelfBook => ({
    id: title, title, author: "x", created_at: "", status, rating,
  });
  // newest first, as listBooks returns them
  const books = [book("Delta", "reading", 4), book("Charlie", "finished", null), book("Alpha", "finished", 5), book("bravo", "finished", 3)];
  const titles = (list: ShelfBook[]) => list.map((b) => b.title);

  it("keeps the input order for newest, in a new array", () => {
    const sorted = sortBooks(books, "newest");
    expect(titles(sorted)).toEqual(["Delta", "Charlie", "Alpha", "bravo"]);
    expect(sorted).not.toBe(books);
  });

  it("sorts by title ignoring case", () => {
    expect(titles(sortBooks(books, "title"))).toEqual(["Alpha", "bravo", "Charlie", "Delta"]);
  });

  it("sorts by rating, unrated and not-Finished last, ties newest first", () => {
    expect(titles(sortBooks(books, "rating"))).toEqual(["Alpha", "bravo", "Delta", "Charlie"]);
  });
});

describe("parseProgress", () => {
  const form = (total: string, current: string) => {
    const f = new FormData();
    f.set("total_pages", total);
    f.set("current_page", current);
    return f;
  };

  it("accepts whole numbers with the current page within the total", () => {
    expect(parseProgress(form("250", "100"))).toEqual({ ok: true, value: { totalPages: 250, currentPage: 100 } });
    expect(parseProgress(form(" 250 ", "0"))).toEqual({ ok: true, value: { totalPages: 250, currentPage: 0 } });
  });

  it("refuses a total outside 1 to 10,000", () => {
    for (const bad of ["", "0", "2.5", "-1", "10001"]) expect(parseProgress(form(bad, "1")).ok).toBe(false);
  });

  it("refuses a current page outside 0 to the total", () => {
    expect(parseProgress(form("250", "251"))).toEqual({
      ok: false,
      fieldErrors: { current_page: "Current page must be a whole number from 0 to 250" },
    });
    expect(parseProgress(form("250", "")).ok).toBe(false);
  });
});

describe("updateBookProgress", () => {
  it("is true when a row changed and false when none did", async () => {
    const input = { totalPages: 250, currentPage: 100 };
    expect(await updateBookProgress(updateClient({ data: [{ id: "x" }], error: null }), "x", input)).toBe(true);
    expect(await updateBookProgress(updateClient({ data: [], error: null }), "x", input)).toBe(false);
  });
});

describe("progress formatting", () => {
  it("rounds the percentage", () => {
    expect(progressPercent(100, 250)).toBe(40);
    expect(progressPercent(0, 250)).toBe(0);
    expect(formatProgress(100, 250)).toBe("Page 100 of 250 (40%)");
  });
});
