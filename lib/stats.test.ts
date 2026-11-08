import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import { countByMonth, formatAverage, getStats, summarizeStats } from "./stats";

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

describe("getStats", () => {
  type Result = { data: unknown; error: { message: string } | null };
  function stub(books: Result, reads: Result = { data: [], error: null }) {
    const calls: unknown[][] = [];
    const from = (table: string) => {
      const query = {
        select: () => query,
        gte: (...args: unknown[]) => (calls.push([table, "gte", ...args]), query),
        lt: (...args: unknown[]) => (calls.push([table, "lt", ...args]), Promise.resolve(table === "books" ? books : reads)),
      };
      return query;
    };
    return { client: { from } as unknown as SupabaseClient<Database>, calls };
  }

  it("limits to the UTC calendar year", async () => {
    const { client, calls } = stub({ data: [{ rating: 3, finished_on: "2026-03-03" }], error: null });
    const stats = await getStats(client, new Date("2026-12-31T23:30:00Z"));
    expect(calls).toContainEqual(["books", "gte", "finished_on", "2026-01-01"]);
    expect(calls).toContainEqual(["reads", "lt", "finished_on", "2027-01-01"]);
    expect(stats).toEqual({ finishedThisYear: 1, averageRating: 3, byMonth: [0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
  });

  it("counts past reads but averages only the books' ratings", async () => {
    const { client } = stub({ data: [{ rating: 4, finished_on: "2026-03-03" }], error: null }, { data: [{ rating: 1, finished_on: "2026-03-20" }], error: null });
    expect(await getStats(client)).toEqual({ finishedThisYear: 2, averageRating: 4, byMonth: [0, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0] });
  });

  it("throws on a database error", async () => {
    const { client } = stub({ data: null, error: { message: "boom" } });
    await expect(getStats(client)).rejects.toThrow("boom");
  });
});

describe("countByMonth", () => {
  it("counts by month, January first", () => {
    expect(countByMonth([])).toEqual(Array(12).fill(0));
    expect(countByMonth(["2026-01-05", "2026-03-03", "2026-03-20"])).toEqual([1, 0, 2, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
  });
});
