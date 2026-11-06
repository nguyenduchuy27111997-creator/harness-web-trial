import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import { formatNoteDate, insertNote, listNotes, parseNote, removeNote } from "./notes";

const B = "11111111-1111-4111-8111-111111111111";

function form(note?: string) {
  const data = new FormData();
  if (note !== undefined) data.set("note", note);
  return data;
}

describe("parseNote", () => {
  it("trims the text", () => {
    expect(parseNote(form("  Dorothea  "))).toEqual({ ok: true, value: "Dorothea" });
  });
  it("requires text", () => {
    expect(parseNote(form("   "))).toEqual({ ok: false, fieldErrors: { note: "Note is required" } });
    expect(parseNote(form())).toEqual({ ok: false, fieldErrors: { note: "Note is required" } });
  });
  it("allows 2,000 characters and refuses more", () => {
    expect(parseNote(form("a".repeat(2000))).ok).toBe(true);
    expect(parseNote(form("a".repeat(2001)))).toEqual({ ok: false, fieldErrors: { note: "Note must be at most 2,000 characters" } });
  });
});

describe("listNotes", () => {
  it("returns no notes for a malformed id", async () => {
    expect(await listNotes({} as SupabaseClient<Database>, "nope")).toEqual([]);
  });
  it("filters by book and orders newest first", async () => {
    const calls: unknown[][] = [];
    const query = {
      select: () => query,
      eq: (...args: unknown[]) => (calls.push(["eq", ...args]), query),
      order: (...args: unknown[]) => {
        calls.push(["order", ...args]);
        return calls.length === 3 ? Promise.resolve({ data: [{ id: "n" }], error: null }) : query;
      },
    };
    const client = { from: () => query } as unknown as SupabaseClient<Database>;
    expect(await listNotes(client, B)).toEqual([{ id: "n" }]);
    expect(calls).toEqual([
      ["eq", "book_id", B],
      ["order", "created_at", { ascending: false }],
      ["order", "id", { ascending: false }],
    ]);
  });
  it("throws on a database error", async () => {
    const result = Promise.resolve({ data: null, error: { message: "boom" } });
    const query = { select: () => query, eq: () => query, order: () => Object.assign(result, { order: () => result }) };
    const client = { from: () => query } as unknown as SupabaseClient<Database>;
    await expect(listNotes(client, B)).rejects.toThrow("boom");
  });
});

describe("insertNote", () => {
  const stub = (error: { code?: string; message: string } | null) =>
    ({ from: () => ({ insert: () => Promise.resolve({ error }) }) }) as unknown as SupabaseClient<Database>;
  it("is ok on success", async () => {
    expect(await insertNote(stub(null), "b", "x")).toBe("ok");
  });
  it("is missing for a foreign key or RLS refusal", async () => {
    expect(await insertNote(stub({ code: "23503", message: "fk" }), "b", "x")).toBe("missing");
    expect(await insertNote(stub({ code: "42501", message: "rls" }), "b", "x")).toBe("missing");
  });
  it("throws on other errors", async () => {
    await expect(insertNote(stub({ code: "XX", message: "boom" }), "b", "x")).rejects.toThrow("boom");
  });
});

describe("removeNote", () => {
  it("filters by id and book, true when a row was deleted and false when none was", async () => {
    const calls: [string, string][] = [];
    const stub = (result: { data: { id: string }[] | null; error: { message: string } | null }) => {
      const query = {
        eq: (column: string, value: string) => (calls.push([column, value]), query),
        select: () => Promise.resolve(result),
      };
      return { from: () => ({ delete: () => query }) } as unknown as SupabaseClient<Database>;
    };
    expect(await removeNote(stub({ data: [{ id: "n" }], error: null }), B, "n")).toBe(true);
    expect(calls).toEqual([["id", "n"], ["book_id", B]]);
    expect(await removeNote(stub({ data: [], error: null }), B, "n")).toBe(false);
    await expect(removeNote(stub({ data: null, error: { message: "boom" } }), B, "n")).rejects.toThrow("boom");
  });
});

describe("formatNoteDate", () => {
  it("shows the UTC date", () => {
    expect(formatNoteDate("2026-11-06T10:00:00+00:00")).toBe("November 6, 2026");
    expect(formatNoteDate("2026-11-06T23:30:00-05:00")).toBe("November 7, 2026");
  });
});
