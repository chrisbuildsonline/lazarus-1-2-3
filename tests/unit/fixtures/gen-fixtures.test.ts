import { describe, expect, it } from "vitest";
import { bof, dimensions, eof, formula, integer, label, number, writeWk1 } from "../../../scripts/lib/wk1-writer.ts";
import { scanWk1 } from "../helpers/wk1-scan.ts";

const bytes = (u: Uint8Array) => [...u];

describe("wk1 writer records", () => {
  it("writes BOF with the given version, little-endian", () => {
    expect(bytes(bof(0x0406))).toEqual([0x00, 0x00, 0x02, 0x00, 0x06, 0x04]);
    expect(bytes(bof(0x0404))).toEqual([0x00, 0x00, 0x02, 0x00, 0x04, 0x04]);
  });

  it("writes an empty EOF", () => {
    expect(bytes(eof())).toEqual([0x01, 0x00, 0x00, 0x00]);
  });

  it("writes DIMENSIONS as first col, first row, last col, last row", () => {
    expect(bytes(dimensions(0, 0, 2, 0x0109))).toEqual([0x06, 0x00, 0x08, 0x00, 0x00, 0x00, 0x00, 0x00, 0x02, 0x00, 0x09, 0x01]);
  });

  it("writes INTEGER as format, col, row, int16", () => {
    expect(bytes(integer(1, 0x0102, -2))).toEqual([0x0d, 0x00, 0x07, 0x00, 0xff, 0x01, 0x00, 0x02, 0x01, 0xfe, 0xff]);
  });

  it("rejects INTEGER values outside int16", () => {
    expect(() => integer(0, 0, 32768)).toThrow();
    expect(() => integer(0, 0, 1.5)).toThrow();
  });

  it("writes NUMBER as format, col, row, double", () => {
    expect(bytes(number(0, 0, 1.5))).toEqual([
      0x0e, 0x00, 0x0d, 0x00, 0xff, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8, 0x3f,
    ]);
  });

  it.each(["'", '"', "^"] as const)("writes LABEL with prefix %s, text and NUL", (prefix) => {
    expect(bytes(label(0, 1, prefix, "Hi"))).toEqual([
      0x0f, 0x00, 0x09, 0x00, 0xff, 0x00, 0x00, 0x01, 0x00, prefix.charCodeAt(0), 0x48, 0x69, 0x00,
    ]);
  });

  it("rejects non-ASCII label text", () => {
    expect(() => label(0, 0, "'", "café")).toThrow();
  });

  it("writes FORMULA as format, col, row, cached double, RPN length, RPN", () => {
    expect(bytes(formula(1, 1, 43, [0x03]))).toEqual([
      0x10, 0x00, 0x10, 0x00, 0xff, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x45, 0x40, 0x01, 0x00, 0x03,
    ]);
  });
});

describe("writeWk1", () => {
  const file = writeWk1(0x0406, [
    { kind: "formula", col: 1, row: 1, cached: 3, rpn: [0x03] },
    { kind: "label", col: 0, row: 1, prefix: "^", text: "x" },
    { kind: "number", col: 2, row: 0, value: 0.25 },
    { kind: "integer", col: 0, row: 0, value: 7 },
  ]);

  it("starts with BOF, then DIMENSIONS of the used range, and ends with EOF", () => {
    expect(bytes(file.subarray(0, 6))).toEqual(bytes(bof(0x0406)));
    expect(bytes(file.subarray(6, 18))).toEqual(bytes(dimensions(0, 0, 2, 1)));
    expect(bytes(file.subarray(-4))).toEqual(bytes(eof()));
  });

  it("writes cells in row-major order", () => {
    const scan = scanWk1(file);
    expect(scan.eof).toBe(true);
    expect(scan.truncated).toBe(false);
    expect(scan.cells.map((c) => c.cell)).toEqual(["A1", "C1", "A2", "B2"]);
    expect(scan.counts).toEqual({ cells: 4, formulas: 1, labels: 1, numbers: 2 });
  });
});
