// Macro detection. A named macro is a range called backslash plus one letter or 0 (evidence.md,
// item b: the letter rule has one source; \0 is accepted as written in many files). Its text is
// read down the column from the range's top-left cell until a cell that is not a label with text.
// That end rule is a reading rule of this tool, not a sourced Lotus rule. Unnamed blocks are runs
// of label cells in one column whose first line starts with "/" or "{": candidates for a person
// to review. Nothing here runs a macro.
import { a1 } from "../parser/address.ts";
import { getCell, type Sheet } from "../parser/sheet.ts";
import type { NamedRange } from "./names.ts";

export type DetectedMacro = { id: string; name: string | null; sheet: string; start: string; lines: string[]; source: "named" | "unnamed" };

const MAX_ROW = 8191;
const MACRO_NAME = /^\\[0A-Z]$/;

const textAt = (sheet: Sheet, col: number, row: number): string | null => {
  const c = getCell(sheet, col, row);
  return c?.kind === "label" && c.text !== "" ? c.text : null;
};

const order = (name: string) => (name === "\\0" ? -1 : name.charCodeAt(1));

export function detectMacros(sheet: Sheet, names: readonly NamedRange[], sheetName: string): { macros: DetectedMacro[]; notes: string[] } {
  const notes: string[] = [];
  const named: DetectedMacro[] = [];
  const covered = new Set<string>();
  const macro = (name: string | null, col: number, row: number, lines: string[]): DetectedMacro => {
    const start = a1(col, row);
    return { id: `macro:${sheetName}!${start}`, name, sheet: sheetName, start, lines, source: name === null ? "unnamed" : "named" };
  };

  const candidates = names.map((n) => ({ ...n, name: n.name.replace(/[a-z]/g, (c) => c.toUpperCase()) })).filter((n) => MACRO_NAME.test(n.name));
  for (const n of candidates.sort((a, b) => order(a.name) - order(b.name))) {
    const col = Math.min(n.startCol, n.endCol);
    const row = Math.min(n.startRow, n.endRow);
    const lines: string[] = [];
    for (let r = row; r <= MAX_ROW; r++) {
      const text = textAt(sheet, col, r);
      if (text === null) break;
      lines.push(text);
      covered.add(`${col},${r}`);
    }
    if (lines.length === 0) notes.push(`${n.name} starts at ${a1(col, row)}, which holds no text.`);
    else named.push(macro(n.name, col, row, lines));
  }

  const byCol = new Map<number, number[]>();
  for (const c of sheet.cells.values()) {
    if (c.kind !== "label" || c.text === "" || covered.has(`${c.col},${c.row}`)) continue;
    byCol.set(c.col, [...(byCol.get(c.col) ?? []), c.row]);
  }
  const blocks: DetectedMacro[] = [];
  for (const col of [...byCol.keys()].sort((a, b) => a - b)) {
    const rows = byCol.get(col)!.sort((a, b) => a - b);
    for (let i = 0; i < rows.length; ) {
      let j = i;
      while (j + 1 < rows.length && rows[j + 1] === rows[j]! + 1) j++;
      const lines = rows.slice(i, j + 1).map((r) => textAt(sheet, col, r)!);
      if (/^[/{]/.test(lines[0]!)) blocks.push(macro(null, col, rows[i]!, lines));
      i = j + 1;
    }
  }
  return { macros: [...named, ...blocks], notes };
}
