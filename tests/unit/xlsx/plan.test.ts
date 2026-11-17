// planWorkbook (requirements 7 to 22, 24). Hand-built sheets; expected values written here.
// Label prefixes in the fixtures, counted by parsing every wk1/wks fixture of the manifest
// (2026-11-17): ' 285, ^ 32, " 12. No real file uses \ or |, so the fill and non-printing
// mappings are checked against hand-built cells only.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Cell, Sheet } from "../../../src/parser/index.ts";
import { cellKey } from "../../../src/parser/index.ts";
import { TOLERANCE, type CellResult, type SheetVerification } from "../../../src/verify/index.ts";
import { planWorkbook } from "../../../src/xlsx/plan.ts";

const sheetOf = (cells: Cell[]): Sheet => ({ format: "wk1", version: null, sawEof: true, declaredDimensions: null, cells: new Map(cells.map((c) => [cellKey(c.col, c.row), c])) });
const verificationOf = (cells: CellResult[]): SheetVerification => ({
  name: "",
  format: "wk1",
  tolerance: TOLERANCE,
  cells,
  totals: { formulas: cells.length, matched: 0, mismatched: 0, unverifiable: 0, exact: 0, withinTolerance: 0, byReason: {} },
});
const plan = (cells: Cell[], results: CellResult[] = []) => planWorkbook({ sheet: sheetOf(cells), verification: verificationOf(results) });
const num = (col: number, row: number, value: number): Cell => ({ kind: "number", col, row, value });
const label = (col: number, row: number, prefix: string, text: string): Cell => ({ kind: "label", col, row, prefix, text });
const formula = (col: number, row: number, cached: number): Cell => ({ kind: "formula", col, row, cached, rpn: new Uint8Array([0x03]) });
const result = (address: string, col: number, row: number, over: Partial<CellResult>): CellResult => ({
  address,
  col,
  row,
  status: "matched",
  cached: { t: "num", v: 6 },
  recalculated: { t: "num", v: 6 },
  reason: { code: "exact", message: "The recalculated value equals the stored value." },
  formula: "SUM(A1:A3)",
  lotusFormula: "@SUM(A1..A3)",
  candidateOpcodes: [],
  ...over,
});

describe("planWorkbook: values and labels", () => {
  it("writes finite numbers exactly", () => {
    const values = [3, -2.5, 0.1, -0, Number.MAX_VALUE, 5e-324];
    const { cells, notes } = plan([...values.map((v, i) => num(0, i, v)), { kind: "integer", col: 1, row: 0, value: 32767 }]);
    expect(notes).toEqual([]);
    const byAddress = new Map(cells.map((c) => [c.address, c]));
    values.forEach((v, i) => {
      const c = byAddress.get(`A${i + 1}`)!;
      expect(c.value.kind).toBe("number");
      expect(Object.is(c.value.kind === "number" && c.value.value, v)).toBe(true);
      expect(c).toMatchObject({ formula: null, alignment: null, note: null });
    });
    expect(byAddress.get("B1")!.value).toEqual({ kind: "number", value: 32767 });
  });

  it("maps +Infinity, -Infinity and NaN with a note each (S27)", () => {
    const { cells, notes } = plan([num(0, 0, Infinity), num(0, 1, -Infinity), num(0, 2, Number.NaN)]);
    expect(cells.map((c) => c.value)).toEqual([{ kind: "error", code: "#VALUE!" }, { kind: "error", code: "#N/A" }, { kind: "none" }]);
    expect(cells.map((c) => c.note)).toEqual(["Lotus stored ERR here.", "Lotus stored NA here.", "Lotus stored a marker that is not a number."]);
    expect(notes.map((n) => [n.address, n.code])).toEqual([["A1", "non-finite-number"], ["A2", "non-finite-number"], ["A3", "non-finite-number"]]);
    expect(notes.map((n) => n.message)).toEqual(cells.map((c) => c.note));
  });

  it("aligns labels by prefix and keeps the prefix out of the text", () => {
    const { cells, notes } = plan([label(0, 0, "'", "left"), label(1, 0, '"', "right"), label(2, 0, "^", "mid"), label(3, 0, "\\", "-"), label(4, 0, "|", "hidden"), label(5, 0, "", "bare")]);
    expect(cells.map((c) => [c.value, c.alignment])).toEqual([
      [{ kind: "text", value: "left" }, "left"],
      [{ kind: "text", value: "right" }, "right"],
      [{ kind: "text", value: "mid" }, "center"],
      [{ kind: "text", value: "-" }, "fill"],
      [{ kind: "text", value: "hidden" }, null],
      [{ kind: "text", value: "bare" }, null],
    ]);
    expect(notes).toEqual([{ address: "E1", code: "label-prefix", message: cells[4]!.note }]);
    expect(cells[4]!.note).toContain("Label prefix |");
  });

  it("keeps a label that looks like a formula as text", () => {
    expect(plan([label(0, 0, "'", "=SUM(A1)")]).cells[0]).toMatchObject({ value: { kind: "text", value: "=SUM(A1)" }, formula: null });
  });

  it("replaces characters XML cannot carry and says how many", () => {
    const { cells, notes } = plan([label(0, 0, "'", "a\u0000b\u0001")]);
    expect(cells[0]!.value).toEqual({ kind: "text", value: "a�b�" });
    expect(cells[0]!.note).toContain("2 characters");
    expect(notes).toEqual([{ address: "A1", code: "xml-characters-replaced", message: cells[0]!.note }]);
  });

  it("omits cells outside the Excel grid with a note and keeps the last cell inside", () => {
    const { cells, notes } = plan([num(16384, 0, 1), num(0, 1048576, 2), num(16383, 1048575, 3)]);
    expect(cells.map((c) => c.address)).toEqual(["XFD1048576"]);
    expect(notes.map((n) => n.code)).toEqual(["outside-excel-grid", "outside-excel-grid"]);
    expect(notes.map((n) => n.address)).toEqual(["XFE1", "A1048577"]);
  });

  it("orders plans row-major whatever the Map insertion order", () => {
    const cells = [num(1, 1, 4), num(0, 1, 3), num(1, 0, 2), num(0, 0, 1)];
    expect(plan(cells).cells.map((c) => c.address)).toEqual(["A1", "B1", "A2", "B2"]);
    expect(plan([...cells].reverse()).cells.map((c) => c.address)).toEqual(["A1", "B1", "A2", "B2"]);
  });
});

