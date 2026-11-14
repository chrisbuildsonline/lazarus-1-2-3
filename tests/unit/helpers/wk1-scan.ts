// Test-only WK1/WKS record walker. Deliberately independent of src/parser: the manifest
// test uses it to check fixture counts, so it must not rely on the code it will help test.
// Bounds-checked; never throws. Record layouts are from .kiro/steering/lotus-format.md.

export type Counts = { cells: number; formulas: number; labels: number; numbers: number };
export type Wk1Cell =
  | { cell: string; kind: "integer" | "number" | "formula"; value: number }
  | { cell: string; kind: "label"; value: string; prefix: string };
export type Wk1Scan = {
  version: number | null;
  counts: Counts;
  cells: Wk1Cell[];
  eof: boolean;
  /** A record header or body ran past the end of the bytes. */
  truncated: boolean;
};

export function a1(col: number, row: number): string {
  let name = "";
  for (let c = col + 1; c > 0; c = Math.floor((c - 1) / 26)) {
    name = String.fromCharCode(65 + ((c - 1) % 26)) + name;
  }
  return `${name}${row + 1}`;
}

export function scanWk1(bytes: Uint8Array): Wk1Scan {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const scan: Wk1Scan = {
    version: null,
    counts: { cells: 0, formulas: 0, labels: 0, numbers: 0 },
    cells: [],
    eof: false,
    truncated: false,
  };
  let pos = 0;
  while (pos < bytes.length) {
    if (pos + 4 > bytes.length) {
      scan.truncated = true;
      break;
    }
    const opcode = view.getUint16(pos, true);
    const length = view.getUint16(pos + 2, true);
    const body = pos + 4;
    if (body + length > bytes.length) {
      scan.truncated = true;
      break;
    }
    pos = body + length;
    if (opcode === 0x0001) {
      scan.eof = true;
      break;
    }
    if (opcode === 0x0000 && length >= 2) {
      scan.version = view.getUint16(body, true);
      continue;
    }
    if (length < 5 || opcode < 0x000d || opcode > 0x0010) continue;
    const cell = a1(view.getUint16(body + 1, true), view.getUint16(body + 3, true));
    if (opcode === 0x000d && length >= 7) {
      scan.cells.push({ cell, kind: "integer", value: view.getInt16(body + 5, true) });
    } else if (opcode === 0x000e && length >= 13) {
      scan.cells.push({ cell, kind: "number", value: view.getFloat64(body + 5, true) });
    } else if (opcode === 0x000f && length >= 6) {
      const raw = bytes.subarray(body + 5, pos);
      const nul = raw.indexOf(0);
      const text = new TextDecoder("latin1").decode(nul === -1 ? raw : raw.subarray(0, nul));
      scan.cells.push({ cell, kind: "label", value: text.slice(1), prefix: text.slice(0, 1) });
    } else if (opcode === 0x0010 && length >= 15) {
      scan.cells.push({ cell, kind: "formula", value: view.getFloat64(body + 5, true) });
    }
  }
  for (const c of scan.cells) {
    scan.counts.cells++;
    if (c.kind === "formula") scan.counts.formulas++;
    else if (c.kind === "label") scan.counts.labels++;
    else scan.counts.numbers++;
  }
  return scan;
}
