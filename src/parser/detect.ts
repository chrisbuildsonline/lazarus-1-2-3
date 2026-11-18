// Which reader a file needs, decided from its bytes only (never the extension).
// The DBF check moved here from src/cli/inventory.ts so the CLI and the parser agree.

import { WK3_BOF_LENGTH, WK3_VERSION } from "./wk3-records.ts";

export type ReaderKind = "wk1" | "wk3" | "dbf";

/** BOF version words that mean WK3. Sourced in .kiro/steering/lotus-format.md, section WK3. */
export const WK3_VERSIONS: ReadonlySet<number> = new Set([WK3_VERSION]);

// dBase version bytes accepted as DBF (III, IV, 5, Visual FoxPro, with or without memo).
const DBF_VERSIONS: ReadonlySet<number> = new Set([0x02, 0x03, 0x04, 0x05, 0x30, 0x83, 0x8b, 0xf5]);

export function isDbfHeader(bytes: Uint8Array): boolean {
  if (bytes.length < 32 || !DBF_VERSIONS.has(bytes[0] ?? -1)) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records = view.getUint32(4, true);
  const headerLen = view.getUint16(8, true);
  const recordLen = view.getUint16(10, true);
  return headerLen > 32 && recordLen > 0 && headerLen + records * recordLen <= bytes.length + 1;
}

/** True when the first record is a BOF of the WK3 length whose version word is in WK3_VERSIONS. */
export function isWk3Bof(bytes: Uint8Array): boolean {
  if (bytes.length < 6) return false;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return view.getUint16(0, true) === 0 && view.getUint16(2, true) === WK3_BOF_LENGTH && WK3_VERSIONS.has(view.getUint16(4, true));
}

export function detectKind(bytes: Uint8Array): ReaderKind {
  if (isWk3Bof(bytes)) return "wk3";
  if (isDbfHeader(bytes)) return "dbf";
  return "wk1";
}
