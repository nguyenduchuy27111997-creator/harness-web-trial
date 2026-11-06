import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import { filterQuotes, insertQuote, listBookQuotes, listQuotes, parseQuote, quotesHref } from "./quotes";

const BOOK = "11111111-1111-4111-8111-111111111111";

function form(quote?: string, page?: string) {
  const f = new FormData();
  if (quote !== undefined) f.set("quote", quote);
  if (page !== undefined) f.set("page", page);
  return f;
}

describe("parseQuote", () => {
  it("trims the text and makes an empty page null", () => {
    expect(parseQuote(form("  Call me Ishmael. ", "  "), null)).toEqual({
      ok: true,
      value: { body: "Call me Ishmael.", page: null },
    });
  });
  it("reads a page", () => {
    expect(parseQuote(form("A", " 42 "), null)).toEqual({ ok: true, value: { body: "A", page: 42 } });
  });
  it("requires the text and allows 1,000 characters but not 1,001", () => {
    expect(parseQuote(form(), null)).toEqual({ ok: false, fieldErrors: { quote: "Quote is required" } });
    expect(parseQuote(form("a".repeat(1000)), null).ok).toBe(true);
    expect(parseQuote(form("a".repeat(1001)), null)).toEqual({
      ok: false,
      fieldErrors: { quote: "Quote must be at most 1,000 characters" },
    });
  });
  it("bounds the page by the total pages, else 10,000, and checks both fields", () => {
    expect(parseQuote(form("A", "10000"), null).ok).toBe(true);
    expect(parseQuote(form("", "10001"), null)).toEqual({
      ok: false,
      fieldErrors: { quote: "Quote is required", page: "Page must be a whole number from 1 to 10,000" },
    });
    expect(parseQuote(form("A", "250"), 250).ok).toBe(true);
    for (const page of ["251", "0", "1.5", "-3", "abc"]) {
      expect(parseQuote(form("A", page), 250)).toEqual({
        ok: false,
        fieldErrors: { page: "Page must be a whole number from 1 to 250" },
      });
    }
  });
});

// A select query that records its calls and resolves on the last order.
const listStub = (result: { data: unknown; error: { message: string } | null }) => {
  const calls: unknown[][] = [];
  const query = {
    select: (columns: string) => (calls.push(["select", columns]), query),
    eq: (column: string, value: string) => (calls.push(["eq", column, value]), query),
    order: (column: string, options: unknown) => {
      calls.push(["order", column, options]);
      return column === "id" ? Promise.resolve(result) : query;
    },
  };
  const supabase = { from: (table: string) => (calls.push(["from", table]), query) } as unknown as SupabaseClient<Database>;
  return { supabase, calls };
};

describe("listBookQuotes", () => {
  const stub = listStub;
  it("lists the book's quotes newest first", async () => {
    const rows = [{ id: "q", body: "A", page: null, created_at: "2026-11-06T10:00:00+00:00" }];
    const { supabase, calls } = stub({ data: rows, error: null });
    expect(await listBookQuotes(supabase, BOOK)).toEqual(rows);
    expect(calls).toEqual([
      ["from", "quotes"],
      ["select", "id, body, page, created_at"],
      ["eq", "book_id", BOOK],
      ["order", "created_at", { ascending: false }],
      ["order", "id", { ascending: false }],
    ]);
  });
  it("is empty for a malformed id without querying", async () => {
    const { supabase, calls } = stub({ data: null, error: { message: "boom" } });
    expect(await listBookQuotes(supabase, "nope")).toEqual([]);
    expect(calls).toEqual([]);
  });
  it("throws on a database error", async () => {
    await expect(listBookQuotes(stub({ data: null, error: { message: "boom" } }).supabase, BOOK)).rejects.toThrow("boom");
  });
});

describe("listQuotes", () => {
  const stub = listStub;
  it("lists all quotes newest first with their book", async () => {
    const rows = [{ id: "q", body: "A", page: 4, created_at: "2026-11-06T10:00:00+00:00", book: { id: BOOK, title: "Emma" } }];
    const { supabase, calls } = stub({ data: rows, error: null });
    expect(await listQuotes(supabase)).toEqual(rows);
    expect(calls).toEqual([
      ["from", "quotes"],
      ["select", "id, body, page, created_at, book:books(id, title)"],
      ["order", "created_at", { ascending: false }],
      ["order", "id", { ascending: false }],
    ]);
  });
  it("throws on a database error", async () => {
    await expect(listQuotes(stub({ data: null, error: { message: "boom" } }).supabase)).rejects.toThrow("boom");
  });
});

describe("insertQuote", () => {
  const stub = (error: { code?: string; message: string } | null) => {
    const inserted: unknown[] = [];
    const supabase = {
      from: () => ({ insert: (row: unknown) => (inserted.push(row), Promise.resolve({ error })) }),
    } as unknown as SupabaseClient<Database>;
    return { supabase, inserted };
  };
  it("inserts the quote on the book", async () => {
    const { supabase, inserted } = stub(null);
    expect(await insertQuote(supabase, BOOK, { body: "A", page: 3 })).toBe("ok");
    expect(inserted).toEqual([{ book_id: BOOK, body: "A", page: 3 }]);
  });
  it("is missing when the book is not the user's", async () => {
    expect(await insertQuote(stub({ code: "23503", message: "fk" }).supabase, BOOK, { body: "A", page: null })).toBe("missing");
    expect(await insertQuote(stub({ code: "42501", message: "rls" }).supabase, BOOK, { body: "A", page: null })).toBe("missing");
  });
  it("throws on another error", async () => {
    await expect(insertQuote(stub({ code: "XX", message: "boom" }).supabase, BOOK, { body: "A", page: null })).rejects.toThrow("boom");
  });
});

describe("filterQuotes", () => {
  const quote = (body: string, title: string) => ({ id: body, body, page: null, created_at: "", book: { id: title, title } });
  const quotes = [quote("a narrow mind", "Middlemarch"), quote("half agony, half hope", "Persuasion")];

  it("returns every quote without a search", () => {
    expect(filterQuotes(quotes)).toEqual(quotes);
  });

  it("matches the text or the book title ignoring case", () => {
    expect(filterQuotes(quotes, "NARROW").map((x) => x.book.title)).toEqual(["Middlemarch"]);
    expect(filterQuotes(quotes, "persua").map((x) => x.book.title)).toEqual(["Persuasion"]);
    expect(filterQuotes(quotes, "zzz")).toEqual([]);
  });
});

describe("quotesHref", () => {
  it("leaves out an empty search and encodes the rest", () => {
    expect(quotesHref()).toBe("/quotes");
    expect(quotesHref("a b&c")).toBe("/quotes?q=a+b%26c");
  });
});
