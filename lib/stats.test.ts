import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import { formatAverage, getStats, listFinishedReads, summarizeStats } from "./stats";

describe("summarizeStats", () => {
  it("counts books and ignores unrated ones in the average", () => {
    expect(summarizeStats([{ rating: 4 }, { rating: 5 }, { rating: null }])).toEqual({ finishedThisYear: 3, averageRating: 4.5 });
  });

  it("has no average without ratings", () => {
    expect(summarizeStats([])).toEqual({ finishedThisYear: 0, averageRating: null });
    expect(summarizeStats([{ rating: null }])).toEqual({ finishedThisYear: 1, averageRating: null });
  });

  it("rounds to one decimal", () => {
    expect(summarizeStats([{ rating: 4 }, { rating: 4 }, { rating: 5 }]).averageRating).toBe(4.3);
  });
});

describe("formatAverage", () => {
  it("formats with one decimal or a placeholder", () => {
    expect(formatAverage(null)).toBe("No ratings yet");
    expect(formatAverage(4.5)).toBe("4.5");
    expect(formatAverage(4)).toBe("4.0");
  });
});

type Result = { data: unknown; error: { message: string } | null };
function stub(books: Result, reads: Result = { data: [], error: null }) {
  const calls: unknown[][] = [];
  const from = (table: string) => {
    const query = {
      select: (...args: unknown[]) => (calls.push([table, "select", ...args]), query),
      gte: (...args: unknown[]) => (calls.push([table, "gte", ...args]), query),
      lt: (...args: unknown[]) => (calls.push([table, "lt", ...args]), Promise.resolve(table === "books" ? books : reads)),
    };
    return query;
  };
  return { client: { from } as unknown as SupabaseClient<Database>, calls };
}

const book = (id: string, finished_on: string, rating: number | null, total_pages: number | null = null) => ({
  id,
  title: `Title ${id}`,
  finished_on,
  rating,
  total_pages,
});
const read = (id: string, bookId: string, finished_on: string, rating: number | null, total_pages: number | null = null) => ({
  id,
  finished_on,
  rating,
  book: { id: bookId, title: `Title ${bookId}`, total_pages },
});

describe("listFinishedReads", () => {
  it("queries both tables for the year", async () => {
    const { client, calls } = stub({ data: [], error: null });
    await listFinishedReads(client, 2026);
    expect(calls).toContainEqual(["books", "select", "id, title, finished_on, rating, total_pages"]);
    expect(calls).toContainEqual(["reads", "select", "id, finished_on, rating, book:books(id, title, total_pages)"]);
    for (const table of ["books", "reads"]) {
      expect(calls).toContainEqual([table, "gte", "finished_on", "2026-01-01"]);
      expect(calls).toContainEqual([table, "lt", "finished_on", "2027-01-01"]);
    }
  });

  it("merges books and past reads into one shape", async () => {
    const { client } = stub({ data: [book("b1", "2026-03-01", 4, 300)], error: null }, { data: [read("r1", "b1", "2026-02-01", 2, 300)], error: null });
    expect(await listFinishedReads(client, 2026)).toEqual([
      { bookId: "b1", title: "Title b1", finishedOn: "2026-03-01", rating: 4, totalPages: 300, pastReadId: null },
      { bookId: "b1", title: "Title b1", finishedOn: "2026-02-01", rating: 2, totalPages: 300, pastReadId: "r1" },
    ]);
  });

  it("sorts by date desc, current reads first, then book id, then read id", async () => {
    const { client } = stub(
      { data: [book("b2", "2026-05-01", null), book("b1", "2026-04-01", null), book("b3", "2026-05-01", null)], error: null },
      { data: [read("r2", "b1", "2026-05-01", null), read("r1", "b1", "2026-05-01", null), read("r3", "b0", "2026-06-01", null)], error: null },
    );
    const order = (await listFinishedReads(client, 2026)).map((r) => [r.bookId, r.pastReadId]);
    expect(order).toEqual([
      ["b0", "r3"],
      ["b2", null],
      ["b3", null],
      ["b1", "r1"],
      ["b1", "r2"],
      ["b1", null],
    ]);
  });

  it("throws on a database error", async () => {
    await expect(listFinishedReads(stub({ data: [], error: null }, { data: null, error: { message: "boom" } }).client, 2026)).rejects.toThrow("boom");
  });
});

describe("getStats", () => {
  it("limits to the UTC calendar year", async () => {
    const { client, calls } = stub({ data: [book("b1", "2026-12-31", 3)], error: null });
    const stats = await getStats(client, new Date("2026-12-31T23:30:00Z"));
    expect(calls).toContainEqual(["books", "gte", "finished_on", "2026-01-01"]);
    expect(calls).toContainEqual(["reads", "lt", "finished_on", "2027-01-01"]);
    expect(stats).toEqual({ finishedThisYear: 1, averageRating: 3 });
  });

  it("counts past reads but averages only the books' ratings", async () => {
    const year = new Date().getUTCFullYear();
    const { client } = stub({ data: [book("b1", `${year}-02-01`, 4)], error: null }, { data: [read("r1", "b1", `${year}-01-01`, 1)], error: null });
    expect(await getStats(client)).toEqual({ finishedThisYear: 2, averageRating: 4 });
  });

  it("throws on a database error", async () => {
    const { client } = stub({ data: null, error: { message: "boom" } });
    await expect(getStats(client)).rejects.toThrow("boom");
  });
});
