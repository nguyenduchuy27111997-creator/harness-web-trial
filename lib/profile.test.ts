import { describe, expect, it } from "vitest";
import { parseDisplayName } from "./profile";

const form = (v: string) => {
  const f = new FormData();
  f.set("display_name", v);
  return f;
};

describe("parseDisplayName", () => {
  it("trims a valid name", () => {
    expect(parseDisplayName(form("  Huy "))).toEqual({ ok: true, value: "Huy" });
  });
  it("rejects an empty name", () => {
    expect(parseDisplayName(form("   "))).toEqual({ ok: false, fieldErrors: { display_name: "Enter a name" } });
  });
  it("accepts 40 characters and rejects 41", () => {
    expect(parseDisplayName(form("a".repeat(40))).ok).toBe(true);
    expect(parseDisplayName(form("a".repeat(41)))).toEqual({
      ok: false,
      fieldErrors: { display_name: "Names are at most 40 characters" },
    });
  });
});
