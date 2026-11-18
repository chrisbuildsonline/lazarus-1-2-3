// dBase III table encoder for the synthetic fixtures and the tests. Layout as in
// .kiro/specs/wk3-dbf-readers/design.md "Header and fields": 32-byte header, 32-byte field
// descriptors ending in 0x0D, records of 1 deletion byte plus the field bytes, optional 0x1A.
// Independent of src/parser. Text is Latin-1 (one byte per char code, low 8 bits).

export type DbfFieldSpec = { name: string; type: string; length: number; decimals?: number };
export type DbfRecordSpec = { deleted?: boolean; values: readonly string[] };
export type DbfSpec = {
  version?: number;
  lastUpdate?: readonly [number, number, number];
  codePage?: number;
  fields: readonly DbfFieldSpec[];
  records: readonly DbfRecordSpec[];
  /** Overrides for broken headers. */
  declaredRecords?: number;
  recordLength?: number;
  headerLength?: number;
  terminator?: boolean;
  eof?: boolean;
  trailing?: readonly number[];
};

const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0) & 0xff);

/** A field value padded to its width: C (and other text) left-aligned, N and F right-aligned. Longer values are cut. */
export function padValue(field: DbfFieldSpec, value: string): string {
  const padded = field.type === "N" || field.type === "F" ? value.padStart(field.length) : value.padEnd(field.length);
  return padded.slice(0, field.length);
}

export function writeDbf(spec: DbfSpec): Uint8Array {
  const fieldBytes = spec.fields.reduce((n, f) => n + f.length, 0);
  const terminator = spec.terminator ?? true;
  const headerLength = spec.headerLength ?? 32 + 32 * spec.fields.length + (terminator ? 1 : 0);
  const recordLength = spec.recordLength ?? 1 + fieldBytes;

  const header = new Uint8Array(32);
  const view = new DataView(header.buffer);
  header[0] = spec.version ?? 0x03;
  header.set(spec.lastUpdate ?? [126, 11, 18], 1);
  view.setUint32(4, spec.declaredRecords ?? spec.records.length, true);
  view.setUint16(8, headerLength, true);
  view.setUint16(10, recordLength, true);
  header[29] = spec.codePage ?? 0x03;

  const parts: number[] = [...header];
  for (const f of spec.fields) {
    const d = new Uint8Array(32);
    d.set(latin1(f.name).subarray(0, 11));
    d[11] = f.type.charCodeAt(0);
    d[16] = f.length;
    d[17] = f.decimals ?? 0;
    parts.push(...d);
  }
  if (terminator) parts.push(0x0d);
  while (parts.length < headerLength) parts.push(0);

  for (const r of spec.records) {
    const row = new Uint8Array(recordLength).fill(0x20);
    row[0] = r.deleted ? 0x2a : 0x20;
    let at = 1;
    spec.fields.forEach((f, i) => {
      const bytes = latin1(padValue(f, r.values[i] ?? ""));
      row.set(bytes.subarray(0, Math.max(0, recordLength - at)), at);
      at += f.length;
    });
    parts.push(...row);
  }
  if (spec.eof ?? true) parts.push(0x1a);
  parts.push(...(spec.trailing ?? []));
  return Uint8Array.from(parts);
}
