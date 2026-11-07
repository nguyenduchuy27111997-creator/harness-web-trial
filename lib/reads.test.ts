import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import { listPastReads, readAgain } from "./reads";

const B = "11111111-1111-4111-8111-111111111111";

describe("readAgain", () => {
  it("returns the function's boolean", async () => {
    const rpc = async (name: string, args: unknown) => {
      expect([name, args]).toEqual(["read_again", { p_book_id: B }]);
      return { data: true, error: null };
    };
    expect(await readAgain({ rpc } as unknown as SupabaseClient<Database>, B)).toBe(true);
    expect(await readAgain({ rpc: async () => ({ data: false, error: null }) } as unknown as SupabaseClient<Database>, B)).toBe(false);
  });
  it("throws on an error", async () => {
    const supabase = { rpc: async () => ({ data: null, error: { message: "boom" } }) } as unknown as SupabaseClient<Database>;
    await expect(readAgain(supabase, B)).rejects.toThrow("boom");
  });
});

describe("listPastReads", () => {
  it("returns no reads for a malformed id", async () => {
    expect(await listPastReads({} as SupabaseClient<Database>, "nope")).toEqual([]);
  });
  it("filters by book and orders newest first", async () => {
    const calls: string[] = [];
    const query: Record<string, unknown> = { then: (resolve: (v: unknown) => void) => resolve({ data: [{ id: "r" }], error: null }) };
    for (const name of ["select", "eq", "order"]) {
      query[name] = (...args: unknown[]) => (calls.push(`${name} ${args.map((a) => JSON.stringify(a)).join(" ")}`), query);
    }
    expect(await listPastReads({ from: () => query } as unknown as SupabaseClient<Database>, B)).toEqual([{ id: "r" }]);
    expect(calls.slice(1)).toEqual([
      `eq "book_id" "${B}"`,
      'order "finished_on" {"ascending":false}',
      'order "created_at" {"ascending":false}',
      'order "id" {"ascending":false}',
    ]);
  });
  it("throws on an error", async () => {
    const query = { select: () => query, eq: () => query, order: () => (query.n++ < 2 ? query : Promise.resolve({ data: null, error: { message: "boom" } })), n: 0 };
    await expect(listPastReads({ from: () => query } as unknown as SupabaseClient<Database>, B)).rejects.toThrow("boom");
  });
});
