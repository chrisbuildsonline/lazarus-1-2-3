// writeXlsx and the exceljs adapter (requirements 1, 4, 18, 22, 23, 25).
import { describe, expect, it } from "vitest";
import { cellKey, type Cell, type Sheet } from "../../../src/parser/index.ts";
import { TOLERANCE, type CellResult, type SheetVerification } from "../../../src/verify/index.ts";
import { writeXlsx } from "../../../src/xlsx/index.ts";
import { readXlsx } from "../helpers/xlsx-readback.ts";

const sheetOf = (cells: Cell[]): Sheet => ({ format: "wk1", version: null, sawEof: true, declaredDimensions: null, cells: new Map(cells.map((c) => [cellKey(c.col, c.row), c])) });
const verificationOf = (cells: CellResult[]): SheetVerification => ({
  name: "",
  format: "wk1",
  tolerance: TOLERANCE,
  cells,
  totals: { formulas: cells.length, matched: cells.length, mismatched: 0, unverifiable: 0, exact: cells.length, withinTolerance: 0, byReason: {} },
});

const sum: CellResult = {
  address: "A3",
  col: 0,
  row: 2,
  status: "matched",
  cached: { t: "num", v: 0 },
  recalculated: { t: "num", v: 0 },
  reason: { code: "exact", message: "equal" },
  formula: "A1-A1",
  lotusFormula: "+A1-A1",
  candidateOpcodes: [],
};

describe("writeXlsx", () => {
  it("writes one sheet whose cells read back as planned", async () => {
    const sheet = sheetOf([
      { kind: "number", col: 0, row: 0, value: 3.5 },
      { kind: "label", col: 1, row: 0, prefix: '"', text: "right" },
      { kind: "formula", col: 0, row: 2, cached: 0, rpn: new Uint8Array([0x03]) },
      { kind: "number", col: 1, row: 2, value: Infinity },
      { kind: "number", col: 2, row: 2, value: Number.NaN },
    ]);
    const { bytes, notes } = await writeXlsx({ sheet, verification: verificationOf([sum]) });
    expect(notes.map((n) => [n.address, n.code])).toEqual([["B3", "non-finite-number"], ["C3", "non-finite-number"]]);
    const back = await readXlsx(bytes);
    expect(back.sheetNames).toEqual(["Sheet1"]);
    expect([...back.cells.keys()]).toEqual(["A1", "B1", "A3", "B3", "C3"]);
    expect(back.cells.get("A1")).toMatchObject({ value: 3.5, note: null, alignment: null });
    expect(back.cells.get("B1")).toMatchObject({ value: "right", alignment: "right" });
    expect(back.cells.get("A3")).toMatchObject({ formula: "A1-A1", result: 0, note: null });
    expect(back.cells.get("B3")).toMatchObject({ value: { error: "#VALUE!" }, note: "Lotus stored ERR here." });
    expect(back.cells.get("C3")).toMatchObject({ value: null, note: "Lotus stored a marker that is not a number." });
    for (const c of back.cells.values()) expect(c.numFmt === null || c.numFmt === "General", c.numFmt ?? "").toBe(true);
  });

  it("fixes the document properties and leaves calculate-on-load off", async () => {
    const back = await readXlsx((await writeXlsx({ sheet: sheetOf([]), verification: verificationOf([]) })).bytes);
    expect(back.creator).toBe("Lazarus 1-2-3");
    expect(back.lastModifiedBy).toBe("Lazarus 1-2-3");
    expect(back.created.toISOString()).toBe("1980-01-01T00:00:00.000Z");
    expect(back.modified.toISOString()).toBe("1980-01-01T00:00:00.000Z");
    expect(back.fullCalcOnLoad).toBeFalsy();
  });

  it("returns a plain Uint8Array that starts with PK, also for an empty sheet", async () => {
    const { bytes, notes } = await writeXlsx({ sheet: sheetOf([]), verification: verificationOf([]) });
    expect(Object.getPrototypeOf(bytes)).toBe(Uint8Array.prototype);
    expect([bytes[0], bytes[1]]).toEqual([0x50, 0x4b]);
    expect(notes).toEqual([]);
    expect((await readXlsx(bytes)).sheetNames).toEqual(["Sheet1"]);
  });
});
