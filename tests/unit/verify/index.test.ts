import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWk1 } from "../../../src/parser/index.ts";
import { verifyBytes, verifySheet } from "../../../src/verify/index.ts";
import { TOLERANCE } from "../../../src/verify/tolerance.ts";
import { bin, buildSheet, n, ref, sheetOf } from "../helpers/build-sheet.ts";

describe("verifySheet (requirements 1, 5, 12, 13, 29)", () => {
  const sheet = buildSheet({
    B2: { f: bin("add", ref("A1"), n(1)), cached: 3 },
    A1: 2,
    C1: { f: bin("mul", ref("A1"), n(2)), cached: 4 },
    A2: { f: ref("B2"), cached: 3 },
  });

  it("names the sheet, copies the format and the tolerance", () => {
    const v = verifySheet(sheet, "book.wk1");
    expect(v.name).toBe("book.wk1");
    expect(v.format).toBe("wk1");
    expect(v.tolerance).toEqual(TOLERANCE);
  });

  it("lists formula cells only, in row-major order whatever the Map order", () => {
    const forward = verifySheet(sheet, "x");
    const backward = verifySheet(sheetOf([...sheet.cells.values()].reverse()), "x");
    expect(forward.cells.map((c) => c.address)).toEqual(["C1", "A2", "B2"]);
    expect(backward).toEqual(forward);
  });

  it("totals agree with the cells", () => {
    expect(verifySheet(sheet, "x").totals).toEqual({ formulas: 3, matched: 3, mismatched: 0, unverifiable: 0, exact: 3, withinTolerance: 0, byReason: { exact: 3 } });
  });
});

describe("verifyBytes (requirements 1, 4)", () => {
  it("returns the parser diagnostics and the verification of a built fixture", () => {
    const bytes = new Uint8Array(readFileSync("fixtures/mixed/mixed.wk1"));
    const parsed = parseWk1(bytes);
    const r = verifyBytes(bytes, "mixed.wk1");
    expect(r.diagnostics).toEqual(parsed.diagnostics);
    expect(r.verification).toEqual(verifySheet(parsed.sheet, "mixed.wk1"));
    expect(r.verification.totals.formulas).toBe(parsed.stats.formulas);
    expect(r.verification.totals.formulas).toBeGreaterThan(0);
  });

  it("returns an empty verification for garbage, without throwing", () => {
    const r = verifyBytes(new Uint8Array([1, 2, 3, 250, 0, 9]), "junk");
    expect(r.diagnostics.length).toBeGreaterThan(0);
    expect(r.verification.cells).toEqual([]);
    expect(r.verification.totals.formulas).toBe(0);
  });
});
