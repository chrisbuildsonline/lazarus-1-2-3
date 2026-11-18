// NAME records (opcode 0x0B, 24 bytes): 16-byte NUL-terminated name, then start col, start row,
// end col, end row as u16 LE. Sources: design/refs/lotus/WSFF2-mettalogic.TXT lines 301-350 and
// LibreOffice sc/source/filter/lotus/op.cxx OP_NamedRange (evidence.md, item a).
// An independent record walker, so the WK1 parser and its stats stay as they are. Never throws.

export type NamedRange = { name: string; startCol: number; startRow: number; endCol: number; endRow: number };

const NAME = 0x000b;
const EOF = 0x0001;
const MAX_NOTES = 100;

const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(4, "0")}`;

export function readNames(bytes: Uint8Array): { names: NamedRange[]; notes: string[] } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const found = new Map<string, NamedRange>();
  const notes: string[] = [];
  const note = (text: string) => {
    if (notes.length < MAX_NOTES) notes.push(text);
  };
  let pos = 0;
  while (pos + 4 <= bytes.length) {
    const opcode = view.getUint16(pos, true);
    const len = view.getUint16(pos + 2, true);
    const body = pos + 4;
    if (opcode === EOF) break;
    if (body + len > bytes.length) {
      note(`record at ${hex(pos)} runs past the end`);
      break;
    }
    if (opcode === NAME) {
      if (len < 24) note(`NAME record at ${hex(pos)} is ${len} bytes; 24 expected, skipped`);
      else {
        if (len > 24) note(`NAME record at ${hex(pos)} is ${len} bytes; first 24 read`);
        let end = body;
        while (end < body + 16 && bytes[end] !== 0) end++;
        const name = String.fromCharCode(...bytes.subarray(body, end));
        const u16 = (at: number) => view.getUint16(body + at, true);
        const range = { name, startCol: u16(16), startRow: u16(18), endCol: u16(20), endRow: u16(22) };
        const key = name.toUpperCase();
        if (found.has(key)) {
          note(`two ranges are named ${range.name}; the later one is kept`);
          found.delete(key);
        }
        found.set(key, range);
      }
    }
    pos = body + len;
  }
  return { names: [...found.values()], notes };
}
