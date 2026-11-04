import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import { formatFinishDate, insertBook, listBooks, parseBookFields, parseNewBook, parseRating, parseReview, parseStatus, parseStatusFilter, removeBook, updateBookFields, updateBookRating, updateBookReview, updateBookStatus } from "./books";

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
