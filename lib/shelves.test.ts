import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import {
  addBookToShelf,
  insertShelf,
  listBookShelfIds,
  listShelves,
  parseShelfChoice,
  parseShelfName,
  removeBookFromShelf,
} from "./shelves";

function form(name?: string) {
  const f = new FormData();
  if (name !== undefined) f.set("name", name);
  return f;
}

describe("parseShelfName", () => {
  it("trims the name", () => {
    expect(parseShelfName(form("  Travel "))).toEqual({ ok: true, value: "Travel" });
  });
  it("requires a name", () => {
    expect(parseShelfName(form("   "))).toEqual({ ok: false, fieldErrors: { name: "Name is required" } });
    expect(parseShelfName(form())).toEqual({ ok: false, fieldErrors: { name: "Name is required" } });
  });
  it("allows 40 characters but not 41", () => {
    expect(parseShelfName(form("a".repeat(40))).ok).toBe(true);
    expect(parseShelfName(form("a".repeat(41)))).toEqual({
      ok: false,
      fieldErrors: { name: "Name must be at most 40 characters" },
    });
  });
});

describe("listShelves", () => {
  function client(result: { data: unknown; error: { message: string } | null }) {
    const orders: string[] = [];
    const query = {
      select: () => query,
      order: (column: string) => {
        orders.push(column);
        return orders.length === 2 ? Promise.resolve(result) : query;
      },
    };
    return { supabase: { from: () => query } as unknown as SupabaseClient<Database>, orders };
  }
  it("orders by name then id", async () => {
    const { supabase, orders } = client({ data: [{ id: "1", name: "A" }], error: null });
    expect(await listShelves(supabase)).toEqual([{ id: "1", name: "A" }]);
    expect(orders).toEqual(["name", "id"]);
  });
  it("throws on a database error", async () => {
    await expect(listShelves(client({ data: null, error: { message: "boom" } }).supabase)).rejects.toThrow("boom");
  });
});

describe("insertShelf", () => {
  const stub = (error: { code?: string; message: string } | null) =>
    ({ from: () => ({ insert: () => Promise.resolve({ error }) }) }) as unknown as SupabaseClient<Database>;
  it("is ok on success", async () => {
    expect(await insertShelf(stub(null), "Travel")).toBe("ok");
  });
  it("is taken on a unique violation", async () => {
    expect(await insertShelf(stub({ code: "23505", message: "dup" }), "Travel")).toBe("taken");
  });
  it("throws on other errors", async () => {
    await expect(insertShelf(stub({ code: "XX", message: "boom" }), "Travel")).rejects.toThrow("boom");
  });
});

describe("parseShelfChoice", () => {
  const choice = (v?: string) => {
    const f = new FormData();
    if (v !== undefined) f.set("shelf", v);
    return f;
  };
  it("accepts a uuid", () => {
    const id = "123e4567-e89b-12d3-a456-426614174000";
    expect(parseShelfChoice(choice(id))).toEqual({ ok: true, value: id });
  });
  it("rejects anything else", () => {
    expect(parseShelfChoice(choice("nope"))).toEqual({ ok: false, fieldErrors: { shelf: "Choose a shelf" } });
    expect(parseShelfChoice(choice())).toEqual({ ok: false, fieldErrors: { shelf: "Choose a shelf" } });
  });
});

describe("listBookShelfIds", () => {
  const stub = (result: { data: unknown; error: { message: string } | null }) =>
    ({ from: () => ({ select: () => ({ eq: () => Promise.resolve(result) }) }) }) as unknown as SupabaseClient<Database>;
  const id = "123e4567-e89b-12d3-a456-426614174000";
  it("returns the shelf ids", async () => {
    expect(await listBookShelfIds(stub({ data: [{ shelf_id: "a" }, { shelf_id: "b" }], error: null }), id)).toEqual(["a", "b"]);
  });
  it("returns none for a malformed book id without querying", async () => {
    expect(await listBookShelfIds(stub({ data: null, error: { message: "boom" } }), "not-a-uuid")).toEqual([]);
  });
  it("throws on a database error", async () => {
    await expect(listBookShelfIds(stub({ data: null, error: { message: "boom" } }), id)).rejects.toThrow("boom");
  });
});

describe("addBookToShelf", () => {
  const stub = (error: { code?: string; message: string } | null) =>
    ({ from: () => ({ insert: () => Promise.resolve({ error }) }) }) as unknown as SupabaseClient<Database>;
  it("is ok on success and when already on the shelf", async () => {
    expect(await addBookToShelf(stub(null), "b", "s")).toBe("ok");
    expect(await addBookToShelf(stub({ code: "23505", message: "dup" }), "b", "s")).toBe("ok");
  });
  it("is missing for a foreign key or RLS error", async () => {
    expect(await addBookToShelf(stub({ code: "23503", message: "fk" }), "b", "s")).toBe("missing");
    expect(await addBookToShelf(stub({ code: "42501", message: "rls" }), "b", "s")).toBe("missing");
  });
  it("throws on other errors", async () => {
    await expect(addBookToShelf(stub({ code: "XX", message: "boom" }), "b", "s")).rejects.toThrow("boom");
  });
});

describe("removeBookFromShelf", () => {
  const stub = (error: { message: string } | null, calls: [string, string][] = []) =>
    ({
      from: () => ({
        delete: () => ({
          eq: (c1: string, v1: string) => ({
            eq: (c2: string, v2: string) => {
              calls.push([`${c1}=${v1}`, `${c2}=${v2}`]);
              return Promise.resolve({ error });
            },
          }),
        }),
      }),
    }) as unknown as SupabaseClient<Database>;
  it("deletes the link by book and shelf", async () => {
    const calls: [string, string][] = [];
    await removeBookFromShelf(stub(null, calls), "b", "s");
    expect(calls).toEqual([["book_id=b", "shelf_id=s"]]);
  });
  it("throws on an error", async () => {
    await expect(removeBookFromShelf(stub({ message: "boom" }), "b", "s")).rejects.toThrow("boom");
  });
});
