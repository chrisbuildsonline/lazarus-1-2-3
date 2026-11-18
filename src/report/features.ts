// Unknown opcodes and unsupported features, read out of reason messages in the fixed forms the
// verify helpers write (requirements 35 to 37). A message that does not match gives null.
import type { ReasonCode } from "../verify/index.ts";
import type { ReportRow, UnknownOpcodeEntry, UnsupportedFeatureEntry } from "./types.ts";

const OPCODE = /opcode (0x[0-9A-F]{2}) at offset \d+/;
const FUNCTION = /uses @([^\s,]+)/;
const MAX_ADDRESSES = 50;
const FEATURE_CODES: ReadonlySet<ReasonCode> = new Set(["unsupported-function", "volatile-function", "undocumented-semantics", "decode-error", "string-result", "circular-reference", "wk3-formula-not-decoded"]);

const cmp = (a: string | null, b: string | null) => (a ?? "").localeCompare(b ?? "", "en");

/** Rows arrive in row-major order, so the kept addresses are the first in row-major order. */
function group<T extends { count: number; addresses: string[] }>(rows: readonly ReportRow[], keyOf: (r: ReportRow) => string | null, make: (r: ReportRow) => T): T[] {
  const groups = new Map<string, T>();
  for (const r of rows) {
    const key = keyOf(r);
    if (key === null) continue;
    let g = groups.get(key);
    if (!g) groups.set(key, (g = make(r)));
    g.count++;
    if (g.addresses.length < MAX_ADDRESSES) g.addresses.push(r.address);
  }
  return [...groups.values()];
}

export function unknownOpcodes(rows: readonly ReportRow[]): UnknownOpcodeEntry[] {
  const opcode = (r: ReportRow) => OPCODE.exec(r.reason.message)?.[1] ?? null;
  return group(rows, (r) => (r.reason.code === "unknown-opcode" ? String(opcode(r)) : null), (r) => ({ opcode: opcode(r), count: 0, addresses: [] }))
    .sort((a, b) => (a.opcode === null ? 1 : b.opcode === null ? -1 : cmp(a.opcode, b.opcode)));
}

export function unsupportedFeatures(rows: readonly ReportRow[]): UnsupportedFeatureEntry[] {
  const name = (r: ReportRow) => FUNCTION.exec(r.reason.message)?.[1] ?? null;
  return group(rows, (r) => (FEATURE_CODES.has(r.reason.code) ? JSON.stringify([r.reason.code, r.reason.rule ?? null, name(r)]) : null), (r) => ({ code: r.reason.code, rule: r.reason.rule ?? null, name: name(r), count: 0, addresses: [] }))
    .sort((a, b) => cmp(a.code, b.code) || cmp(a.rule, b.rule) || cmp(a.name, b.name));
}
