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
  removeShelf,
  updateShelfName,
} from "./shelves";

const BOOK = "11111111-1111-4111-8111-111111111111";
const SHELF = "22222222-2222-4222-8222-222222222222";

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

describe("updateShelfName", () => {
  const stub = (res: { data?: { id: string }[]; error?: { code?: string; message: string } | null }) =>
    ({
      from: () => ({ update: () => ({ eq: () => ({ select: () => Promise.resolve({ error: null, ...res }) }) }) }),
    }) as unknown as SupabaseClient<Database>;
  it("is ok when a row changed", async () => {
    expect(await updateShelfName(stub({ data: [{ id: "a" }] }), "a", "Trips")).toBe("ok");
  });
  it("is missing when no row changed", async () => {
    expect(await updateShelfName(stub({ data: [] }), "a", "Trips")).toBe("missing");
  });
  it("is taken on a unique violation", async () => {
    expect(await updateShelfName(stub({ error: { code: "23505", message: "dup" } }), "a", "Trips")).toBe("taken");
  });
  it("throws on other errors", async () => {
    await expect(updateShelfName(stub({ error: { code: "XX", message: "boom" } }), "a", "Trips")).rejects.toThrow("boom");
  });
});

describe("listBookShelfIds", () => {
  const stub = (result: { data: unknown; error: { message: string } | null }) => {
    const calls: unknown[][] = [];
    const supabase = {
      from: (table: string) => {
        calls.push(["from", table]);
        return {
          select: () => ({
            eq: (column: string, value: string) => {
              calls.push(["eq", column, value]);
              return Promise.resolve(result);
            },
          }),
        };
      },
    } as unknown as SupabaseClient<Database>;
    return { supabase, calls };
  };
  it("returns the shelf ids of the book", async () => {
    const { supabase, calls } = stub({ data: [{ shelf_id: SHELF }], error: null });
    expect(await listBookShelfIds(supabase, BOOK)).toEqual([SHELF]);
    expect(calls).toEqual([
      ["from", "book_shelves"],
      ["eq", "book_id", BOOK],
    ]);
  });
  it("is empty for a malformed id without querying", async () => {
    const { supabase, calls } = stub({ data: null, error: { message: "boom" } });
    expect(await listBookShelfIds(supabase, "nope")).toEqual([]);
    expect(calls).toEqual([]);
  });
  it("throws on a database error", async () => {
    await expect(listBookShelfIds(stub({ data: null, error: { message: "boom" } }).supabase, BOOK)).rejects.toThrow("boom");
  });
});

describe("parseShelfChoice", () => {
  const choice = (shelf?: string) => {
    const f = new FormData();
    if (shelf !== undefined) f.set("shelf", shelf);
    return f;
  };
  it("accepts a uuid", () => {
    expect(parseShelfChoice(choice(SHELF))).toEqual({ ok: true, value: SHELF });
  });
  it.each([undefined, "", "travel"])("asks to choose a shelf for %s", (value) => {
    expect(parseShelfChoice(choice(value))).toEqual({ ok: false, fieldErrors: { shelf: "Choose a shelf" } });
  });
});

describe("addBookToShelf", () => {
  const stub = (error: { code?: string; message: string } | null) =>
    ({ from: () => ({ insert: () => Promise.resolve({ error }) }) }) as unknown as SupabaseClient<Database>;
  it("is ok on success or when already on the shelf", async () => {
    expect(await addBookToShelf(stub(null), BOOK, SHELF)).toBe("ok");
    expect(await addBookToShelf(stub({ code: "23505", message: "dup" }), BOOK, SHELF)).toBe("ok");
  });
  it.each(["23503", "42501"])("is missing on %s", async (code) => {
    expect(await addBookToShelf(stub({ code, message: "no" }), BOOK, SHELF)).toBe("missing");
  });
  it("throws on other errors", async () => {
    await expect(addBookToShelf(stub({ code: "XX", message: "boom" }), BOOK, SHELF)).rejects.toThrow("boom");
  });
});

describe("removeShelf", () => {
  const stub = (data: { id: string }[] | null, error: { message: string } | null = null) =>
    ({ from: () => ({ delete: () => ({ eq: () => ({ select: () => Promise.resolve({ data, error }) }) }) }) }) as unknown as SupabaseClient<Database>;
  it("is true when a row was deleted, false when none was", async () => {
    expect(await removeShelf(stub([{ id: "s" }]), "s")).toBe(true);
    expect(await removeShelf(stub([]), "s")).toBe(false);
  });
  it("throws on a database error", async () => {
    await expect(removeShelf(stub(null, { message: "boom" }), "s")).rejects.toThrow("boom");
  });
});
