import { describe, expect, it } from "vitest";
import { parseCsv, toCsv } from "./csv";

describe("toCsv", () => {
  it("joins fields with commas and ends lines with CRLF", () => {
    expect(toCsv([["a", "b"], ["c", ""]])).toBe("a,b\r\nc,\r\n");
  });

  it("quotes fields with commas, quotes or line breaks, doubling quotes", () => {
    expect(toCsv([["Hello, World", 'Say "hi"', "a\nb"]])).toBe('"Hello, World","Say ""hi""","a\nb"\r\n');
  });
});

describe("parseCsv", () => {
  it("is the inverse of toCsv", () => {
    const rows = [["t", "a"], ["Hello, World", 'Say "hi"'], ["x\r\ny", ""]];
    expect(parseCsv(toCsv(rows))).toEqual(rows);
  });

  it("strips a BOM, accepts LF and ignores a final empty line", () => {
    expect(parseCsv("﻿a,b\nc,d\n")).toEqual([["a", "b"], ["c", "d"]]);
  });
});
