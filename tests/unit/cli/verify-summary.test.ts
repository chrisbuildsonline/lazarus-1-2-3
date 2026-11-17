import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatSummary, summarizeFile, summaryJson } from "../../../src/cli/verify-summary.ts";
import { SAMPLE_DBF } from "../helpers/dbf-sample.ts";

const MIXED = new Uint8Array(readFileSync("fixtures/mixed/mixed.wk1"));

describe("summarizeFile (requirements 70 to 73)", () => {
  it("counts mixed.wk1: 4 formulas, all matched exactly (manifest counts.formulas is 4, all synthetic)", () => {
    expect(summarizeFile(MIXED)).toEqual({ formulas: 4, matched: 4, mismatched: 0, unverifiable: 0, exact: 4, withinTolerance: 0, byReason: { exact: 4 }, parseErrors: 0 });
  });

  it("gives null for a DBF and for a text file", () => {
    expect(summarizeFile(SAMPLE_DBF)).toBeNull();
    expect(summarizeFile(new TextEncoder().encode("not a spreadsheet"))).toBeNull();
  });

  it("reports parser errors on a truncated record and still counts the cells that parsed", () => {
    // mixed.wk1 ends with D4's FORMULA record (row-major, the last cell), then EOF. Cutting 8 bytes
    // into D4's body leaves D2, D3 and B4: three formulas, none of which reads D4.
    const d4 = MIXED.length - 4 - (4 + 15 + 12); // EOF, then D4: header 4, fixed body 15, rpn of SUM(D2..D3) 12
    expect(MIXED[d4]).toBe(0x10);
    const cut = MIXED.subarray(0, d4 + 8);
    const s = summarizeFile(cut);
    expect(s).not.toBeNull();
    expect(s!.parseErrors).toBeGreaterThan(0);
    expect(s).toMatchObject({ formulas: 3, matched: 3, mismatched: 0, unverifiable: 0 });
    expect(formatSummary(s!)).toBe(`verify: 3 formulas, 3 matched, 0 mismatched, 0 unverifiable (parser errors: ${s!.parseErrors})`);
    expect(summaryJson(s!)).toEqual(s);
  });

  it("drops parseErrors from the JSON object when there are none", () => {
    expect(summaryJson(summarizeFile(MIXED)!)).toEqual({ formulas: 4, matched: 4, mismatched: 0, unverifiable: 0, exact: 4, withinTolerance: 0, byReason: { exact: 4 } });
  });
});
