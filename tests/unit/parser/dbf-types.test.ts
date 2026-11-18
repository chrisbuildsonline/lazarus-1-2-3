import { describe, expect, it } from "vitest";
import { writeDbf } from "../../../scripts/lib/dbf-writer.ts";
import { parseDbf, type DbfParseResult } from "../../../src/parser/dbf.ts";
import { getCell } from "../../../src/parser/sheet.ts";

/** One field, one record per value; returns the parse result and the data cells in order. */
function column(type: string, length: number, values: string[]) {
  const r = parseDbf(writeDbf({ fields: [{ name: "F", type, length }], records: values.map((v) => ({ values: [v] })) }));
  const cells = values.map((_, i) => getCell(r.workbook.sheets[0]!.sheet, 0, i + 1));
  return { r, cells };
}
const count = (r: DbfParseResult, code: string) => r.diagnostics.filter((d) => d.code === code).length;

describe("parseDbf field types", () => {
  it("C keeps leading spaces, drops trailing spaces and NULs, keeps a high byte as Latin-1, blank gives empty text", () => {
    const { r, cells } = column("C", 8, ["  Café", "ab\u0000\u0000", ""]);
    expect(cells.map((c) => c && c.kind === "label" && c.text)).toEqual(["  Café", "ab", ""]);
    expect(cells.every((c) => c?.kind === "label" && c.prefix === "'")).toBe(true);
    expect(r.stats.labels).toBe(3);
  });

  it("N reads sign, point, exponent and padding with Number(text)", () => {
    const { cells } = column("N", 10, ["-12.50", "+3", ".5", "1.5e3", "  7  ", "0.10"]);
    // Hand values: Number("-12.50") etc.
    expect(cells.map((c) => c && c.kind === "number" && c.value)).toEqual([-12.5, 3, 0.5, 1500, 7, 0.1]);
  });

  it("N blank gives no cell and counts blankCells; F reads like N", () => {
    const { r, cells } = column("N", 4, ["", "5"]);
    expect(cells[0]).toBeUndefined();
    expect(r.stats.blankCells).toBe(1);
    expect(column("F", 6, ["2.25"]).cells[0]).toMatchObject({ kind: "number", value: 2.25 });
  });

  it("N with abc becomes a label as read with invalid-number, counted in otherTyped", () => {
    const { r, cells } = column("N", 5, [" abc "]);
    expect(cells[0]).toMatchObject({ kind: "label", prefix: "'", text: "abc" });
    expect(count(r, "invalid-number")).toBe(1);
    expect(r.diagnostics.find((d) => d.code === "invalid-number")!.severity).toBe("warning");
    expect(r.stats).toMatchObject({ otherTyped: 1, numbers: 0 });
  });

  it("D and L are labels as stored, blank gives no cell", () => {
    const d = column("D", 8, ["20261114", ""]);
    expect(d.cells[0]).toMatchObject({ kind: "label", text: "20261114" });
    expect(d.cells[1]).toBeUndefined();
    expect(d.r.stats).toMatchObject({ otherTyped: 1, blankCells: 1 });
    expect(column("L", 1, ["T"]).cells[0]).toMatchObject({ kind: "label", text: "T" });
  });

  it("M is the block number text with one memo-not-read warning per file", () => {
    const { r, cells } = column("M", 10, ["        12", "        13"]);
    expect(cells[0]).toMatchObject({ kind: "label", text: "12" });
    expect(count(r, "memo-not-read")).toBe(1);
    expect(r.stats.otherTyped).toBe(2);
  });

  it("type I gives no cells, one unsupported-field-type warning, and counts unreadableCells", () => {
    const { r, cells } = column("I", 4, ["abcd", "efgh"]);
    expect(cells).toEqual([undefined, undefined]);
    expect(count(r, "unsupported-field-type")).toBe(1);
    expect(r.stats).toMatchObject({ unreadableCells: 2, cells: 0 });
  });
});
