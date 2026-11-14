import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "./database.types";
import { getSharedShelf } from "./share";

const TOKEN = "a".repeat(48);

function fakeRpc(rows: unknown[]) {
  const rpc = vi.fn(() => ({ overrideTypes: () => Promise.resolve({ data: rows, error: null }) }));
  return { client: { rpc } as unknown as SupabaseClient<Database>, rpc };
}

describe("getSharedShelf", () => {
  it("returns null without a query for a malformed token", async () => {
    const { client, rpc } = fakeRpc([]);
    expect(await getSharedShelf(client, "not-a-token")).toBeNull();
    expect(await getSharedShelf(client, "A".repeat(48))).toBeNull();
    expect(rpc).not.toHaveBeenCalled();
  });
  it("returns null for an unknown token", async () => {
    expect(await getSharedShelf(fakeRpc([]).client, TOKEN)).toBeNull();
  });
  it("returns an empty shelf from its one null-book row", async () => {
    const row = { shelf_name: "Club", book_id: null, title: null, author: null, status: null, rating: null, cover_path: null, added_at: null };
    expect(await getSharedShelf(fakeRpc([row]).client, TOKEN)).toEqual({ name: "Club", books: [] });
  });
  it("maps book rows", async () => {
    const row = { shelf_name: "Club", book_id: "b1", title: "T", author: "A", status: "finished", rating: 4, cover_path: "u/b1-x.png", added_at: "2026-11-14" };
    expect(await getSharedShelf(fakeRpc([row]).client, TOKEN)).toEqual({
      name: "Club",
      books: [{ id: "b1", title: "T", author: "A", status: "finished", rating: 4, coverPath: "u/b1-x.png" }],
    });
  });
});
