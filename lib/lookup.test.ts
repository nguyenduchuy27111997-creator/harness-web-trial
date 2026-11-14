import { describe, expect, it } from "vitest";
import { createLookup, parseLookupQuery } from "./lookup";

const DAY = 24 * 60 * 60 * 1000;

function fakeFetch() {
  const calls: string[] = [];
  const fetch = (async (url: string) => {
    calls.push(url);
    if (url.endsWith("/isbn/9780141439518.json")) {
      return Response.json({ title: "Pride and Prejudice", authors: [{ key: "/authors/OL21594A" }], number_of_pages: 480 });
    }
    if (url.endsWith("/authors/OL21594A.json")) return Response.json({ name: "Jane Austen" });
    if (url.includes("/search.json?")) {
      return Response.json({ docs: [{ title: "The Hobbit", author_name: ["J.R.R. Tolkien"], number_of_pages_median: 310 }] });
    }
    if (url.includes("/isbn/")) return new Response("{}", { status: 404 });
    return new Response("", { status: 503 });
  }) as typeof globalThis.fetch;
  return { fetch, calls };
}

describe("parseLookupQuery", () => {
  it("reads an ISBN with hyphens or spaces as an isbn", () => {
    expect(parseLookupQuery(" 978-0-14-143951 8 ")).toEqual({ kind: "isbn", key: "9780141439518" });
    expect(parseLookupQuery("014143951X")).toEqual({ kind: "isbn", key: "014143951X" });
  });
  it("reads anything else as a lower-cased title", () => {
    expect(parseLookupQuery("  The Hobbit ")).toEqual({ kind: "title", key: "the hobbit" });
  });
  it("refuses empty, too long or non-string input", () => {
    expect(parseLookupQuery("   ")).toBeNull();
    expect(parseLookupQuery("x".repeat(201))).toBeNull();
    expect(parseLookupQuery(null)).toBeNull();
  });
});

describe("lookupBook", () => {
  it("looks up an ISBN with its author", async () => {
    const { fetch } = fakeFetch();
    const lookupBook = createLookup({ fetch, now: () => 0 });
    expect(await lookupBook("9780141439518")).toEqual({
      status: "found",
      book: { title: "Pride and Prejudice", author: "Jane Austen", totalPages: 480 },
    });
  });

  it("looks up a title", async () => {
    const { fetch, calls } = fakeFetch();
    const lookupBook = createLookup({ fetch, now: () => 0 });
    expect(await lookupBook("The Hobbit")).toEqual({
      status: "found",
      book: { title: "The Hobbit", author: "J.R.R. Tolkien", totalPages: 310 },
    });
    expect(calls[0]).toBe(
      "https://openlibrary.org/search.json?title=the+hobbit&limit=1&fields=title%2Cauthor_name%2Cnumber_of_pages_median",
    );
  });

  it("calls Open Library once for the same ISBN twice within a day, again after a day", async () => {
    const { fetch, calls } = fakeFetch();
    let time = 0;
    const lookupBook = createLookup({ fetch, now: () => time });
    await lookupBook("9780141439518");
    time = DAY - 1;
    await lookupBook("978-0141439518");
    expect(calls.filter((u) => u.includes("/isbn/"))).toHaveLength(1);
    time = 2 * DAY;
    await lookupBook("9780141439518");
    expect(calls.filter((u) => u.includes("/isbn/"))).toHaveLength(2);
  });

  it("answers not_found on a 404 and caches it", async () => {
    const { fetch, calls } = fakeFetch();
    const lookupBook = createLookup({ fetch, now: () => 0 });
    expect(await lookupBook("9780000000002")).toEqual({ status: "not_found" });
    await lookupBook("9780000000002");
    expect(calls).toHaveLength(1);
  });
});
