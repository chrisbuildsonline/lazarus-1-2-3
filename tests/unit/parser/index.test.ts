import { describe, expect, it } from "vitest";
import { bof, eof, integer } from "../../../scripts/lib/wk1-writer.ts";
import * as parser from "../../../src/parser/index.ts";
import type { Cell, Diagnostic, LabelPrefix, Sheet, Wk1Format, Wk1ParseResult, Wk1Stats } from "../../../src/parser/index.ts";
import { concat } from "../helpers/bytes.ts";

describe("src/parser public exports", () => {
  it("exports the parser and helpers", () => {
    expect(Object.keys(parser).sort()).toEqual(
      ["ByteReader", "MAX_DIAGNOSTICS", "WK3_VERSIONS", "a1", "cellKey", "cellsInRowMajorOrder", "detectKind", "float80ToDouble", "getCell", "isDbfHeader", "parseA1", "parseDbf", "parseWk1", "parseWk3", "parseWorkbook", "unpackSmall"].sort(),
    );
  });

  it("exports the bounds-checked ByteReader for the formula decoder", () => {
    const reader = new parser.ByteReader(new Uint8Array([0x34, 0x12]));
    expect([reader.u16(), reader.u8()]).toEqual([0x1234, null]);
  });

  it("works end to end through the index", () => {
    const result: Wk1ParseResult = parser.parseWk1(concat(bof(0x0406), integer(0, 0, 1), eof()));
    const sheet: Sheet = result.sheet;
    const format: Wk1Format = sheet.format;
    const stats: Wk1Stats = result.stats;
    const diagnostics: Diagnostic[] = result.diagnostics;
    const cell: Cell | undefined = parser.getCell(sheet, 0, 0);
    const prefix: LabelPrefix = "'";
    expect([format, stats.cells, diagnostics.length, cell?.kind, prefix]).toEqual(["wk1", 1, 0, "integer", "'"]);
    expect(parser.cellsInRowMajorOrder(sheet).map((c) => parser.a1(c.col, c.row))).toEqual(["A1"]);
    expect(parser.parseA1("A1")).toEqual({ col: 0, row: 0 });
    expect(parser.cellKey(0, 0)).toBe(0);
  });
});
