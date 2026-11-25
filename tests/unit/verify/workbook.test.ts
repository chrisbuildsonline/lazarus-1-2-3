import fc from "fast-check";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formula80, number80, writeWk3 } from "../../../scripts/lib/wk3-writer.ts";
import { parseWk1, parseWorkbook } from "../../../src/parser/index.ts";
import { unsupportedFeatures } from "../../../src/report/features.ts";
import { verifyBytes, verifySheet } from "../../../src/verify/index.ts";
import { REASON_CODES } from "../../../src/verify/value.ts";
import { verifyWorkbook, verifyWorkbookBytes } from "../../../src/verify/workbook.ts";
import { writeXlsx } from "../../../src/xlsx/index.ts";

const MIXED = "fixtures/mixed/mixed.wk1";
const KSBASE = "fixtures/ksbase/KSBASE.WK1";

describe("verifyWorkbook for wk1 and wks", () => {
  for (const path of [MIXED, KSBASE]) {
    it(`${path} gives [verifySheet(sheet, name)]`, () => {
      const bytes = new Uint8Array(readFileSync(path));
      const { workbook } = parseWorkbook(bytes);
      expect(verifyWorkbook(workbook, "x.wk1")).toEqual([verifySheet(parseWk1(bytes).sheet, "x.wk1")]);
    });

    it(`${path}: verifyWorkbookBytes equals verifyBytes for one sheet`, () => {
      const bytes = new Uint8Array(readFileSync(path));
      const old = verifyBytes(bytes, "x.wk1");
      expect(verifyWorkbookBytes(bytes, "x.wk1")).toEqual({ diagnostics: old.diagnostics, verifications: [old.verification] });
    });
  }

  it("noise gives one unknown-format verification, as verifyBytes does", () => {
    const bytes = Uint8Array.from([1, 2, 3, 4, 5, 6, 7]);
    expect(verifyWorkbookBytes(bytes, "n").verifications).toEqual([verifyBytes(bytes, "n").verification]);
  });
});

const WK3 = "fixtures/wk3-sheets/wk3-sheets.wk3";
const DBF = "fixtures/dbf-table/dbf-table.dbf";
const LAND = "fixtures/natural-earth-land/ne_110m_land.dbf";
const read = (path: string) => new Uint8Array(readFileSync(path));

