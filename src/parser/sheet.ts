// The sheet model every reader (WK1/WKS, WK3, DBF) produces. Columns and rows are 0-based.

export type SheetFormat = "wk1" | "wks" | "wk3" | "dbf" | "unknown";
/** Kept so existing imports do not change. */
export type Wk1Format = SheetFormat;

/** The five label prefixes Lotus defines. A parsed label may carry another byte (see Cell). */
export type LabelPrefix = "'" | '"' | "^" | "\\" | "|";

export type Cell =
  | { kind: "integer"; col: number; row: number; value: number }
  | { kind: "number"; col: number; row: number; value: number }
  | { kind: "label"; col: number; row: number; prefix: string; text: string }
  | { kind: "formula"; col: number; row: number; cached: number; rpn: Uint8Array };

export type Sheet = {
  format: Wk1Format;
  /** BOF version word, null if there is no BOF. */
  version: number | null;
  sawEof: boolean;
  declaredDimensions: { firstCol: number; firstRow: number; lastCol: number; lastRow: number } | null;
  /** Keyed by cellKey(col, row). */
  cells: Map<number, Cell>;
};

export type NamedSheet = { name: string; sheet: Sheet };
export type Workbook = { format: SheetFormat; sheets: NamedSheet[] };

/** Unique, safe-integer key for a u16 column and row. */
export function cellKey(col: number, row: number): number {
  return row * 65536 + col;
}

export function getCell(sheet: Sheet, col: number, row: number): Cell | undefined {
  return sheet.cells.get(cellKey(col, row));
}

export function cellsInRowMajorOrder(sheet: Sheet): Cell[] {
  return [...sheet.cells.values()].sort((a, b) => a.row - b.row || a.col - b.col);
}
