// Pure core of the lazarus CLI: format detection, folder walk, hashing, output lines.
// Imports only node:* modules. Inventory only; nothing here parses cells.
import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
import { extname, join } from "node:path";

export type Format = "wk1" | "wks" | "dbf" | "unknown";
export type Entry = { path: string; format: Format; size: number; sha256: string; note?: string };

// BOF version word -> format. Confirmed from real fixtures: KSBASE.WK1 and 92stlde.wk1
// carry 0x0406; testLotus123.wks and gnome647171-1.wks carry 0x0404. LibreOffice
// sc/source/filter/lotus/filter.cxx maps 0x0404 to WK1 release 1 (WKS) and 0x0406 to release 2 (WK1).
const BOF_VERSIONS: Record<number, Format> = { 0x0404: "wks", 0x0406: "wk1" };

// dBase version bytes accepted as DBF (III, IV, 5, Visual FoxPro, with or without memo).
const DBF_VERSIONS = new Set([0x02, 0x03, 0x04, 0x05, 0x30, 0x83, 0x8b, 0xf5]);

function fromBytes(bytes: Uint8Array): Format {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length >= 6 && view.getUint16(0, true) === 0x0000 && view.getUint16(2, true) === 2) {
    return BOF_VERSIONS[view.getUint16(4, true)] ?? "unknown";
  }
  if (bytes.length >= 32 && DBF_VERSIONS.has(bytes[0] ?? -1)) {
    const records = view.getUint32(4, true);
    const headerLen = view.getUint16(8, true);
    const recordLen = view.getUint16(10, true);
    if (headerLen > 32 && recordLen > 0 && headerLen + records * recordLen <= bytes.length + 1) return "dbf";
  }
  return "unknown";
}

/** Format from the bytes; the extension only adds a note when it names a different corpus format. */
export function detectFormat(bytes: Uint8Array, ext: string): { format: Format; note?: string } {
  const format = fromBytes(bytes);
  const claimed = ext.replace(/^\./, "").toLowerCase();
  if ((claimed === "wk1" || claimed === "wks" || claimed === "dbf") && claimed !== format) {
    return { format, note: `extension says ${claimed}` };
  }
  return { format };
}

/** Files under `path` (or `path` itself if it is a file), depth-first in sorted name order. Symlinks inside folders are skipped. */
export async function* walk(path: string): AsyncIterable<string> {
  if (!(await stat(path)).isDirectory()) {
    yield path;
    return;
  }
  const entries = (await readdir(path, { withFileTypes: true })).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
  for (const e of entries) {
    if (e.isDirectory()) yield* walk(join(path, e.name));
    else if (e.isFile()) yield join(path, e.name);
  }
}

export async function inventoryFile(path: string): Promise<Entry> {
  const bytes = new Uint8Array(await readFile(path));
  return {
    path,
    ...detectFormat(bytes, extname(path)),
    size: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}

export function formatLine(e: Entry): string {
  return [e.path, e.format, e.size, e.sha256, ...(e.note ? [`(${e.note})`] : [])].join("\t");
}
