import { describe, expect, it } from "vitest";
import { bof, dimensions, eof } from "../../../scripts/lib/wk1-writer.ts";
import { parseWk1 } from "../../../src/parser/wk1.ts";
import { concat, rawRecord } from "../helpers/bytes.ts";

describe("parseWk1 DIMENSIONS", () => {
  it("stores the declared range", () => {
    const { sheet, diagnostics } = parseWk1(concat(bof(0x0406), dimensions(1, 2, 255, 8191), eof()));
    expect(sheet.declaredDimensions).toEqual({ firstCol: 1, firstRow: 2, lastCol: 255, lastRow: 8191 });
    expect(diagnostics).toEqual([]);
  });

  it("reads each word as unsigned", () => {
    const { sheet } = parseWk1(concat(bof(0x0406), dimensions(0, 0, 0xffff, 0x8000), eof()));
    expect(sheet.declaredDimensions).toEqual({ firstCol: 0, firstRow: 0, lastCol: 65535, lastRow: 32768 });
  });

  it("reports a 7-byte body as short-record and keeps going", () => {
    const { sheet, diagnostics } = parseWk1(concat(bof(0x0406), rawRecord(0x0006, [0, 0, 0, 0, 1, 0, 1]), eof()));
    expect(sheet.declaredDimensions).toBeNull();
    expect(sheet.sawEof).toBe(true);
    expect(diagnostics).toEqual([expect.objectContaining({ severity: "error", code: "short-record", offset: 6, opcode: 0x0006 })]);
  });
});