describe("planWorkbook: formula cells", () => {
  it("writes the Excel formula with the cached value, whatever the status", () => {
    const statuses: Partial<CellResult>[] = [
      { status: "matched" },
      { status: "mismatched", recalculated: { t: "num", v: 999 }, reason: { code: "value-differs", message: "differs" } },
      { status: "unverifiable", recalculated: null, reason: { code: "unsupported-function", message: "uses @X, not supported" } },
    ];
    for (const over of statuses) {
      const { cells, notes } = plan([formula(3, 0, 6)], [result("D1", 3, 0, over)]);
      expect(cells[0]).toEqual({ address: "D1", col: 3, row: 0, value: { kind: "number", value: 6 }, formula: "SUM(A1:A3)", alignment: null, note: null });
      expect(notes).toEqual([]);
    }
  });

  it("stores ERR and NA as error results, and a NaN cache as no result with a note", () => {
    const { cells, notes } = plan(
      [formula(0, 0, Infinity), formula(0, 1, -Infinity), formula(0, 2, Number.NaN)],
      [result("A1", 0, 0, { cached: { t: "err" } }), result("A2", 0, 1, { cached: { t: "na" } }), result("A3", 0, 2, { cached: null })],
    );
    expect(cells.map((c) => c.value)).toEqual([{ kind: "error", code: "#VALUE!" }, { kind: "error", code: "#N/A" }, { kind: "none" }]);
    expect(cells.map((c) => c.formula)).toEqual(["SUM(A1:A3)", "SUM(A1:A3)", "SUM(A1:A3)"]);
    expect(cells[2]!.note).toContain("no remembered value");
    expect(notes).toEqual([{ address: "A3", code: "no-stored-result", message: cells[2]!.note }]);
  });

  it("writes an untranslatable formula as its plain cached value with the Lotus text and reason in a note", () => {
    const reason = { code: "unsupported-function" as const, message: "uses @ERR, which has no Excel form" };
    const { cells, notes } = plan([formula(0, 0, 0)], [result("A1", 0, 0, { formula: null, lotusFormula: "@ERR", cached: { t: "num", v: 0 }, reason })]);
    expect(cells[0]).toMatchObject({ value: { kind: "number", value: 0 }, formula: null });
    expect(cells[0]!.note).toContain("@ERR");
    expect(cells[0]!.note).toContain(reason.message);
    expect(notes).toEqual([{ address: "A1", code: "untranslatable-formula", message: cells[0]!.note }]);
  });

  it("keeps a formula cell that has no CellResult, with a note", () => {
    const { cells, notes } = plan([formula(1, 1, 2.5)]);
    expect(cells[0]).toMatchObject({ address: "B2", value: { kind: "number", value: 2.5 }, formula: null });
    expect(notes.map((n) => [n.address, n.code])).toEqual([["B2", "no-verification-result"]]);
  });

  it("never reads the recalculated value", () => {
    expect(readFileSync("src/xlsx/plan.ts", "utf8")).not.toContain("recalculated");
  });
});
