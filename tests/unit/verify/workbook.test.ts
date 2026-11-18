import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseWk1, parseWorkbook } from "../../../src/parser/index.ts";
import { verifyBytes, verifySheet } from "../../../src/verify/index.ts";
import { verifyWorkbook, verifyWorkbookBytes } from "../../../src/verify/workbook.ts";

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
