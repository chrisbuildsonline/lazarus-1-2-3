import { describe, expect, it } from "vitest";
import { bof, eof, integer } from "../../../scripts/lib/wk1-writer.ts";
import { getCell } from "../../../src/parser/sheet.ts";
import { parseWk1 } from "../../../src/parser/wk1.ts";
import { concat, rawRecord } from "../helpers/bytes.ts";

describe("parseWk1 INTEGER", () => {
  for (const value of [0, 1, -1, 32767, -32768]) {
    it(`reads ${value}`, () => {
      const { sheet, diagnostics, stats } = parseWk1(concat(bof(0x0406), integer(27, 9, value), eof()));
      expect(getCell(sheet, 27, 9)).toEqual({ kind: "integer", col: 27, row: 9, value });
      expect(sheet.cells.size).toBe(1);
      expect(diagnostics).toEqual([]);
      expect(stats).toMatchObject({ cells: 1, numbers: 1, formulas: 0, labels: 0 });
    });
  }

  it("ignores bytes after the value", () => {
    const { sheet, diagnostics } = parseWk1(concat(bof(0x0406), rawRecord(0x000d, [0xff, 1, 0, 2, 0, 5, 0, 9, 9]), eof()));
    expect(getCell(sheet, 1, 2)).toEqual({ kind: "integer", col: 1, row: 2, value: 5 });
    expect(diagnostics).toEqual([]);
  });

  it("reports a 6-byte body as short-record, adds no cell and keeps going", () => {
    const bytes = concat(bof(0x0406), rawRecord(0x000d, [0xff, 0, 0, 0, 0, 5]), integer(1, 0, 7), eof());
    const { sheet, diagnostics, stats } = parseWk1(bytes);
    expect(diagnostics).toEqual([expect.objectContaining({ severity: "error", code: "short-record", offset: 6, opcode: 0x000d })]);
    expect(getCell(sheet, 0, 0)).toBeUndefined();
    expect(getCell(sheet, 1, 0)).toMatchObject({ value: 7 });
    expect(stats).toMatchObject({ records: 4, cells: 1, numbers: 1 });
  });
});
