import { describe, expect, it } from "vitest";
import { detectMacros } from "../../../src/macro/detect.ts";
import type { NamedRange } from "../../../src/macro/names.ts";
import { cellKey, type Cell, type Sheet } from "../../../src/parser/sheet.ts";

const sheetOf = (cells: Cell[]): Sheet => ({ format: "wk1", version: 0x0406, sawEof: true, declaredDimensions: null, cells: new Map(cells.map((c) => [cellKey(c.col, c.row), c])) });
const lab = (col: number, row: number, text: string): Cell => ({ kind: "label", col, row, prefix: "'", text });
const range = (name: string, col: number, row: number): NamedRange => ({ name, startCol: col, startRow: row, endCol: col, endRow: row });

describe("detectMacros", () => {
  it("reads a named macro down its column until a cell that is not a label", () => {
    const sheet = sheetOf([lab(5, 0, "/PPR"), lab(5, 1, "A1..D8~GQ"), { kind: "number", col: 5, row: 2, value: 3 }, lab(5, 3, "{QUIT}")]);
    const { macros, notes } = detectMacros(sheet, [range("\\P", 5, 0)], "Sheet1");
    expect(notes).toEqual([]);
    expect(macros).toEqual([
      { id: "macro:Sheet1!F1", name: "\\P", sheet: "Sheet1", start: "F1", lines: ["/PPR", "A1..D8~GQ"], source: "named" },
      { id: "macro:Sheet1!F4", name: null, sheet: "Sheet1", start: "F4", lines: ["{QUIT}"], source: "unnamed" },
    ]);
  });
  it("orders named macros \\0 first, then \\A to \\Z, and ignores other names", () => {
    const sheet = sheetOf([lab(0, 0, "x"), lab(1, 0, "y"), lab(2, 0, "z")]);
    const names = [range("\\Z", 0, 0), range("REVENUES", 1, 0), range("\\0", 1, 0), range("\\b", 2, 0)];
    expect(detectMacros(sheet, names, "S").macros.map((m) => m.name)).toEqual(["\\0", "\\B", "\\Z"]);
  });
  it("starts at the top-left corner of a range given in reverse", () => {
    const sheet = sheetOf([lab(1, 1, "{CALC}")]);
    expect(detectMacros(sheet, [{ name: "\\C", startCol: 3, startRow: 4, endCol: 1, endRow: 1 }], "S").macros[0]!.start).toBe("B2");
  });
  it("notes a named macro whose first cell holds no text", () => {
    const { macros, notes } = detectMacros(sheetOf([lab(0, 0, "")]), [range("\\A", 0, 0)], "S");
    expect(macros).toEqual([]);
    expect(notes).toEqual(["\\A starts at A1, which holds no text."]);
  });
  it("finds an unnamed block only when its first line starts with / or {", () => {
    const sheet = sheetOf([lab(0, 0, "Income"), lab(0, 1, "/WEY"), lab(0, 3, "{GOTO}B2~"), lab(0, 4, "Total~"), lab(1, 0, "{x")]);
    const found = detectMacros(sheet, [], "S").macros.map((m) => [m.start, m.lines]);
    // Columns in ascending order; A1 and A2 are one run that starts with "Income", so no block.
    expect(found).toEqual([
      ["A4", ["{GOTO}B2~", "Total~"]],
      ["B1", ["{x"]],
    ]);
  });
  it("does not report the cells of a named macro again as a block", () => {
    const sheet = sheetOf([lab(0, 0, "{GOTO}A1~"), lab(0, 1, "/RE~")]);
    expect(detectMacros(sheet, [range("\\G", 0, 0)], "S").macros).toHaveLength(1);
  });
  it("finds nothing on a sheet of numbers", () => {
    expect(detectMacros(sheetOf([{ kind: "integer", col: 0, row: 0, value: 1 }]), [], "S")).toEqual({ macros: [], notes: [] });
  });
});
