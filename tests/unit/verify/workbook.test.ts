import fc from "fast-check";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formula80, writeWk3 } from "../../../scripts/lib/wk3-writer.ts";
import { parseWk1, parseWorkbook } from "../../../src/parser/index.ts";
import { unsupportedFeatures } from "../../../src/report/features.ts";
import { verifyBytes, verifySheet } from "../../../src/verify/index.ts";
import { REASON_CODES, wk3FormulaNotDecoded } from "../../../src/verify/value.ts";
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
  it("gives a formula cell unverifiable with wk3-formula-not-decoded and the stored cached value", () => {
    const { verifications } = verifyWorkbookBytes(read(WK3), "wk3-sheets.wk3");
    expect(verifications.map((v) => [v.format, v.cells.length])).toEqual([
      ["wk3", 0],
      ["wk3", 0],
      ["wk3", 1],
    ]);
    const c2 = verifications[2]!.cells[0]!;
    // Totals!C2 stores 60.5 (fixtures/manifest.json expectedValues).
    expect(c2).toMatchObject({ address: "C2", col: 2, row: 1, status: "unverifiable", cached: { t: "num", v: 60.5 }, recalculated: null, formula: null, lotusFormula: null, candidateOpcodes: [] });
    expect(c2.reason).toEqual(wk3FormulaNotDecoded());
    expect(c2.reason.message).toBe("Formulas in WK3 files are not read yet. The stored result is kept as the file remembers it.");
    expect(verifications[2]!.totals).toMatchObject({ formulas: 1, matched: 0, unverifiable: 1, byReason: { "wk3-formula-not-decoded": 1 } });
  });

  it("never gives a matched cell, over generated sheets", () => {
    const spec = fc.record({ sheet: fc.integer({ min: 0, max: 5 }), col: fc.integer({ min: 0, max: 20 }), row: fc.integer({ min: 0, max: 50 }), cached: fc.double(), rpn: fc.array(fc.integer({ min: 0, max: 255 }), { maxLength: 12 }) });
    fc.assert(
      fc.property(fc.array(spec, { maxLength: 20 }), (specs) => {
        const { workbook } = parseWorkbook(writeWk3(specs.map((s) => formula80(s.sheet, s.col, s.row, s.cached, s.rpn))));
        for (const v of verifyWorkbook(workbook, "g.wk3")) {
          expect(v.totals.matched).toBe(0);
          expect(v.totals.mismatched).toBe(0);
          for (const c of v.cells) expect(c.reason.code).toBe("wk3-formula-not-decoded");
        }
      }),
      { numRuns: 200 },
    );
  });

  it("does not call the WK1 classifier for WK3 sheets", () => {
    const { workbook } = parseWorkbook(read(WK3));
    const classify = () => {
      throw new Error("WK1 classifier called");
    };
    expect(() => verifyWorkbook(workbook, "x", { classify })).not.toThrow();
    const { workbook: wk1 } = parseWorkbook(read(MIXED));
    expect(() => verifyWorkbook(wk1, "x", { classify })).toThrow("WK1 classifier called");
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
    expect(unsupportedFeatures(rows as never)).toEqual([{ code: "wk3-formula-not-decoded", rule: null, name: null, count: 1, addresses: ["C2"] }]);
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
