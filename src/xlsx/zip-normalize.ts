// Fixed DOS timestamps in every ZIP header (requirement 25, design "ZIP timestamps"). The ZIP
// library stamps entries with the current time; this sets time 0x0000 and date 0x0021
// (1980-01-01 00:00:00) in each central and local header. CRC-32 covers content only, so the
// archive stays valid. Returns a copy, or null on any bounds or signature failure.
const EOCD = 0x06054b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;
const MAX_EOCD_SCAN = 22 + 65535;

export function normalizeZipTimestamps(input: Uint8Array): Uint8Array | null {
  const out = input.slice();
  const view = new DataView(out.buffer);
  const n = out.length;
  let eocd = -1;
  for (let p = n - 22; p >= 0 && p >= n - MAX_EOCD_SCAN; p--) {
    if (view.getUint32(p, true) === EOCD) {
      eocd = p;
      break;
    }
  }
  if (eocd < 0) return null;
  const stamp = (p: number) => {
    view.setUint16(p, 0x0000, true);
    view.setUint16(p + 2, 0x0021, true);
  };
  const count = view.getUint16(eocd + 10, true);
  let p = view.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i++) {
    if (p + 46 > n || view.getUint32(p, true) !== CENTRAL) return null;
    stamp(p + 12);
    const local = view.getUint32(p + 42, true);
    if (local + 30 > n || view.getUint32(local, true) !== LOCAL) return null;
    stamp(local + 10);
    p += 46 + view.getUint16(p + 28, true) + view.getUint16(p + 30, true) + view.getUint16(p + 32, true);
  }
  return out;
}
