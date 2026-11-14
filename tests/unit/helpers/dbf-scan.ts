// Test-only dBase III/IV reader for manifest checks, independent of src/parser.
// Counts come from the header and the 32-byte field descriptors; values are the
// stored field text (C trimmed at the end, N/F as numbers). Bounds-checked; never throws.
import type { Counts } from "./wk1-scan.ts";

export type DbfCell = { cell: string; kind: "label" | "number" | "other"; value: number | string | null };
export type DbfScan = { counts: Counts; cells: DbfCell[] };

export function scanDbf(bytes: Uint8Array): DbfScan {
  const scan: DbfScan = { counts: { cells: 0, formulas: 0, labels: 0, numbers: 0 }, cells: [] };
  if (bytes.length < 32) return scan;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records = view.getUint32(4, true);
  const headerLen = view.getUint16(8, true);
  const recordLen = view.getUint16(10, true);
  const latin1 = new TextDecoder("latin1");

  const fields: { name: string; type: string; offset: number; length: number }[] = [];
  let offset = 1; // byte 0 of each record is the deletion flag
  for (let p = 32; p + 32 <= Math.min(bytes.length, headerLen) && bytes[p] !== 0x0d; p += 32) {
    const nameBytes = bytes.subarray(p, p + 11);
    const nul = nameBytes.indexOf(0);
    const length = bytes[p + 16] ?? 0;
    fields.push({
      name: latin1.decode(nul === -1 ? nameBytes : nameBytes.subarray(0, nul)),
      type: String.fromCharCode(bytes[p + 11] ?? 0),
      offset,
      length,
    });
    offset += length;
  }

  const kindOf = (type: string): DbfCell["kind"] => (type === "C" ? "label" : type === "N" || type === "F" ? "number" : "other");
  for (const f of fields) {
    const kind = kindOf(f.type);
    scan.counts.cells += records;
    if (kind === "label") scan.counts.labels += records;
    if (kind === "number") scan.counts.numbers += records;
  }

  for (let r = 0; r < records; r++) {
    const start = headerLen + r * recordLen;
    if (start + recordLen > bytes.length) break;
    for (const f of fields) {
      const text = latin1.decode(bytes.subarray(start + f.offset, start + f.offset + f.length));
      const kind = kindOf(f.type);
      const value = kind === "number" ? (text.trim() === "" ? null : Number(text.trim())) : kind === "label" ? text.trimEnd() : text.trim();
      scan.cells.push({ cell: `${r + 1}:${f.name}`, kind, value });
    }
  }
  return scan;
}
