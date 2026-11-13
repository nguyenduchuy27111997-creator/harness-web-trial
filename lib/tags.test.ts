import { describe, expect, it } from "vitest";
import {
  addTag,
  listBookTags,
  listTags,
  listTagsForBooks,
  parseTagName,
  removeTag,
  sortTags,
} from "./tags";

function form(name?: string) {
  const f = new FormData();
  if (name !== undefined) f.set("name", name);
  return f;
}

describe("parseTagName", () => {
  it("trims", () =>
    expect(parseTagName(form(" classic "))).toEqual({
      ok: true,
      value: "classic",
    }));
  it("requires a tag", () => expect(parseTagName(form("  ")).ok).toBe(false));
  it("allows 24 characters, not 25", () => {
    expect(parseTagName(form("a".repeat(24))).ok).toBe(true);
    expect(parseTagName(form("a".repeat(25))).ok).toBe(false);
  });
  it("counts characters, not UTF-16 units, as the database does", () => {
    expect(parseTagName(form("📚".repeat(24))).ok).toBe(true);
    expect(parseTagName(form("📚".repeat(25))).ok).toBe(false);
  });
});

describe("sortTags", () => {
  it("sorts A to Z ignoring case", () => {
    expect(
      sortTags([{ name: "travel" }, { name: "Classic" }]).map((t) => t.name),
    ).toEqual(["Classic", "travel"]);
  });
});

// A fake client: each from() call takes the next queued result, whatever is chained on it.
function fakeClient(
  results: {
    data?: unknown;
    error?: { code?: string; message: string } | null;
    count?: number;
  }[],
) {
  const calls: string[] = [];
  const client = {
    from(table: string) {
      calls.push(table);
      const result = { data: null, error: null, ...results.shift() };
      const chain: Record<string, unknown> = new Proxy(
        {},
        {
          get: (_t, prop) =>
            prop === "then"
              ? (resolve: (v: unknown) => void) => resolve(result)
              : () => chain,
        },
      );
      return chain;
    },
  };
  return {
    client: client as unknown as Parameters<typeof listBookTags>[0],
    calls,
  };
}

const BOOK = "11111111-1111-4111-8111-111111111111";

describe("listBookTags", () => {
  it("returns the book's tags A to Z, skipping missing ones", async () => {
    const { client } = fakeClient([
      {
        data: [
          { tag: { id: "2", name: "travel" } },
          { tag: null },
          { tag: { id: "1", name: "Classic" } },
        ],
      },
    ]);
    expect(await listBookTags(client, BOOK)).toEqual([
      { id: "1", name: "Classic" },
      { id: "2", name: "travel" },
    ]);
  });
  it("throws on error", async () => {
    const { client } = fakeClient([{ error: { message: "boom" } }]);
    await expect(listBookTags(client, BOOK)).rejects.toThrow("boom");
  });
});

describe("listTagsForBooks", () => {
  it("groups sorted tag names by book", async () => {
    const { client } = fakeClient([
      {
        data: [
          { book_id: "a", tag: { name: "z" } },
          { book_id: "a", tag: { name: "b" } },
          { book_id: "c", tag: null },
        ],
      },
    ]);
    expect([...(await listTagsForBooks(client))]).toEqual([["a", ["b", "z"]]]);
  });
  it("throws on error", async () => {
    const { client } = fakeClient([{ error: { message: "boom" } }]);
    await expect(listTagsForBooks(client)).rejects.toThrow("boom");
  });
});

describe("addTag", () => {
  it("rejects a tag the book already has, ignoring case", async () => {
    const { client } = fakeClient([
      { data: [{ tag: { id: "1", name: "Classic" } }] },
    ]);
    expect(await addTag(client, BOOK, "classic")).toBe("duplicate");
  });
  it("rejects an 11th tag", async () => {
    const data = Array.from({ length: 10 }, (_, i) => ({
      tag: { id: String(i), name: `t${i}` },
    }));
    const { client } = fakeClient([{ data }]);
    expect(await addTag(client, BOOK, "new")).toBe("full");
  });
  it("reuses an existing tag", async () => {
    const { client, calls } = fakeClient([
      { data: [] },
      { data: [{ id: "t" }] },
      {},
    ]);
    expect(await addTag(client, BOOK, "classic")).toBe("added");
    expect(calls).toEqual(["book_tags", "tags", "book_tags"]);
  });
  it("creates a new tag, and finds it again after a race", async () => {
    const { client } = fakeClient([
      { data: [] },
      { data: [] },
      { data: { id: "t" } },
      {},
    ]);
    expect(await addTag(client, BOOK, "classic")).toBe("added");
    const raced = fakeClient([
      { data: [] },
      { data: [] },
      { error: { code: "23505", message: "dup" } },
      { data: [{ id: "t" }] },
      {},
    ]);
    expect(await addTag(raced.client, BOOK, "classic")).toBe("added");
  });
  it("maps insert errors", async () => {
    const run = (code: string) =>
      addTag(
        fakeClient([
          { data: [] },
          { data: [{ id: "t" }] },
          { error: { code, message: code } },
        ]).client,
        BOOK,
        "x",
      );
    expect(await run("23505")).toBe("duplicate");
    expect(await run("23503")).toBe("missing");
    expect(await run("42501")).toBe("missing");
    await expect(run("XX000")).rejects.toThrow("XX000");
  });
});

describe("removeTag", () => {
  it("returns false when the book did not have the tag", async () => {
    expect(await removeTag(fakeClient([{ data: [] }]).client, BOOK, "t")).toBe(
      false,
    );
  });
  it("deletes the tag when its last book row goes", async () => {
    const { client, calls } = fakeClient([
      { data: [{ tag_id: "t" }] },
      { count: 0 },
      {},
    ]);
    expect(await removeTag(client, BOOK, "t")).toBe(true);
    expect(calls).toEqual(["book_tags", "book_tags", "tags"]);
  });
  it("keeps a tag other books still have", async () => {
    const { client, calls } = fakeClient([
      { data: [{ tag_id: "t" }] },
      { count: 2 },
    ]);
    expect(await removeTag(client, BOOK, "t")).toBe(true);
    expect(calls).toEqual(["book_tags", "book_tags"]);
  });
  it("throws on errors", async () => {
    await expect(
      removeTag(fakeClient([{ error: { message: "a" } }]).client, BOOK, "t"),
    ).rejects.toThrow("a");
    await expect(
      removeTag(
        fakeClient([{ data: [{ tag_id: "t" }] }, { error: { message: "c" } }])
          .client,
        BOOK,
        "t",
      ),
    ).rejects.toThrow("c");
  });
  it("throws when deleting the unused tag fails", async () => {
    const { client } = fakeClient([
      { data: [{ tag_id: "t" }] },
      { count: 0 },
      { error: { message: "d" } },
    ]);
    await expect(removeTag(client, BOOK, "t")).rejects.toThrow("d");
  });
});

describe("listTags", () => {
  it("returns tags with counts A to Z, leaving out tags no book has", async () => {
    const { client } = fakeClient([
      {
        data: [
          { id: "2", name: "travel", book_tags: [{ count: 2 }] },
          { id: "3", name: "unused", book_tags: [{ count: 0 }] },
          { id: "1", name: "Classic", book_tags: [{ count: 1 }] },
        ],
      },
    ]);
    expect(await listTags(client)).toEqual([
      { id: "1", name: "Classic", count: 1 },
      { id: "2", name: "travel", count: 2 },
    ]);
  });
  it("throws on error", async () => {
    const { client } = fakeClient([{ error: { message: "boom" } }]);
    await expect(listTags(client)).rejects.toThrow("boom");
  });
});
