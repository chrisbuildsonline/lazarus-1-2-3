// A RaisedFile from real bytes through the worker's handler, as the app receives it, and hand-built
// cell results for the view-model tests.
import { readFileSync } from "node:fs";
import type { Cell } from "../../../src/parser/index.ts";
import { TOLERANCE, type CellResult, type Status } from "../../../src/verify/index.ts";
import { totals } from "../../../src/verify/report.ts";
import { handleRaiseRequest, type RaisedFile } from "../../../src/workers/verify-protocol.ts";

export async function raiseBytes(bytes: Uint8Array, name: string): Promise<RaisedFile> {
  let file: RaisedFile | null = null;
  await handleRaiseRequest({ type: "raise", id: 1, name, bytes: bytes.slice().buffer }, (m) => {
    if (m.type === "raised") file = m.file;
  });
  if (!file) throw new Error(`${name} was not raised`);
  return file;
}

export const raiseFixture = (path: string): Promise<RaisedFile> => raiseBytes(new Uint8Array(readFileSync(path)), path.split("/").pop()!);

const REASON = { matched: "exact", mismatched: "value-differs", unverifiable: "unknown-opcode" } as const;

/** A formula cell's result with cached and recalculated numbers; override any field. */
export function cellResult(col: number, row: number, address: string, status: Status, cached: number | null, more: Partial<CellResult> = {}): CellResult {
  return {
    address,
    col,
    row,
    status,
    cached: cached === null ? null : { t: "num", v: cached },
    recalculated: { t: "num", v: 5 },
    reason: { code: REASON[status], message: "m" },
    formula: "A1+B1",
    lotusFormula: "+A1+B1",
    candidateOpcodes: [],
    ...more,
  };
}

/** A sheet of hand-built cells with their results, shaped like the worker's answer. */
export function handBuilt(cells: Cell[], results: CellResult[], name = "hand.wk1"): RaisedFile {
  return {
    name,
    byteLength: 0,
    sha256: null,
    format: "wk1",
    diagnostics: [],
    sheets: [
      {
        name: "Sheet1",
        sheet: { format: "wk1", version: 0x406, sawEof: true, declaredDimensions: null, cells },
        verification: { name, format: "wk1", tolerance: { ...TOLERANCE }, cells: results, totals: totals(results) },
      },
    ],
    stats: { records: 0, cells: cells.length, formulas: 0, labels: 0, numbers: 0, skippedRecords: 0, skippedByOpcode: {}, bytesRead: 0 },
  };
}
