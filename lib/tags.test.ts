import { describe, expect, it } from "vitest";
import { parseTagName, sortTags } from "./tags";

function form(name?: string) {
  const f = new FormData();
  if (name !== undefined) f.set("name", name);
  return f;
}

describe("parseTagName", () => {
  it("trims", () => expect(parseTagName(form(" classic "))).toEqual({ ok: true, value: "classic" }));
  it("requires a tag", () => expect(parseTagName(form("  ")).ok).toBe(false));
  it("allows 24 characters, not 25", () => {
    expect(parseTagName(form("a".repeat(24))).ok).toBe(true);
    expect(parseTagName(form("a".repeat(25))).ok).toBe(false);
  });
});

describe("sortTags", () => {
  it("sorts A to Z ignoring case", () => {
    expect(sortTags([{ name: "travel" }, { name: "Classic" }]).map((t) => t.name)).toEqual(["Classic", "travel"]);
  });
});
