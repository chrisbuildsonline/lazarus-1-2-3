import { describe, expect, it } from "vitest";
import { formula80, label, number80, raw80, small, smallInt, writeWk3 } from "../../../scripts/lib/wk3-writer.ts";
import { parseWk3 } from "../../../src/parser/wk3.ts";
import { getCell } from "../../../src/parser/sheet.ts";

const first = (bytes: Uint8Array) => {
  const r = parseWk3(bytes);
  return { r, sheet: r.workbook.sheets[0]!.sheet };
};

describe("parseWk3 cells", () => {
  it("reads labels with their prefix and Latin-1 text, warning on an unknown prefix", () => {
    const { r, sheet } = first(writeWk3([label(0, 0, 0, "'", "Left"), label(0, 1, 0, '"', "Café"), label(0, 2, 0, "^", ""), label(0, 3, 0, "x", "odd")]));
    expect(getCell(sheet, 0, 0)).toEqual({ kind: "label", col: 0, row: 0, prefix: "'", text: "Left" });
    expect(getCell(sheet, 1, 0)).toMatchObject({ prefix: '"', text: "Café" });
    expect(getCell(sheet, 2, 0)).toMatchObject({ prefix: "^", text: "" });
    expect(r.diagnostics.map((d) => d.code)).toContain("unknown-label-prefix");
    expect(r.stats).toMatchObject({ cells: 4, labels: 4, numbers: 0, formulas: 0 });
  });

  it("reads small numbers: even words as integers, odd words scaled (hand values)", () => {
    // 0x0007: bit 0 set, factor index 3 (/200), mantissa 0 -> 0; 0x0031: index 0 (x5000), mantissa 3 -> 15000;
    // 0x0035: index 2 (/20), mantissa 3 -> 3/20 = 0.15; 0x001D: index 6 (/16), mantissa 1 -> 0.0625; 0xFFF5: index 2, mantissa -1 -> -0.05
    const words = [smallInt(0), smallInt(1), smallInt(-1), smallInt(16383), smallInt(-16384), 0x0031, 0x0035, 0x001d, 0xfff5];
    const { sheet } = first(writeWk3(words.map((w, i) => small(0, i, 0, w))));
    const got = words.map((_, i) => getCell(sheet, i, 0));
    expect(got.slice(0, 5)).toEqual([0, 1, -1, 16383, -16384].map((value, col) => ({ kind: "integer", col, row: 0, value })));
    expect(got.slice(5).map((c) => c && c.kind === "number" && c.value)).toEqual([15000, 0.15, 0.0625, -0.05]);
  });

  it("reads doubles exactly and rounds a 64-bit significand with one value-rounded info per file", () => {
    const tie = raw80((1n << 63n) | (1n << 10n), 16383); // 1 + 2^-53, rounds to even: 1
    const up = raw80((1n << 63n) | (3n << 10n), 16383); // rounds up to 1 + 2^-51
    const { r, sheet } = first(writeWk3([number80(0, 0, 0, 0.1), number80(0, 1, 0, -2.5), number80(0, 0, 1, tie), number80(0, 1, 1, up)]));
    expect(getCell(sheet, 0, 0)).toEqual({ kind: "number", col: 0, row: 0, value: 0.1 });
    expect(getCell(sheet, 1, 0)).toMatchObject({ value: -2.5 });
    expect(getCell(sheet, 0, 1)).toMatchObject({ value: 1 });
    expect(getCell(sheet, 1, 1)).toMatchObject({ value: 1 + 2 ** -51 });
    const rounded = r.diagnostics.filter((d) => d.code === "value-rounded");
    expect(rounded).toHaveLength(1);
    expect(rounded[0]!.severity).toBe("info");
    expect(rounded[0]!.message).toContain("A!A2");
    expect(r.stats.roundedNumbers).toBe(2);
  });

  it("reads a formula with the exact cached value and a copy of the RPN bytes, not decoded", () => {
    const bytes = writeWk3([formula80(0, 2, 1, 42.125, [0x01, 0x02, 0x03])]);
    const { r, sheet } = first(bytes);
    const cell = getCell(sheet, 2, 1)!;
    expect(cell).toMatchObject({ kind: "formula", col: 2, row: 1, cached: 42.125 });
    expect(cell.kind === "formula" && [...cell.rpn]).toEqual([1, 2, 3]);
    expect(cell.kind === "formula" && cell.rpn.buffer).not.toBe(bytes.buffer);
    expect(r.stats.formulas).toBe(1);
  });

  it("keeps the later of two cells at one address with duplicate-cell, and warns on a row past 8191", () => {
    const { r, sheet } = first(writeWk3([small(0, 0, 0, smallInt(1)), small(0, 0, 0, smallInt(2)), small(0, 0, 9000, smallInt(3))]));
    expect(getCell(sheet, 0, 0)).toMatchObject({ value: 2 });
    expect(getCell(sheet, 0, 9000)).toMatchObject({ value: 3 });
    expect(r.diagnostics.map((d) => d.code)).toEqual(expect.arrayContaining(["duplicate-cell", "address-out-of-range"]));
  });
});
