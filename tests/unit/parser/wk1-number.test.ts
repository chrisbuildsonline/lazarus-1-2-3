import { describe, expect, it } from "vitest";
import { bof, eof, integer, number } from "../../../scripts/lib/wk1-writer.ts";
import { getCell } from "../../../src/parser/sheet.ts";
import { parseWk1 } from "../../../src/parser/wk1.ts";
import { concat, rawRecord } from "../helpers/bytes.ts";

function bits(x: number): string {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, x, true);
  return view.getBigUint64(0, true).toString(16);
}

describe("parseWk1 NUMBER", () => {
  for (const value of [0, -0, -2.5, 0.1, Number.MAX_VALUE, Number.MIN_VALUE, 3515350]) {
    it(`reads ${Object.is(value, -0) ? "-0" : value} with the exact bits`, () => {
      const { sheet, diagnostics, stats } = parseWk1(concat(bof(0x0406), number(30, 900, value), eof()));
      const cell = getCell(sheet, 30, 900);
      expect(cell?.kind).toBe("number");
      const read = cell?.kind === "number" ? cell.value : NaN;
      expect(Object.is(read, value)).toBe(true);
      expect(bits(read)).toBe(bits(value));
      expect(stats).toMatchObject({ cells: 1, numbers: 1, formulas: 0, labels: 0 });
      expect(diagnostics).toEqual([]);
    });
  }

  it("counts INTEGER and NUMBER together as numbers", () => {
    const { stats } = parseWk1(concat(bof(0x0406), integer(0, 0, 1), number(1, 0, 1.5), eof()));
    expect(stats).toMatchObject({ cells: 2, numbers: 2 });
  });

  it("reports a 12-byte body as short-record, adds no cell and keeps going", () => {
    const bytes = concat(bof(0x0406), rawRecord(0x000e, [0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xf8, 0x3f]), number(1, 0, 2), eof());
    const { sheet, diagnostics, stats } = parseWk1(bytes);
    expect(diagnostics).toEqual([expect.objectContaining({ severity: "error", code: "short-record", offset: 6, opcode: 0x000e })]);
    expect(getCell(sheet, 0, 0)).toBeUndefined();
    expect(getCell(sheet, 1, 0)).toEqual({ kind: "number", col: 1, row: 0, value: 2 });
    expect(stats).toMatchObject({ cells: 1, numbers: 1 });
  });
});
