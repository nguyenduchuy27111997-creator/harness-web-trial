import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import { insertShelf, listShelves, parseShelfName } from "./shelves";

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
