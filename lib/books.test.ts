import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import { insertBook, listBooks, parseNewBook } from "./books";

function stubClient(result: { data: unknown; error: { message: string } | null }) {
  const calls: unknown[][] = [];
  const query = {
    select: () => query,
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

  it("throws on a database error", async () => {
    const { client } = stubClient({ data: null, error: { message: "boom" } });
    await expect(listBooks(client)).rejects.toThrow("boom");
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
