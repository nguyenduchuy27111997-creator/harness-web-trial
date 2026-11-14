import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { Database } from "./database.types";
import {
  COVER_MAX_BYTES,
  coverPath,
  getCoverPath,
  parseCoverFile,
  removeAllCovers,
  removeCover,
  removeCoverObject,
  signCover,
  sniffImageType,
  uploadCover,
} from "./covers";

const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0];

describe("parseCoverFile", () => {
  it("accepts JPEG, PNG and WebP up to 2 MB", () => {
    expect(parseCoverFile(new File(["x"], "a.png", { type: "image/png" }))).toMatchObject({ ext: "png" });
    expect(parseCoverFile(new File(["x"], "a.jpg", { type: "image/jpeg" }))).toMatchObject({ ext: "jpg" });
    expect(parseCoverFile(new File(["x"], "a.webp", { type: "image/webp" }))).toMatchObject({ ext: "webp" });
  });
  it("refuses empty, oversize, other types and non-files", () => {
    const msg = { error: "Use a JPEG, PNG or WebP image up to 2 MB" };
    expect(parseCoverFile(new File([], "a.png", { type: "image/png" }))).toEqual(msg);
    expect(parseCoverFile(new File([new Uint8Array(COVER_MAX_BYTES + 1)], "a.png", { type: "image/png" }))).toEqual(msg);
    expect(parseCoverFile(new File(["x"], "a.gif", { type: "image/gif" }))).toEqual(msg);
    expect(parseCoverFile("text")).toEqual(msg);
    expect(parseCoverFile(null)).toEqual(msg);
  });
});

describe("sniffImageType", () => {
  it("names the type from the file's own bytes", () => {
    expect(sniffImageType(new Uint8Array(png))).toBe("image/png");
    expect(sniffImageType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    const webp = [...Buffer.from("RIFF"), 0, 0, 0, 0, ...Buffer.from("WEBP")];
    expect(sniffImageType(new Uint8Array(webp))).toBe("image/webp");
  });
  it("refuses text and other content, whatever its declared type", () => {
    expect(sniffImageType(new TextEncoder().encode("not an image"))).toBeNull();
    expect(sniffImageType(new TextEncoder().encode("GIF89a"))).toBeNull();
    expect(sniffImageType(new Uint8Array())).toBeNull();
  });
});

describe("coverPath", () => {
  it("names the object under the user's folder after the book, with a random part", () => {
    const a = coverPath("u1", "b1", "png");
    expect(a).toMatch(/^u1\/b1-.{36}\.png$/);
    expect(coverPath("u1", "b1", "png")).not.toBe(a);
  });
});

// A fake client: `book` is what the books select returns; storage calls are recorded.
function fake(opts: { book?: { cover_path: string | null } | null; updateRows?: unknown[]; list?: string[][] }) {
  const calls: string[] = [];
  const lists = [...(opts.list ?? [])];
  const query = {
    select: () => query,
    eq: () => query,
    maybeSingle: async () => ({ data: opts.book ?? null, error: null }),
    update: (v: { cover_path: string | null }) => {
      calls.push(`update:${v.cover_path === null ? "null" : "path"}`);
      return query;
    },
    then: (res: (v: unknown) => unknown) => res({ data: opts.updateRows ?? [{ id: "b" }], error: null }),
  };
  const bucket = {
    upload: async (p: string) => (calls.push(`upload:${p}`), { error: null }),
    remove: async (ps: string[]) => (calls.push(`remove:${ps.join(",")}`), { error: null }),
    list: async () => ({ data: (lists.shift() ?? []).map((name) => ({ name })), error: null }),
    createSignedUrl: async (p: string) => ({ data: { signedUrl: `https://s/${p}` } }),
  };
  const supabase = { from: () => query, storage: { from: () => bucket } } as unknown as SupabaseClient<Database>;
  return { supabase, calls };
}
const file = new File(["x"], "a.png", { type: "image/png" });

describe("uploadCover", () => {
  it("is false for a book that is not the user's, and stores nothing", async () => {
    const { supabase, calls } = fake({ book: null });
    expect(await uploadCover(supabase, "u", "b", file, "png")).toBe(false);
    expect(calls).toEqual([]);
  });
  it("uploads, points the book at it, then removes the old object", async () => {
    const { supabase, calls } = fake({ book: { cover_path: "u/b-old.png" } });
    expect(await uploadCover(supabase, "u", "b", file, "png")).toBe(true);
    expect(calls.map((c) => c.split(":")[0])).toEqual(["upload", "update", "remove"]);
    expect(calls[2]).toBe("remove:u/b-old.png");
  });
  it("removes the new object when no book row changed", async () => {
    const { supabase, calls } = fake({ book: { cover_path: null }, updateRows: [] });
    expect(await uploadCover(supabase, "u", "b", file, "png")).toBe(false);
    expect(calls[calls.length - 1]).toMatch(/^remove:u\/b-/);
  });
});

describe("removeCover and friends", () => {
  it("clears the path and removes the object", async () => {
    const { supabase, calls } = fake({ book: { cover_path: "u/b-x.png" } });
    expect(await removeCover(supabase, "b")).toBe(true);
    expect(calls).toEqual(["update:null", "remove:u/b-x.png"]);
  });
  it("does nothing for a book without a cover", async () => {
    const { supabase, calls } = fake({ book: { cover_path: null } });
    expect(await removeCover(supabase, "b")).toBe(false);
    expect(calls).toEqual([]);
  });
  it("removeCoverObject ignores null", async () => {
    const { supabase, calls } = fake({});
    await removeCoverObject(supabase, null);
    await removeCoverObject(supabase, "u/b-x.png");
    expect(calls).toEqual(["remove:u/b-x.png"]);
  });
  it("removeAllCovers removes every page of files", async () => {
    const { supabase, calls } = fake({ list: [["a.png", "b.png"], ["c.png"], []] });
    await removeAllCovers(supabase, "u");
    expect(calls).toEqual(["remove:u/a.png,u/b.png", "remove:u/c.png"]);
  });
  it("signCover gives a URL, or null without a path", async () => {
    const { supabase } = fake({});
    expect(await signCover(supabase, "u/b-x.png")).toBe("https://s/u/b-x.png");
    expect(await signCover(supabase, null)).toBeNull();
    expect(await getCoverPath(fake({ book: { cover_path: "p" } }).supabase, "b")).toBe("p");
  });
});
