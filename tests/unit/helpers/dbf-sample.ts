// A hand-built dBase III table: 2 records, fields NAME (C, 10) and PRICE (N, 8.2).
const latin1 = (s: string) => Uint8Array.from(s, (c) => c.charCodeAt(0));

function field(name: string, type: string, length: number, decimals: number): Uint8Array {
  const d = new Uint8Array(32);
  d.set(latin1(name));
  d[11] = type.charCodeAt(0);
  d[16] = length;
  d[17] = decimals;
  return d;
}

const header = new Uint8Array(32);
const view = new DataView(header.buffer);
header[0] = 0x03; // dBase III, no memo
header.set([126, 11, 14], 1); // last update 2026-11-14 (year - 1900)
view.setUint32(4, 2, true); // records
view.setUint16(8, 32 + 2 * 32 + 1, true); // header length
view.setUint16(10, 1 + 10 + 8, true); // record length

export const SAMPLE_DBF = new Uint8Array([
  ...header,
  ...field("NAME", "C", 10, 0),
  ...field("PRICE", "N", 8, 2),
  0x0d,
  ...latin1(" Apple         1.50"),
  ...latin1(" Pear         12.00"),
  0x1a,
]);
