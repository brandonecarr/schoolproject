import { describe, it, expect } from "vitest";
import { csvCell, toCsv } from "@/lib/csv";

describe("csvCell", () => {
  it("passes plain values through", () => {
    expect(csvCell("Ada")).toBe("Ada");
    expect(csvCell(42)).toBe("42");
  });

  it("renders null/undefined as empty", () => {
    expect(csvCell(null)).toBe("");
    expect(csvCell(undefined)).toBe("");
  });

  it("quotes values containing commas, quotes, or newlines", () => {
    expect(csvCell("Fractions, decimals")).toBe('"Fractions, decimals"');
    expect(csvCell('He said "go"')).toBe('"He said ""go"""');
    expect(csvCell("line1\nline2")).toBe('"line1\nline2"');
  });

  it("neutralises spreadsheet formula injection", () => {
    // A title starting with = would execute in Excel/Sheets.
    expect(csvCell("=SUM(A1:A9)")).toBe("'=SUM(A1:A9)");
    expect(csvCell("+1234")).toBe("'+1234");
    expect(csvCell("-cmd")).toBe("'-cmd");
    expect(csvCell("@import")).toBe("'@import");
  });

  it("still quotes an injected value that also contains a comma", () => {
    expect(csvCell("=A1,B2")).toBe(`"'=A1,B2"`);
  });
});

describe("toCsv", () => {
  it("writes a header row and CRLF line endings with a BOM", () => {
    const out = toCsv(["Student", "Score"], [["Ada", 10]]);
    expect(out.startsWith("﻿")).toBe(true);
    expect(out).toContain("Student,Score\r\n");
    expect(out).toContain("Ada,10\r\n");
  });

  it("keeps columns aligned when a field contains a comma", () => {
    const out = toCsv(["Title", "Points"], [["Fractions, part 2", 15]]);
    const dataLine = out.split("\r\n")[1];
    expect(dataLine).toBe('"Fractions, part 2",15');
  });
});
