import { readFile } from "node:fs/promises";
import { parseLookupQuery, type LookupResult } from "./lookup";

// Tests and the verifier answer lookups from a JSON file keyed by parseLookupQuery(...).key.
export async function lookupFromFixture(path: string, query: unknown): Promise<LookupResult> {
  const parsed = parseLookupQuery(query);
  if (!parsed) return { status: "not_found" };
  const entries = JSON.parse(await readFile(path, "utf8")) as Record<string, LookupResult>;
  return Object.hasOwn(entries, parsed.key) ? entries[parsed.key] : { status: "not_found" };
}
