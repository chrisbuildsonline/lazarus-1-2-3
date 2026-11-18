// Test-only WK3 walker for manifest checks, independent of src/parser and scripts/lib. Reads the
// layout of .kiro/steering/lotus-format.md (WK3) its own way: DataView offsets per record, the
// 10-byte number through Number(BigInt) (one correct rounding for normal values), sheet letters by hand.
import type { Counts } from "./wk1-scan.ts";

export type Wk3Cell = { cell: string; kind: "integer" | "number" | "label" | "formula"; value: number | string };
export type Wk3Scan = { counts: Counts; sheets: { name: string; counts: Counts }[]; cells: Wk3Cell[] };

const letters = (i: number): string => (i < 26 ? String.fromCharCode(65 + i) : letters(Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26)));
const colRow = (col: number, row: number) => `${letters(col)}${row + 1}`;

function ext80(b: Uint8Array, at: number): number {
  let sig = 0n;
  for (let i = 7; i >= 0; i--) sig = sig * 256n + BigInt(b[at + i]!);
  const se = b[at + 8]! + 256 * b[at + 9]!;
  const sign = se >= 0x8000 ? -1 : 1;
  if (sig === 0n) return sign * 0;
  return sign * Number(sig) * 2 ** ((se & 0x7fff) - 16383 - 63);
}

function text(b: Uint8Array, from: number, to: number): string {
  let s = "";
  for (let i = from; i < to && b[i] !== 0; i++) s += String.fromCharCode(b[i]!);
  return s;
}

export function scanWk3(bytes: Uint8Array): Wk3Scan {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const raw: (Wk3Cell & { sheet: number; key: string })[] = [];
  const names = new Map<number, string>();
  const used = new Set<number>();
  for (let p = 0; p + 4 <= bytes.length; ) {
    const op = view.getUint16(p, true);
    const len = view.getUint16(p + 2, true);
    const body = p + 4;
    const end = body + len;
    if (end > bytes.length || op === 0x0001) break;
    p = end;
    if (op === 0x001b && len >= 4 && view.getUint16(body, true) === 14000) {
      const sheet = view.getUint16(body + 2, true);
      names.set(sheet, text(bytes, body + 4, end));
      used.add(sheet);
      continue;
    }
    if (op < 0x16 || op > 0x19 || len < 4) continue;
    const row = view.getUint16(body, true);
    const sheet = bytes[body + 2]!;
    const col = bytes[body + 3]!;
    let cell: Wk3Cell | null = null;
    const at = colRow(col, row);
    if (op === 0x16 && len >= 5) cell = { cell: at, kind: "label", value: text(bytes, body + 5, end) };
    if (op === 0x17 && len >= 14) cell = { cell: at, kind: "number", value: ext80(bytes, body + 4) };
    if (op === 0x19 && len >= 14) cell = { cell: at, kind: "formula", value: ext80(bytes, body + 4) };
    if (op === 0x18 && len >= 6) {
      const w = view.getInt16(body + 4, true);
      // Even word: the integer w / 2. Odd: floor(w / 16) times 5000 or 500, or divided by 20 ... 64.
      const index = Math.floor(w / 2) & 7;
      const mantissa = Math.floor(w / 16);
      const value = index === 0 ? mantissa * 5000 : index === 1 ? mantissa * 500 : mantissa / [0, 0, 20, 200, 2000, 20000, 16, 64][index]!;
      cell = w % 2 === 0 ? { cell: at, kind: "integer", value: w / 2 } : { cell: at, kind: "number", value };
    }
    if (cell) {
      used.add(sheet);
      const key = `${sheet}:${cell.cell}`;
      const old = raw.findIndex((c) => c.key === key);
      if (old >= 0) raw.splice(old, 1);
      raw.push({ ...cell, sheet, key });
    }
  }
  const nameOf = (s: number) => names.get(s) || letters(s);
  const count = (list: Wk3Cell[]): Counts => ({
    cells: list.length,
    formulas: list.filter((c) => c.kind === "formula").length,
    labels: list.filter((c) => c.kind === "label").length,
    numbers: list.filter((c) => c.kind === "integer" || c.kind === "number").length,
  });
  const sheets = [...used].sort((a, b) => a - b).map((s) => ({ name: nameOf(s), counts: count(raw.filter((c) => c.sheet === s)) }));
  const cells = raw.map(({ sheet, cell, kind, value }) => ({ cell: `${nameOf(sheet)}!${cell}`, kind, value }));
  return { counts: count(cells), sheets, cells };
}
