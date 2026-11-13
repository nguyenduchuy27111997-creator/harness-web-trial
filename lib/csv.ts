export const CSV_COLUMNS = ["title", "author", "status", "rating", "total_pages", "started_on", "finished_on"] as const;

function field(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv(rows: string[][]): string {
  return rows.map((row) => row.map(field).join(",") + "\r\n").join("");
}

export function parseCsv(text: string): string[][] {
  const src = text.startsWith("﻿") ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (quoted) {
      if (c === '"' && src[i + 1] === '"') {
        value += '"';
        i++;
      } else if (c === '"') quoted = false;
      else value += c;
    } else if (c === '"') quoted = true;
    else if (c === ",") {
      row.push(value);
      value = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(value);
      rows.push(row);
      row = [];
      value = "";
    } else value += c;
  }
  if (value !== "" || row.length > 0) {
    row.push(value);
    rows.push(row);
  }
  return rows;
}
