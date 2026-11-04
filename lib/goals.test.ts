import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import { GOAL_ERROR, getReadingGoal, goalProgress, parseGoal, saveReadingGoal } from "./goals";

const form = (goal: string) => {
  const data = new FormData();
  data.set("goal", goal);
  return data;
};

describe("parseGoal", () => {
  it("accepts whole numbers from 1 to 365, trimmed", () => {
    expect(parseGoal(form(" 20 "))).toEqual({ ok: true, value: 20 });
    expect(parseGoal(form("1"))).toEqual({ ok: true, value: 1 });
    expect(parseGoal(form("365"))).toEqual({ ok: true, value: 365 });
  });

  it.each(["0", "366", "2.5", "", "abc", "-3"])("rejects %j", (value) => {
    expect(parseGoal(form(value))).toEqual({ ok: false, fieldErrors: { goal: GOAL_ERROR } });
  });
});

describe("goalProgress", () => {
  it("rounds to a percentage capped at 100", () => {
    expect(goalProgress(1, 20)).toBe(5);
    expect(goalProgress(1, 10)).toBe(10);
    expect(goalProgress(30, 20)).toBe(100);
  });
});

describe("getReadingGoal", () => {
  function stub(result: { data: unknown; error: { message: string } | null }) {
    const calls: unknown[][] = [];
    const query = {
      select: () => query,
      eq: (...args: unknown[]) => (calls.push(["eq", ...args]), query),
      maybeSingle: () => Promise.resolve(result),
    };
    return { client: { from: () => query } as unknown as SupabaseClient<Database>, calls };
  }

  it("reads the goal for the UTC year", async () => {
    const { client, calls } = stub({ data: { goal: 12 }, error: null });
    expect(await getReadingGoal(client, new Date("2026-12-31T23:30:00Z"))).toBe(12);
    expect(calls).toEqual([["eq", "year", 2026]]);
  });

  it("is null without a row", async () => {
    expect(await getReadingGoal(stub({ data: null, error: null }).client)).toBeNull();
  });

  it("throws on database errors", async () => {
    await expect(getReadingGoal(stub({ data: null, error: { message: "boom" } }).client)).rejects.toThrow("boom");
  });
});

describe("saveReadingGoal", () => {
  function stub(error: { message: string } | null) {
    const calls: unknown[][] = [];
    const client = {
      from: () => ({ upsert: (...args: unknown[]) => (calls.push(args), Promise.resolve({ error })) }),
    } as unknown as SupabaseClient<Database>;
    return { client, calls };
  }

  it("upserts this UTC year's goal", async () => {
    const { client, calls } = stub(null);
    await saveReadingGoal(client, 20, new Date("2026-06-01T00:00:00Z"));
    expect(calls).toEqual([[{ year: 2026, goal: 20 }, { onConflict: "user_id,year" }]]);
  });

  it("throws on database errors", async () => {
    await expect(saveReadingGoal(stub({ message: "boom" }).client, 5)).rejects.toThrow("boom");
  });
});
