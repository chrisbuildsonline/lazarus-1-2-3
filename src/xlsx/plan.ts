// planWorkbook: one plain-data CellPlan per Lotus cell inside the Excel grid, in row-major
// order, plus a WriterNote for each problem (design "Cell plan"). No exceljs here. For formula
// cells it reads only the cached value, Excel text, Lotus text and reason of the CellResult.
import { a1, cellKey, cellsInRowMajorOrder, type Cell, type Sheet } from "../parser/index.ts";
import type { CellResult, SheetVerification } from "../verify/index.ts";
import { alignmentFor, ERR_CODE, sanitizeXmlText, storedValue, type Alignment, type PlannedValue } from "./labels.ts";

export type CellPlan = {
  address: string;
  col: number;
  row: number;
  /** For a formula cell: the stored result. */
  value: PlannedValue;
  /** Excel text without "="; null for a plain cell. */
  formula: string | null;
  alignment: Alignment | null;
  note: string | null;
};

export type WriterNoteCode =
  | "non-finite-number"
  | "label-prefix"
  | "xml-characters-replaced"
  | "untranslatable-formula"
  | "no-stored-result"
  | "no-verification-result"
  | "outside-excel-grid"
  | "zip-not-normalised";

export type WriterNote = { address: string; code: WriterNoteCode; message: string };

export type XlsxInput = { sheet: Sheet; verification: SheetVerification };

const EXCEL_COLS = 16384;
const EXCEL_ROWS = 1048576;

/** A stored Lotus double as a cell value, with the S27 note for a non-finite one. */
function fromDouble(d: number): { value: PlannedValue; note: string | null } {
  if (Number.isFinite(d)) return { value: { kind: "number", value: d }, note: null };
  if (d === Infinity) return { value: { kind: "error", code: ERR_CODE }, note: "Lotus stored ERR here." };
  if (d === -Infinity) return { value: { kind: "error", code: "#N/A" }, note: "Lotus stored NA here." };
  return { value: { kind: "none" }, note: "Lotus stored a marker that is not a number." };
}

export function planWorkbook({ sheet, verification }: XlsxInput): { cells: CellPlan[]; notes: WriterNote[] } {
  const results = new Map<number, CellResult>(verification.cells.map((r) => [cellKey(r.col, r.row), r]));
  const cells: CellPlan[] = [];
  const notes: WriterNote[] = [];

  for (const cell of cellsInRowMajorOrder(sheet)) {
    const address = a1(cell.col, cell.row);
    if (cell.col >= EXCEL_COLS || cell.row >= EXCEL_ROWS) {
      notes.push({ address, code: "outside-excel-grid", message: `Lotus cell ${address} lies outside the Excel grid and was not written.` });
      continue;
    }
    const cellNotes: [WriterNoteCode, string][] = [];
    const plan = planCell(cell, results.get(cellKey(cell.col, cell.row)), cellNotes);
    for (const [code, message] of cellNotes) notes.push({ address, code, message });
    cells.push({ address, col: cell.col, row: cell.row, ...plan, note: cellNotes.length ? cellNotes.map(([, m]) => m).join("\n") : null });
  }
  return { cells, notes };
}

function planCell(cell: Cell, result: CellResult | undefined, notes: [WriterNoteCode, string][]): Pick<CellPlan, "value" | "formula" | "alignment"> {
  switch (cell.kind) {
    case "integer":
    case "number": {
      const { value, note } = fromDouble(cell.value);
      if (note) notes.push(["non-finite-number", note]);
      return { value, formula: null, alignment: null };
    }
    case "label": {
      const { alignment, note } = alignmentFor(cell.prefix);
      if (note) notes.push(["label-prefix", note]);
      const { text, replaced } = sanitizeXmlText(cell.text);
      if (replaced > 0) notes.push(["xml-characters-replaced", `${replaced} characters could not be written to XML and were replaced with U+FFFD.`]);
      return { value: { kind: "text", value: text }, formula: null, alignment };
    }
    case "formula": {
      if (!result) {
        notes.push(["no-verification-result", "No verification result was supplied for this formula; its stored value is written as a plain value."]);
        return { value: fromDouble(cell.cached).value, formula: null, alignment: null };
      }
      const value = storedValue(result.cached);
      if (result.formula === null) {
        const lotus = result.lotusFormula === null ? "The Lotus formula could not be read." : `Lotus formula ${result.lotusFormula} has no Excel translation.`;
        notes.push(["untranslatable-formula", `${lotus} ${result.reason.message} The stored value is written as a plain value.`]);
        return { value, formula: null, alignment: null };
      }
      if (result.cached === null) notes.push(["no-stored-result", "The text Lotus stored for this formula is not read yet, so the cell has no remembered value."]);
      return { value, formula: result.formula, alignment: null };
    }
  }
}
