// The verify worker's message protocol (requirements 7 to 11). handleVerifyRequest is a plain
// function, so it runs in Node without a worker; installVerifyWorker wires it to a worker scope.
// The raise protocol below (Seance UI requirements 16 to 18) is the same idea for the browser app:
// it also returns the parsed sheet, as a plain cell list, and the file's SHA-256.
import {
  cellKey,
  cellsInRowMajorOrder,
  parseWorkbook,
  type Cell,
  type DbfTable,
  type Diagnostic,
  type Sheet,
  type SheetFormat,
  type Workbook,
  type WorkbookParseResult,
  type WorkbookStats,
} from "../parser/index.ts";
import { verifyBytes, verifyWorkbook, type SheetVerification, type VerifyBytesResult } from "../verify/index.ts";
import { sha256Hex } from "./hash.ts";

export type VerifyRequest = { type: "verify"; id: number; name?: string; bytes: ArrayBuffer };

export type VerifyResponse = { type: "result"; id: number; result: VerifyBytesResult } | { type: "error"; id: number | null; message: string };

/** The part of a worker scope the handler needs, so a test can pass a fake one. */
export type WorkerScopeLike = { onmessage: ((event: { data: unknown }) => void) | null; postMessage(message: VerifyResponse): void };

/** Answers every message on the scope with handleVerifyRequest, in arrival order. */
export function installVerifyWorker(scope: WorkerScopeLike): void {
  scope.onmessage = (event) => scope.postMessage(handleVerifyRequest(event.data));
}

type Verify =(bytes: Uint8Array, name?: string) => VerifyBytesResult;

const field = (request: unknown, key: string): unknown => (typeof request === "object" && request !== null ? (request as Record<string, unknown>)[key] : undefined);

/** Validates the shape, verifies the bytes, and always answers (requirement 11). */
export function handleVerifyRequest(request: unknown, verify: Verify = verifyBytes): VerifyResponse {
  const rawId = field(request, "id");
  const id = typeof rawId === "number" && Number.isInteger(rawId) ? rawId : null;
  const error = (message: string): VerifyResponse => ({ type: "error", id, message });
  if (id === null) return error("The request has no whole-number id.");
  if (field(request, "type") !== "verify") return error('The request type is not "verify".');
  const bytes = field(request, "bytes");
  if (!(bytes instanceof ArrayBuffer)) return error("The request carries no file bytes (an ArrayBuffer).");
  const name = field(request, "name");
  if (name !== undefined && typeof name !== "string") return error("The request name is not text.");
  // The one try/catch of the feature: the core does not throw, this only guards against a bug.
  try {
    return { type: "result", id, result: verify(new Uint8Array(bytes), name ?? "") };
  } catch (e) {
    return error(`Verification failed unexpectedly: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ---------------------------------------------------------------------------------------------
// Raise protocol (Seance UI requirements 16 to 18).

export type RaiseRequest = { type: "raise"; id: number; name: string; bytes: ArrayBuffer };
export type RaiseProgress = { type: "progress"; id: number; step: "read" | "check" };

/** A Sheet with its cells as an array in row-major order: structured-clone data, no Map. */
export type WireSheet = Omit<Sheet, "cells"> & { cells: Cell[] };

/** One sheet of a raised file: `name` is the sheet name, `verification.name` the file name. */
export type RaisedSheet = { name: string; sheet: WireSheet; verification: SheetVerification };

export type RaisedFile = {
  name: string;
  byteLength: number;
  /** Lowercase hex, or null when Web Crypto is missing (http on a host other than localhost). */
  sha256: string | null;
  /** The workbook format. */
  format: SheetFormat;
  diagnostics: Diagnostic[];
  /** At least one for wk1, wks and unknown input. */
  sheets: RaisedSheet[];
  /** DBF only: the table header, for the meta line and the report. */
  table?: DbfTable;
  stats: WorkbookStats;
};

export type RaiseResponse = RaiseProgress | { type: "raised"; id: number; file: RaisedFile } | { type: "error"; id: number | null; message: string };

/** The real parser, engine and hash by default; a test passes a throwing one. */
export type RaiseDeps = {
  parse?: (bytes: Uint8Array) => WorkbookParseResult;
  verify?: (workbook: Workbook, name: string) => SheetVerification[];
  hash?: (bytes: Uint8Array) => Promise<string>;
};

export type RaiseScopeLike = { onmessage: ((event: { data: unknown }) => void) | null; postMessage(message: RaiseResponse): void };

export function sheetToWire(sheet: Sheet): WireSheet {
  return { format: sheet.format, version: sheet.version, sawEof: sheet.sawEof, declaredDimensions: sheet.declaredDimensions, cells: cellsInRowMajorOrder(sheet) };
}

export function sheetFromWire(wire: WireSheet): Sheet {
  const { cells, ...rest } = wire;
  return { ...rest, cells: new Map(cells.map((c) => [cellKey(c.col, c.row), c])) };
}

/** Answers every raise message on the scope with handleRaiseRequest. */
export function installRaiseWorker(scope: RaiseScopeLike): void {
  scope.onmessage = (event) => void handleRaiseRequest(event.data, (m) => scope.postMessage(m));
}

/** Validates the shape, parses (posts read), verifies (posts check), hashes, posts raised. Never throws. */
export async function handleRaiseRequest(request: unknown, post: (m: RaiseResponse) => void, deps: RaiseDeps = {}): Promise<void> {
  const { parse = parseWorkbook, verify = verifyWorkbook, hash = sha256Hex } = deps;
  const rawId = field(request, "id");
  const id = typeof rawId === "number" && Number.isInteger(rawId) ? rawId : null;
  const error = (text: string) => post({ type: "error", id, message: text });
  if (id === null) return error("The request has no whole-number id.");
  if (field(request, "type") !== "raise") return error('The request type is not "raise".');
  const buffer = field(request, "bytes");
  if (!(buffer instanceof ArrayBuffer)) return error("The request carries no file bytes (an ArrayBuffer).");
  const name = field(request, "name");
  if (typeof name !== "string") return error("The request name is not text.");
  try {
    const bytes = new Uint8Array(buffer);
    const parsed = parse(bytes);
    const { workbook, diagnostics, stats } = parsed;
    post({ type: "progress", id, step: "read" });
    const verifications = verify(workbook, name);
    const sheets = workbook.sheets.map((s, i) => ({ name: s.name, sheet: sheetToWire(s.sheet), verification: verifications[i]! }));
    post({ type: "progress", id, step: "check" });
    let sha256: string | null;
    try {
      sha256 = await hash(bytes);
    } catch {
      sha256 = null;
    }
    const file: RaisedFile = { name, byteLength: bytes.byteLength, sha256, format: workbook.format, diagnostics, sheets, stats };
    if (parsed.kind === "dbf") file.table = parsed.table;
    post({ type: "raised", id, file });
  } catch (e) {
    error(`Raising failed unexpectedly: ${e instanceof Error ? e.message : String(e)}`);
  }
}
