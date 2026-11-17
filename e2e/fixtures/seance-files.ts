// Small files for the Seance e2e specs, built from scripts/lib/wk1-writer.ts so every expected
// value comes from the bytes written here (design.md "Test strategy").
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { bof, writeWk1 } from "../../scripts/lib/wk1-writer.ts";

const WK1 = 0x0406;
const REF = 0x01;
const RET = 0x03;
const ADD = 0x09;
const MUL = 0x0b;
const u16 = (v: number) => [v & 0xff, (v >> 8) & 0xff];
const ref = (dc: number, dr: number) => [REF, ...u16(0x8000 | (dc & 0x3fff)), ...u16(0x8000 | (dr & 0x3fff))];

/** A1 = 2, B1 = 3, C1 = +A1+B1 stored as 6 (the engine computes 5); A2 and B2 match. */
export function mismatchWk1(): Uint8Array {
  return writeWk1(WK1, [
    { kind: "integer", col: 0, row: 0, value: 2 },
    { kind: "integer", col: 1, row: 0, value: 3 },
    { kind: "formula", col: 2, row: 0, cached: 6, rpn: [...ref(-2, 0), ...ref(-1, 0), ADD, RET] },
    { kind: "formula", col: 0, row: 1, cached: 6, rpn: [...ref(0, -1), ...ref(1, -1), MUL, RET] },
    { kind: "formula", col: 1, row: 1, cached: 5, rpn: [...ref(-1, -1), ...ref(0, -1), ADD, RET] },
  ]);
}

/** Opcode 0xFE is in no table of src/formula/opcodes.ts (checked by tests/unit/e2e/seance-files.test.ts). */
export const UNKNOWN_OPCODE = 0xfe;
export const UNKNOWN_RPN = [UNKNOWN_OPCODE, RET] as const;

/** mismatch.wk1 plus D1, a formula with an unknown opcode: C1 mismatched, D1 unverifiable. */
export function mixedStatusWk1(): Uint8Array {
  return writeWk1(WK1, [
    { kind: "integer", col: 0, row: 0, value: 2 },
    { kind: "integer", col: 1, row: 0, value: 3 },
    { kind: "formula", col: 2, row: 0, cached: 6, rpn: [...ref(-2, 0), ...ref(-1, 0), ADD, RET] },
    { kind: "formula", col: 3, row: 0, cached: 1, rpn: UNKNOWN_RPN },
    { kind: "formula", col: 0, row: 1, cached: 6, rpn: [...ref(0, -1), ...ref(1, -1), MUL, RET] },
    { kind: "formula", col: 1, row: 1, cached: 5, rpn: [...ref(-1, -1), ...ref(0, -1), ADD, RET] },
  ]);
}

/** A valid WK1 BOF, then a NUMBER record that claims 13 bytes and holds 3: format wk1, no cell, an error. */
export function corruptWk1(): Uint8Array {
  return Uint8Array.from([...bof(WK1), 0x0e, 0x00, 0x0d, 0x00, 0xff, 0x00, 0x00]);
}

export const NOT_LOTUS = "This is a plain text file, not a worksheet.\n";

export type Payload = { name: string; mimeType: string; buffer: Buffer };

export const payload = (name: string, bytes: Uint8Array | string): Payload => ({
  name,
  mimeType: "application/octet-stream",
  buffer: Buffer.from(bytes),
});

export const files = {
  mismatch: () => payload("mismatch.wk1", mismatchWk1()),
  mixedStatus: () => payload("mixed-status.wk1", mixedStatusWk1()),
  corrupt: () => payload("corrupt.wk1", corruptWk1()),
  notLotus: () => payload("not-lotus.txt", NOT_LOTUS),
};

/** Writes the payloads into a new temporary folder and returns its path. */
export function writeFolder(parts: readonly Payload[]): string {
  const dir = mkdtempSync(join(tmpdir(), "seance-"));
  for (const p of parts) writeFileSync(join(dir, p.name), p.buffer);
  return dir;
}
