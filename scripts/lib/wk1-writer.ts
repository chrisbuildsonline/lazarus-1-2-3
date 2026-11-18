// Encoders for the WK1 records the synthetic fixtures use. Layouts follow
// .kiro/steering/lotus-format.md: opcode u16 LE, length u16 LE, body; all integers LE.

export type LabelPrefix = "'" | '"' | "^";
export type CellSpec =
  | { kind: "integer"; col: number; row: number; value: number }
  | { kind: "number"; col: number; row: number; value: number }
  | { kind: "label"; col: number; row: number; prefix: LabelPrefix; text: string }
  | { kind: "formula"; col: number; row: number; cached: number; rpn: readonly number[] };

// Format byte 0xFF: protected flag set, "special / default" format, i.e. the cell
// follows the worksheet's global format.
const FORMAT = 0xff;

function record(opcode: number, body: Uint8Array): Uint8Array {
  const out = new Uint8Array(4 + body.length);
  const view = new DataView(out.buffer);
  view.setUint16(0, opcode, true);
  view.setUint16(2, body.length, true);
  out.set(body, 4);
  return out;
}

function cellBody(col: number, row: number, size: number): { body: Uint8Array; view: DataView } {
  const body = new Uint8Array(5 + size);
  const view = new DataView(body.buffer);
  view.setUint8(0, FORMAT);
  view.setUint16(1, col, true);
  view.setUint16(3, row, true);
  return { body, view };
}

export function bof(version: number): Uint8Array {
  const body = new Uint8Array(2);
  new DataView(body.buffer).setUint16(0, version, true);
  return record(0x0000, body);
}

export function eof(): Uint8Array {
  return record(0x0001, new Uint8Array(0));
}

export function dimensions(firstCol: number, firstRow: number, lastCol: number, lastRow: number): Uint8Array {
  const body = new Uint8Array(8);
  const view = new DataView(body.buffer);
  [firstCol, firstRow, lastCol, lastRow].forEach((v, i) => view.setUint16(i * 2, v, true));
  return record(0x0006, body);
}

export function integer(col: number, row: number, value: number): Uint8Array {
  if (!Number.isInteger(value) || value < -32768 || value > 32767) throw new RangeError(`not an int16: ${value}`);
  const { body, view } = cellBody(col, row, 2);
  view.setInt16(5, value, true);
  return record(0x000d, body);
}

export function number(col: number, row: number, value: number): Uint8Array {
  const { body, view } = cellBody(col, row, 8);
  view.setFloat64(5, value, true);
  return record(0x000e, body);
}

export function label(col: number, row: number, prefix: LabelPrefix, text: string): Uint8Array {
  if (!/^[\x20-\x7e]*$/.test(text)) throw new RangeError(`label text must be printable ASCII: ${text}`);
  const { body } = cellBody(col, row, text.length + 2);
  body.set([prefix.charCodeAt(0), ...Array.from(text, (c) => c.charCodeAt(0)), 0x00], 5);
  return record(0x000f, body);
}

export function formula(col: number, row: number, cached: number, rpn: readonly number[]): Uint8Array {
  const { body, view } = cellBody(col, row, 8 + 2 + rpn.length);
  view.setFloat64(5, cached, true);
  view.setUint16(13, rpn.length, true);
  body.set(rpn, 15);
  return record(0x0010, body);
}

export type NameSpec = { name: string; startCol: number; startRow: number; endCol: number; endRow: number };

/** NAME (0x0B, 24 bytes): name NUL-padded to 16 bytes, then start col, start row, end col, end row. */
export function name(text: string, startCol: number, startRow: number, endCol: number, endRow: number): Uint8Array {
  if (!/^[\x20-\x7e]{1,15}$/.test(text)) throw new RangeError(`range name must be 1 to 15 printable ASCII characters: ${text}`);
  const body = new Uint8Array(24);
  const view = new DataView(body.buffer);
  body.set(Array.from(text, (c) => c.charCodeAt(0)), 0);
  [startCol, startRow, endCol, endRow].forEach((v, i) => view.setUint16(16 + i * 2, v, true));
  return record(0x000b, body);
}

function encode(c: CellSpec): Uint8Array {
  switch (c.kind) {
    case "integer":
      return integer(c.col, c.row, c.value);
    case "number":
      return number(c.col, c.row, c.value);
    case "label":
      return label(c.col, c.row, c.prefix, c.text);
    case "formula":
      return formula(c.col, c.row, c.cached, c.rpn);
  }
}

/** BOF, DIMENSIONS of the used range, NAME records if any, cells in row-major order, EOF. */
export function writeWk1(version: number, cells: readonly CellSpec[], names: readonly NameSpec[] = []): Uint8Array {
  const sorted = [...cells].sort((a, b) => a.row - b.row || a.col - b.col);
  const cols = sorted.map((c) => c.col);
  const rows = sorted.map((c) => c.row);
  const parts = [
    bof(version),
    dimensions(Math.min(...cols), Math.min(...rows), Math.max(...cols), Math.max(...rows)),
    ...names.map((n) => name(n.name, n.startCol, n.startRow, n.endCol, n.endRow)),
    ...sorted.map(encode),
    eof(),
  ];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let pos = 0;
  for (const p of parts) {
    out.set(p, pos);
    pos += p.length;
  }
  return out;
}
