// recalcSheet: decode every formula, order them naturally (S26) and evaluate each once, reading
// precedent outcomes that the order guarantees are already set. The Sheet is only read.
import { decodeRpn, type Dialect, type Expr } from "../formula/index.ts";
import { a1, cellKey, cellsInRowMajorOrder, type Cell, type Sheet } from "../parser/index.ts";
import { evaluate, type CellRead, type EvalContext, type RangeItem } from "./evaluate.ts";
import { buildGraph, naturalOrder, precedents, type Precedents } from "./graph.ts";
import { circularReference, decodeError, labelResult, stringResult, unknownOpcode, wk3FormulaNotDecoded, type Outcome, type Unverifiable, type Value } from "./value.ts";

export type CellOutcome = {
  outcome: Outcome<Value>;
  /** The Lotus AST, null when decoding failed. */
  ast: Expr | null;
  /** Candidate opcodes the formula uses (unconfirmed-opcode warnings), sorted, no repeats. */
  candidateOpcodes: number[];
};

type FormulaCell = Extract<Cell, { kind: "formula" }>;

/** The RPN dialect of a sheet: WK3 sheets use the Release 3 token table. */
export const dialectOf = (sheet: Sheet): Dialect => (sheet.format === "wk3" ? "wk3" : "wk1");

/** Requirements 66 to 69: the Lotus AST, or why there is none. */
function decode(cell: FormulaCell, sheet: Sheet): { ast: Expr | null; failure: Unverifiable | null; candidateOpcodes: number[] } {
  const d = decodeRpn(cell.rpn, { col: cell.col, row: cell.row, sheet: sheet.sheetIndex }, dialectOf(sheet));
  const candidates = d.diagnostics.flatMap((x) => (x.code === "unconfirmed-opcode" && x.opcode !== undefined ? [x.opcode] : []));
  const candidateOpcodes = [...new Set(candidates)].sort((a, b) => a - b);
  if (d.ast) return { ast: d.ast, failure: null, candidateOpcodes };
  const first = d.diagnostics.find((x) => x.severity === "error");
  const failure = d.unknown
    ? unknownOpcode(d.unknown.opcode, d.unknown.offset)
    : first?.code === "foreign-reference"
      ? wk3FormulaNotDecoded(first.message)
      : decodeError(first?.code ?? "decode-error", first?.message ?? "no syntax tree");
  return { ast: null, failure, candidateOpcodes };
}

export function recalcSheet(sheet: Sheet): Map<number, CellOutcome> {
  const all = cellsInRowMajorOrder(sheet);
  const formulas = all.filter((c): c is FormulaCell => c.kind === "formula");
  const out = new Map<number, CellOutcome>();
  const deps = new Map<number, Precedents>();
  const decoded = new Map<number, ReturnType<typeof decode>>();
  for (const c of formulas) {
    const key = cellKey(c.col, c.row);
    const d = decode(c, sheet);
    decoded.set(key, d);
    deps.set(key, d.ast ? precedents(d.ast) : { refs: [], ranges: [] });
  }

  const read = (cell: Cell | undefined): CellRead => {
    if (!cell) return { t: "empty" };
    if (cell.kind === "label") return { t: "label" };
    if (cell.kind !== "formula") return { t: "number", v: cell.value };
    const o = out.get(cellKey(cell.col, cell.row))!.outcome;
    // A text or label result is itself unverifiable (string-result, U02), so a formula that needs it is too.
    if (o.ok && o.v.t === "str") return { t: "formula", o: { ok: false, u: stringResult() } };
    if (o.ok && o.v.t === "num" && o.v.label) return { t: "formula", o: { ok: false, u: labelResult() } };
    return { t: "formula", o };
  };
  const item = (c: Cell): RangeItem => ({ col: c.col, row: c.row, read: read(c) });
  const ctx: EvalContext = {
    read: (col, row) => read(sheet.cells.get(cellKey(col, row))),
    rangeItems(from, to) {
      // Visit the rectangle when it is no larger than the sheet, else filter the sheet's cells.
      const area = (to.col - from.col + 1) * (to.row - from.row + 1);
      if (area > all.length) return all.filter((c) => c.col >= from.col && c.col <= to.col && c.row >= from.row && c.row <= to.row).map(item);
      const items: RangeItem[] = [];
      for (let row = from.row; row <= to.row; row++) {
        for (let col = from.col; col <= to.col; col++) {
          const c = sheet.cells.get(cellKey(col, row));
          if (c) items.push(item(c));
        }
      }
      return items;
    },
  };

  for (const component of naturalOrder(buildGraph(deps))) {
    const circular = component.cycle ? circularReference(component.members.map((k) => a1(k % 65536, Math.floor(k / 65536)))) : null;
    for (const key of component.members) {
      const d = decoded.get(key)!;
      const outcome: Outcome<Value> = circular
        ? { ok: false, u: circular }
        : d.failure
          ? { ok: false, u: d.failure }
          : evaluate(d.ast!, ctx);
      out.set(key, { outcome, ast: d.ast, candidateOpcodes: d.candidateOpcodes });
    }
  }
  return out;
}
