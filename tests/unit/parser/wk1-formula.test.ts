import { describe, expect, it } from "vitest";
import { bof, eof, formula } from "../../../scripts/lib/wk1-writer.ts";
import { getCell } from "../../../src/parser/sheet.ts";
import { parseWk1 } from "../../../src/parser/wk1.ts";
import { concat, rawRecord } from "../helpers/bytes.ts";

const parse = (record: Uint8Array) => parseWk1(concat(bof(0x0406), record, eof()));

/** FORMULA A1 body: format, col 0, row 0, cached 1.5, then the given length word and bytes. */
const rawFormula = (rpnLen: number, rest: readonly number[]) =>
  rawRecord(0x0010, [0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xf8, 0x3f, rpnLen & 0xff, rpnLen >> 8, ...rest]);

describe("parseWk1 FORMULA", () => {
  it("reads the cached double and RPN bytes exactly", () => {
    const rpn = [0x01, 0x00, 0x80, 0x00, 0x80, 0x03];
    const { sheet, diagnostics, stats } = parse(formula(14, 2, 0.25153768659966846, rpn));
    const cell = getCell(sheet, 14, 2);
    expect(cell).toEqual({ kind: "formula", col: 14, row: 2, cached: 0.25153768659966846, rpn: Uint8Array.from(rpn) });
    expect(diagnostics).toEqual([]);
    expect(stats).toMatchObject({ cells: 1, formulas: 1, numbers: 0, labels: 0 });
  });

  it("keeps a -0 cached value as -0", () => {
    const cell = getCell(parse(formula(0, 0, -0, [0x03])).sheet, 0, 0);
    expect(cell?.kind === "formula" && Object.is(cell.cached, -0)).toBe(true);
  });

  it("returns RPN bytes that are a copy of the input", () => {
    const bytes = concat(bof(0x0406), formula(0, 0, 7, [0x05, 0x06, 0x07]), eof());
    const cell = getCell(parseWk1(bytes).sheet, 0, 0);
    const rpn = cell?.kind === "formula" ? cell.rpn : new Uint8Array(0);
    expect(rpn.buffer).not.toBe(bytes.buffer);
    bytes.fill(0);
    expect(rpn).toEqual(Uint8Array.from([0x05, 0x06, 0x07]));
  });

  it("accepts an RPN length of 0", () => {
    const { sheet, diagnostics } = parse(rawFormula(0, []));
    expect(getCell(sheet, 0, 0)).toEqual({ kind: "formula", col: 0, row: 0, cached: 1.5, rpn: new Uint8Array(0) });
    expect(diagnostics).toEqual([]);
  });

  it("takes exactly rpnLen bytes when the body is longer", () => {
    const cell = getCell(parse(rawFormula(2, [0x0a, 0x0b, 0x0c, 0x0d])).sheet, 0, 0);
    expect(cell).toMatchObject({ rpn: Uint8Array.from([0x0a, 0x0b]) });
  });

  it("does not decode or check the RPN bytes", () => {
    const rpn = Array.from({ length: 256 }, (_, i) => 255 - i);
    const { sheet, diagnostics } = parse(formula(0, 0, 1, rpn));
    expect(getCell(sheet, 0, 0)).toMatchObject({ rpn: Uint8Array.from(rpn) });
    expect(diagnostics).toEqual([]);
  });

  it("reports an RPN length past the body as short-record and adds no cell", () => {
    const { sheet, diagnostics, stats } = parse(rawFormula(4, [0x01, 0x02, 0x03]));
    expect(diagnostics).toEqual([expect.objectContaining({ severity: "error", code: "short-record", offset: 6, opcode: 0x0010 })]);
    expect(sheet.cells.size).toBe(0);
    expect(stats).toMatchObject({ cells: 0, formulas: 0 });
    expect(sheet.sawEof).toBe(true);
  });

  it("reports a 14-byte body as short-record", () => {
    const { diagnostics, sheet } = parse(rawRecord(0x0010, [0xff, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0xf8, 0x3f, 0]));
    expect(diagnostics).toEqual([expect.objectContaining({ code: "short-record", opcode: 0x0010 })]);
    expect(sheet.cells.size).toBe(0);
  });
});
