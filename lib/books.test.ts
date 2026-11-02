import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import { formatFinishDate, insertBook, listBooks, parseNewBook, parseStatus, removeBook, updateBookStatus } from "./books";

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

describe("updateBookStatus", () => {
  function updateClient(result: { data: unknown; error: { message: string } | null }) {
    const query = { update: () => query, eq: () => query, select: () => Promise.resolve(result) };
    return { from: () => query } as unknown as SupabaseClient<Database>;
  }

  it("is true when a row changed and false when none did", async () => {
    expect(await updateBookStatus(updateClient({ data: [{ id: "x" }], error: null }), "x", "reading")).toBe(true);
    expect(await updateBookStatus(updateClient({ data: [], error: null }), "x", "reading")).toBe(false);
  });

  it("throws on a database error", async () => {
    await expect(updateBookStatus(updateClient({ data: null, error: { message: "boom" } }), "x", "reading")).rejects.toThrow("boom");
  });
});

describe("removeBook", () => {
  function deleteClient(result: { data: unknown; error: { message: string } | null }) {
    const eqs: unknown[][] = [];
    const query = {
      delete: () => query,
      eq: (...args: unknown[]) => (eqs.push(args), query),
      select: () => Promise.resolve(result),
    };
    return { client: { from: () => query } as unknown as SupabaseClient<Database>, eqs };
  }

  it("deletes by id and reports true", async () => {
    const { client, eqs } = deleteClient({ data: [{ id: "x" }], error: null });
    expect(await removeBook(client, "x")).toBe(true);
    expect(eqs).toEqual([["id", "x"]]);
  });

  it("reports false when no row was deleted", async () => {
    const { client } = deleteClient({ data: [], error: null });
    expect(await removeBook(client, "x")).toBe(false);
  });

  it("throws on a database error", async () => {
    const { client } = deleteClient({ data: null, error: { message: "boom" } });
    await expect(removeBook(client, "x")).rejects.toThrow("boom");
  });
});
