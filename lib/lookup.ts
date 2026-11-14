export type LookupBook = { title: string; author: string; totalPages: number | null };
export type LookupResult =
  | { status: "found"; book: LookupBook }
  | { status: "not_found" }
  | { status: "timeout" }
  | { status: "unavailable" };

type LookupQuery = { kind: "isbn" | "title"; key: string };

const DAY_MS = 24 * 60 * 60 * 1000;
const OPEN_LIBRARY = "https://openlibrary.org";

// Trimmed, 1–200 characters. An ISBN-10/13 (hyphens or spaces removed) is an isbn, anything else a title.
export function parseLookupQuery(raw: unknown): LookupQuery | null {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (value.length < 1 || value.length > 200) return null;
  const digits = value.replace(/[-\s]/g, "");
  if (/^(\d{9}[\dXx]|\d{13})$/.test(digits)) return { kind: "isbn", key: digits.toUpperCase() };
  return { kind: "title", key: value.toLowerCase() };
}

class HttpError extends Error {
  constructor(readonly status: number) {
    super(`HTTP ${status}`);
  }
}

function pages(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 10000 ? value : null;
}

export function createLookup({ fetch, now }: { fetch: typeof globalThis.fetch; now: () => number }) {
  const cache = new Map<string, { result: LookupResult; at: number }>();

  async function getJson(url: string, signal: AbortSignal): Promise<unknown> {
    const res = await fetch(url, { signal, headers: { Accept: "application/json" } });
    if (!res.ok) throw new HttpError(res.status);
    return res.json();
  }

  async function byIsbn(isbn: string, signal: AbortSignal): Promise<LookupResult> {
    const edition = (await getJson(`${OPEN_LIBRARY}/isbn/${encodeURIComponent(isbn)}.json`, signal)) as {
      title?: unknown;
      authors?: { key?: unknown }[];
      number_of_pages?: unknown;
    };
    if (typeof edition.title !== "string") return { status: "not_found" };
    let author = "";
    const authorKey = edition.authors?.[0]?.key;
    if (typeof authorKey === "string" && /^\/authors\/OL\d+A$/.test(authorKey)) {
      const data = (await getJson(`${OPEN_LIBRARY}${authorKey}.json`, signal)) as { name?: unknown };
      if (typeof data.name === "string") author = data.name;
    }
    return { status: "found", book: { title: edition.title, author, totalPages: pages(edition.number_of_pages) } };
  }

  async function byTitle(title: string, signal: AbortSignal): Promise<LookupResult> {
    const params = new URLSearchParams({ title, limit: "1", fields: "title,author_name,number_of_pages_median" });
    const data = (await getJson(`${OPEN_LIBRARY}/search.json?${params}`, signal)) as {
      docs?: { title?: unknown; author_name?: unknown[]; number_of_pages_median?: unknown }[];
    };
    const doc = data.docs?.[0];
    if (!doc || typeof doc.title !== "string") return { status: "not_found" };
    const author = typeof doc.author_name?.[0] === "string" ? doc.author_name[0] : "";
    return { status: "found", book: { title: doc.title, author, totalPages: pages(doc.number_of_pages_median) } };
  }

  return async function lookupBook(raw: unknown): Promise<LookupResult> {
    const query = parseLookupQuery(raw);
    if (!query) return { status: "not_found" };
    const cacheKey = `${query.kind}:${query.key}`;
    const hit = cache.get(cacheKey);
    if (hit && now() - hit.at < DAY_MS) return hit.result;

    let result: LookupResult;
    try {
      const signal = AbortSignal.timeout(5000);
      result = query.kind === "isbn" ? await byIsbn(query.key, signal) : await byTitle(query.key, signal);
    } catch (error) {
      if (error instanceof HttpError && error.status === 404) result = { status: "not_found" };
      else if (error instanceof DOMException && error.name === "TimeoutError") return { status: "timeout" };
      else return { status: "unavailable" };
    }
    cache.set(cacheKey, { result, at: now() });
    return result;
  };
}

export const lookupBook = createLookup({ fetch: (...args) => globalThis.fetch(...args), now: Date.now });
