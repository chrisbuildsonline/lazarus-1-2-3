import { describe, expect, it } from "vitest";
import { label, sheetName, small, smallInt, writeWk3 } from "../../../scripts/lib/wk3-writer.ts";
import { parseWk3 } from "../../../src/parser/wk3.ts";
import { getCell } from "../../../src/parser/sheet.ts";

describe("parseWk3 sheets", () => {
  it("splits interleaved records by sheet index and emits sheets in ascending order", () => {
    const r = parseWk3(writeWk3([small(1, 0, 0, smallInt(10)), small(0, 0, 0, smallInt(1)), small(1, 1, 0, smallInt(11)), small(0, 1, 0, smallInt(2))]));
    expect(r.workbook.format).toBe("wk3");
    expect(r.workbook.sheets.map((s) => s.name)).toEqual(["A", "B"]);
    const [a, b] = r.workbook.sheets.map((s) => s.sheet);
    expect(getCell(a!, 1, 0)).toMatchObject({ value: 2 });
    expect(getCell(b!, 0, 0)).toMatchObject({ value: 10 });
    expect(a!.cells.size + b!.cells.size).toBe(4);
    expect(a!).toMatchObject({ format: "wk3", version: 0x1000, sawEof: true, declaredDimensions: null });
    expect(r.stats.sheets).toBe(2);
  });

  it("names sheets A, Z, AA and IV from their index, and only creates used sheets", () => {
    const r = parseWk3(writeWk3([0, 25, 26, 255].map((s) => label(s, 0, 0, "'", "x"))));
    expect(r.workbook.sheets.map((s) => s.name)).toEqual(["A", "Z", "AA", "IV"]);
  });

  it("uses a sheet name record, which also creates the sheet", () => {
    const r = parseWk3(writeWk3([sheetName(2, "Totals"), small(0, 0, 0, smallInt(1))]));
    expect(r.workbook.sheets.map((s) => s.name)).toEqual(["A", "Totals"]);
    expect(r.workbook.sheets[1]!.sheet.cells.size).toBe(0);
  });

  it("gives a duplicate name a numeric suffix and a duplicate-sheet-name warning", () => {
    const r = parseWk3(writeWk3([sheetName(0, "Sales"), sheetName(1, "Sales"), sheetName(2, "Sales")]));
    expect(r.workbook.sheets.map((s) => s.name)).toEqual(["Sales", "Sales 2", "Sales 3"]);
    expect(r.diagnostics.filter((d) => d.code === "duplicate-sheet-name")).toHaveLength(2);
  });
});