describe("verifyWorkbook for wk3", () => {
  it("decodes and checks each formula of the synthetic workbook: matched, foreign reference, unknown token", () => {
    const { verifications } = verifyWorkbookBytes(read(WK3), "wk3-sheets.wk3");
    expect(verifications.map((v) => [v.format, v.cells.length])).toEqual([
      ["wk3", 0],
      ["wk3", 0],
      ["wk3", 3],
    ]);
    const [c2, d2, e2] = verifications[2]!.cells;
    // Totals!C2 = A1+B1+C1 = 10 + 20.5 + 30 = 60.5, the stored value (scripts/lib/fixture-specs.ts).
    expect(c2).toMatchObject({ address: "C2", status: "matched", cached: { t: "num", v: 60.5 }, recalculated: { t: "num", v: 60.5 }, formula: "A1+B1+C1", lotusFormula: "A1+B1+C1" });
    // D2 = +B:B1 reads sheet B, which this program does not follow.
    expect(d2).toMatchObject({ address: "D2", status: "unverifiable", cached: { t: "num", v: 1 }, recalculated: null, formula: null, lotusFormula: null });
    expect(d2!.reason.code).toBe("wk3-formula-not-decoded");
    expect(d2!.reason.message).toContain("sheet B");
    // E2 uses opcode 0x63 (@COLS), which no table here holds.
    expect(e2).toMatchObject({ address: "E2", status: "unverifiable", reason: { code: "unknown-opcode" } });
    expect(verifications[2]!.totals).toMatchObject({ formulas: 3, matched: 1, mismatched: 0, unverifiable: 2, byReason: { exact: 1, "wk3-formula-not-decoded": 1, "unknown-opcode": 1 } });
  });

  it("matches a stored sum and flags a wrong one, over generated sheets", () => {
    const value = fc.integer({ min: -1000, max: 1000 });
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 255 }), value, value, fc.integer({ min: 1, max: 9 }), (sheet, a, b, off) => {
        // A1 = a, B1 = b, C1 = A1+B1 stored right, D1 = A1+B1 stored off by `off`.
        const sum = [0x01, 0x07, 0, 0, sheet, 0, 0x01, 0x07, 0, 0, sheet, 1, 0x0f, 0x03];
        const { workbook } = parseWorkbook(writeWk3([number80(sheet, 0, 0, a), number80(sheet, 1, 0, b), formula80(sheet, 2, 0, a + b, sum), formula80(sheet, 3, 0, a + b + off, sum)]));
        const [v] = verifyWorkbook(workbook, "g.wk3");
        expect(v!.cells.map((c) => c.status)).toEqual(["matched", "mismatched"]);
      }),
      { numRuns: 100 },
    );
  });

  it("gives every generated WK3 formula a known reason and never throws", () => {
    const spec = fc.record({ sheet: fc.integer({ min: 0, max: 5 }), col: fc.integer({ min: 0, max: 20 }), row: fc.integer({ min: 0, max: 50 }), cached: fc.double(), rpn: fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 12 }) });
    fc.assert(
      fc.property(fc.array(spec, { maxLength: 20 }), (specs) => {
        const { workbook } = parseWorkbook(writeWk3(specs.map((s) => formula80(s.sheet, s.col, s.row, s.cached, s.rpn))));
        for (const v of verifyWorkbook(workbook, "g.wk3")) for (const c of v.cells) expect(REASON_CODES).toContain(c.reason.code);
      }),
      { numRuns: 200 },
    );
  });

  it("passes WK3 sheets to the classifier with their sheet byte", () => {
    const { workbook } = parseWorkbook(read(WK3));
    const seen: (number | undefined)[] = [];
    verifyWorkbook(workbook, "x", { classify: (sheet) => (seen.push(sheet.sheetIndex), []) });
    expect(seen).toEqual([0, 1, 2]);
  });
});

describe("verifyWorkbook for dbf", () => {
  for (const path of [DBF, LAND]) {
    it(`${path} gives no results and 0 formulas`, () => {
      const { verifications } = verifyWorkbookBytes(read(path), "t.dbf");
      expect(verifications).toHaveLength(1);
      expect(verifications[0]!.format).toBe("dbf");
      expect(verifications[0]!.cells).toEqual([]);
      expect(verifications[0]!.totals.formulas).toBe(0);
    });
  }
});

describe("the new reason code", () => {
  it("is in REASON_CODES and the report lists it as an unsupported feature", () => {
    expect(REASON_CODES).toContain("wk3-formula-not-decoded");
    const { verifications } = verifyWorkbookBytes(read(WK3), "w.wk3");
    const rows = verifications[2]!.cells.map((c) => ({ ...c, excelFormula: c.formula }));
    expect(unsupportedFeatures(rows as never)).toContainEqual({ code: "wk3-formula-not-decoded", rule: null, name: null, count: 1, addresses: ["D2"] });
  });
});

// ai-boundaries.md: no value of the workbook changes as a result of anything the verification or the writer does.
describe("verification and writing leave every value as read", () => {
  for (const path of [MIXED, WK3, DBF, LAND]) {
    it(path, async () => {
      const { workbook } = parseWorkbook(read(path));
      const before = structuredClone(workbook);
      const verifications = verifyWorkbook(workbook, "x");
      expect(workbook).toEqual(before);
      await writeXlsx({ sheet: workbook.sheets[0]!.sheet, verification: verifications[0]! });
      expect(workbook).toEqual(before);
    });
  }
});
