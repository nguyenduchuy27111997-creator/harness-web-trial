import { describe, expect, it } from "vitest";
import { CSV_COLUMNS, toCsv } from "./csv";
import { parseImport } from "./import";

const header = [...CSV_COLUMNS];
const today = "2026-06-01";

describe("parseImport", () => {
  it("refuses a file without the export header", () => {
    expect(parseImport("name,author\r\nA,B\r\n", [], today)).toEqual({ error: "This is not a Bookshelf CSV file" });
  });

  it("refuses more than 1,000 rows", () => {
    const rows = Array.from({ length: 1001 }, (_, i) => [`T${i}`, "A", "reading", "", "", "", ""]);
    expect(parseImport(toCsv([header, ...rows]), [], today)).toEqual({ error: "The file is too large" });
  });

  it("keeps status, rating, pages and dates of valid rows", () => {
    const csv = toCsv([
      header,
      ["Dune", "Herbert", "finished", "5", "412", "2026-01-02", "2026-02-03"],
      ["Emma", "Austen", "want_to_read", "3", "300", "2026-01-02", ""],
    ]);
    expect(parseImport(csv, [], today)).toEqual({
      rows: [
        { title: "Dune", author: "Herbert", status: "finished", rating: 5, total_pages: 412, started_on: "2026-01-02", finished_on: "2026-02-03" },
        { title: "Emma", author: "Austen", status: "want_to_read", rating: null, total_pages: 300, started_on: null, finished_on: null },
      ],
      skipped: [],
    });
  });

  it("skips invalid and duplicate rows with their line numbers", () => {
    const csv = toCsv([
      header,
      ["", "X", "reading", "", "", "", ""],
      ["A", "X", "lost", "", "", "", ""],
      ["B", "X", "finished", "9", "", "", ""],
      ["dune ", "HERBERT", "reading", "", "", "", ""],
      ["C", "X", "reading", "", "abc", "2027-01-01", ""],
      ["c", "x", "reading", "", "", "", ""],
    ]);
    expect(parseImport(csv, [{ title: "Dune", author: "Herbert" }], today)).toEqual({
      rows: [{ title: "C", author: "X", status: "reading", rating: null, total_pages: null, started_on: null, finished_on: null }],
      skipped: [
        { line: 2, reason: "No title" },
        { line: 3, reason: "Unknown status" },
        { line: 4, reason: "Rating must be 1 to 5" },
        { line: 5, reason: "Already on your shelf" },
        { line: 7, reason: "Already on your shelf" },
      ],
    });
  });
});
