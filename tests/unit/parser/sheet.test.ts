import { describe, expect, it } from "vitest";
import { cellKey, cellsInRowMajorOrder, getCell, type Cell, type NamedSheet, type Sheet, type SheetFormat, type Workbook } from "../../../src/parser/sheet.ts";
import type { Wk1Format } from "../../../src/parser/index.ts";

function sheetWith(cells: Cell[]): Sheet {
  return {
    format: "wk1",
    version: 0x0406,
    sawEof: true,
    declaredDimensions: null,
    cells: new Map(cells.map((c) => [cellKey(c.col, c.row), c])),
  };
}

describe("cellKey", () => {
  it("is unique at the four u16 corners", () => {
    const keys = [cellKey(0, 0), cellKey(65535, 0), cellKey(0, 65535), cellKey(65535, 65535)];
    expect(new Set(keys).size).toBe(4);
    for (const k of keys) expect(Number.isSafeInteger(k)).toBe(true);
  });

  it("does not collide between neighbouring rows and columns", () => {
    expect(cellKey(65535, 0)).not.toBe(cellKey(0, 1));
    expect(cellKey(1, 0)).not.toBe(cellKey(0, 1));
  });
});

describe("getCell", () => {
  const cell: Cell = { kind: "integer", col: 3, row: 7, value: 42 };
  const sheet = sheetWith([cell]);

  it("finds a stored cell", () => {
    expect(getCell(sheet, 3, 7)).toBe(cell);
  });

  it("returns undefined for an empty address", () => {
    expect(getCell(sheet, 7, 3)).toBeUndefined();
    expect(getCell(sheet, 0, 0)).toBeUndefined();
  });
});

describe("cellsInRowMajorOrder", () => {
  it("sorts by row then column, whatever the insertion order", () => {
    const at = (col: number, row: number): Cell => ({ kind: "number", col, row, value: col * 100 + row });
    const sheet = sheetWith([at(2, 1), at(0, 2), at(65535, 0), at(1, 1), at(0, 0), at(0, 65535)]);
    expect(cellsInRowMajorOrder(sheet).map((c) => [c.col, c.row])).toEqual([
      [0, 0],
      [65535, 0],
      [1, 1],
      [2, 1],
      [0, 2],
      [0, 65535],
    ]);
  });

  it("returns an empty list for an empty sheet", () => {
    expect(cellsInRowMajorOrder(sheetWith([]))).toEqual([]);
  });
});

describe("workbook model types", () => {
  it("SheetFormat covers four formats and unknown; Wk1Format is the same type", () => {
    const formats: SheetFormat[] = ["wk1", "wks", "wk3", "dbf", "unknown"];
    const alias: Wk1Format[] = formats;
    expect(alias).toHaveLength(5);
  });

  it("a Workbook holds named sheets, and a WK3 or DBF sheet uses the same Sheet shape", () => {
    const sheet: Sheet = { ...sheetWith([]), format: "dbf" };
    const named: NamedSheet = { name: "Table", sheet };
    const wb: Workbook = { format: "dbf", sheets: [named] };
    expect(wb.sheets[0]!.name).toBe("Table");
  });
});
