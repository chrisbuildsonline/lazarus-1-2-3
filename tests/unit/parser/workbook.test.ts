import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { writeWk1 } from "../../../scripts/lib/wk1-writer.ts";
import { sheetName, small, smallInt, writeWk3 } from "../../../scripts/lib/wk3-writer.ts";
import { parseDbf, parseWk1, parseWk3, parseWorkbook } from "../../../src/parser/index.ts";
import { SAMPLE_DBF } from "../helpers/dbf-sample.ts";

const KSBASE = new Uint8Array(readFileSync("fixtures/ksbase/KSBASE.WK1"));
const PEYTREND = new Uint8Array(readFileSync("fixtures/format-corpus-peytrend/PEYTREND.WK3"));

describe("parseWorkbook", () => {
  it("runs WK1 and WKS through parseWk1 as one sheet Sheet1 with the same sheet, diagnostics and stats", () => {
    for (const bytes of [KSBASE, writeWk1(0x0404, [{ kind: "integer", col: 0, row: 0, value: 1 }])]) {
      const w = parseWorkbook(bytes);
      const old = parseWk1(bytes);
      expect(w.kind).toBe("wk1");
      expect(w.workbook.sheets.map((s) => s.name)).toEqual(["Sheet1"]);
      expect(w.workbook.sheets[0]!.sheet).toEqual(old.sheet);
      expect(w.workbook.format).toBe(old.sheet.format);
      expect(w.diagnostics).toEqual(old.diagnostics);
      expect(w.stats).toEqual(old.stats);
    }
  });

  it("gives format unknown for noise, empty and a BOF with version 0x1234, as parseWk1 does", () => {
    const bof1234 = new Uint8Array([0, 0, 2, 0, 0x34, 0x12]);
    for (const bytes of [new TextEncoder().encode("hello"), new Uint8Array(0), bof1234]) {
      const w = parseWorkbook(bytes);
      expect(w.workbook.format).toBe("unknown");
      expect(w.diagnostics).toEqual(parseWk1(bytes).diagnostics);
      expect(w.workbook.sheets).toHaveLength(1);
    }
  });

  it("runs a DBF through parseDbf as one sheet Table with its table", () => {
    const w = parseWorkbook(SAMPLE_DBF);
    expect(w.kind).toBe("dbf");
    expect(w).toEqual({ kind: "dbf", ...parseDbf(SAMPLE_DBF) });
    expect(w.workbook.sheets.map((s) => s.name)).toEqual(["Table"]);
  });

  it("runs a WK3 through parseWk3 with unique sheet names", () => {
    const bytes = writeWk3([sheetName(0, "X"), sheetName(1, "X"), small(2, 0, 0, smallInt(1))]);
    const w = parseWorkbook(bytes);
    expect(w).toEqual({ kind: "wk3", ...parseWk3(bytes) });
    expect(w.workbook.sheets.map((s) => s.name)).toEqual(["X", "X 2", "C"]);
  });

  it("detects the real PEYTREND.WK3 as wk3 and reads it with no error", () => {
    const w = parseWorkbook(PEYTREND);
    expect(w.kind).toBe("wk3");
    expect(w.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    // Counts from fixtures/manifest.json (independent walker tests/unit/helpers/wk3-scan.ts).
    expect(w.workbook.sheets.map((s) => s.name)).toEqual(["A"]);
    expect(w.stats).toMatchObject({ cells: 1034, formulas: 0, labels: 5, numbers: 1029 });
  });
});
