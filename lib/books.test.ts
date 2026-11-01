import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import { listBooks } from "./books";

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
