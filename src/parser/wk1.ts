// Lotus 1-2-3 WKS/WK1 record parser. Pure: bytes in, sheet + diagnostics + stats out.
// Record layouts: .kiro/steering/lotus-format.md. Never throws; every read is bounds-checked.

import { DiagnosticSink, type Diagnostic } from "./diagnostics.ts";
import { ByteReader } from "./reader.ts";
import { a1 } from "./address.ts";
import { cellKey, type Cell, type LabelPrefix, type Sheet } from "./sheet.ts";

export type Wk1Stats = {
  records: number;
  cells: number;
  formulas: number;
  labels: number;
  numbers: number;
  skippedRecords: number;
  skippedByOpcode: Record<number, number>;
  bytesRead: number;
};

export type Wk1ParseResult = { sheet: Sheet; diagnostics: Diagnostic[]; stats: Wk1Stats };

const BOF = 0x0000;
const EOF = 0x0001;
const DIMENSIONS = 0x0006;
const INTEGER = 0x000d;
const NUMBER = 0x000e;
const LABEL = 0x000f;
const FORMULA = 0x0010;

const CELL_RECORDS = new Map<number, string>([
  [INTEGER, "INTEGER"],
  [NUMBER, "NUMBER"],
  [LABEL, "LABEL"],
  [FORMULA, "FORMULA"],
]);

const LABEL_PREFIXES: ReadonlySet<string> = new Set<LabelPrefix>(["'", '"', "^", "\\", "|"]);

/** Last column (IV) and row (8192) of the WK1 grid, 0-based. */
const MAX_COL = 255;
const MAX_ROW = 8191;

const VERSION_WKS = 0x0404;
const VERSION_WK1 = 0x0406;

function hex(n: number): string {
  return `0x${n.toString(16).padStart(4, "0")}`;
}

/** Decodes a cell body: format u8 (not modelled), col u16, row u16, then the value. Null if short. */
function decodeCell(opcode: number, body: ByteReader): Cell | null {
  const format = body.u8();
  const col = body.u16();
  const row = body.u16();
  if (format === null || col === null || row === null) return null;
  if (opcode === INTEGER) {
    const value = body.i16();
    return value === null ? null : { kind: "integer", col, row, value };
  }
  if (opcode === NUMBER) {
    const value = body.f64();
    return value === null ? null : { kind: "number", col, row, value };
  }
  if (opcode === LABEL) {
    const prefix = body.u8();
    return prefix === null ? null : { kind: "label", col, row, prefix: String.fromCharCode(prefix), text: latin1UpToNul(body) };
  }
  if (opcode === FORMULA) {
    const cached = body.f64();
    const rpnLen = body.u16();
    const rpn = rpnLen === null ? null : body.slice(rpnLen);
    return cached === null || rpn === null ? null : { kind: "formula", col, row, cached, rpn };
  }
  return null;
}

/** Bytes up to the first 0x00 or the end, one char per byte. No TextDecoder, so every runtime agrees. */
function latin1UpToNul(body: ByteReader): string {
  let text = "";
  let chunk: number[] = [];
  for (let b = body.u8(); b !== null && b !== 0; b = body.u8()) {
    chunk.push(b);
    if (chunk.length === 4096) {
      text += String.fromCharCode(...chunk);
      chunk = [];
    }
  }
  return text + String.fromCharCode(...chunk);
}

export function parseWk1(bytes: Uint8Array): Wk1ParseResult {
  const sheet: Sheet = { format: "unknown", version: null, sawEof: false, declaredDimensions: null, cells: new Map() };
  const stats: Wk1Stats = {
    records: 0,
    cells: 0,
    formulas: 0,
    labels: 0,
    numbers: 0,
    skippedRecords: 0,
    skippedByOpcode: {},
    bytesRead: 0,
  };
  const sink = new DiagnosticSink();
  const input = new ByteReader(bytes);
  let truncated = false;
  const seenSkipped = new Set<number>();

  while (input.remaining() > 0) {
    const offset = input.pos;
    const opcode = input.u16();
    const length = input.u16();
    if (opcode === null || length === null) {
      sink.add({ severity: "error", code: "truncated-record", offset, message: `record header at ${offset} is cut short` });
      truncated = true;
      input.pos = offset;
      break;
    }
    const body = input.sub(length);
    if (body === null) {
      sink.add({
        severity: "error",
        code: "truncated-record",
        offset,
        opcode,
        message: `record ${hex(opcode)} at ${offset} says ${length} body bytes but ${input.remaining()} remain`,
      });
      truncated = true;
      input.pos = offset;
      break;
    }
    stats.records++;
    const first = stats.records === 1;
    if (first && opcode !== BOF) {
      sink.add({ severity: "error", code: "missing-bof", offset, message: `first record is ${hex(opcode)}, not BOF` });
    }

    if (opcode === EOF) {
      sheet.sawEof = true;
      const left = input.remaining();
      if (left > 0) {
        sink.add({ severity: "info", code: "trailing-bytes", offset: input.pos, message: `${left} bytes after EOF` });
      }
      break;
    }
    const shortRecord = (name: string) =>
      sink.add({ severity: "error", code: "short-record", offset, opcode, message: `${name} body of ${length} bytes is too short` });

    if (opcode === BOF && first) {
      const version = body.u16();
      if (version === null) {
        shortRecord("BOF");
        continue;
      }
      sheet.version = version;
      if (version === VERSION_WKS) sheet.format = "wks";
      else if (version === VERSION_WK1) sheet.format = "wk1";
      else {
        sink.add({ severity: "warning", code: "unknown-version", offset, message: `unknown BOF version ${hex(version)}` });
      }
    } else if (opcode === DIMENSIONS) {
      const [firstCol, firstRow, lastCol, lastRow] = [body.u16(), body.u16(), body.u16(), body.u16()];
      if (firstCol === null || firstRow === null || lastCol === null || lastRow === null) {
        shortRecord("DIMENSIONS");
        continue;
      }
      sheet.declaredDimensions = { firstCol, firstRow, lastCol, lastRow };
    } else {
      const cellName = CELL_RECORDS.get(opcode);
      if (cellName) {
        const cell = decodeCell(opcode, body);
        if (cell === null) {
          shortRecord(cellName);
          continue;
        }
        const where = a1(cell.col, cell.row);
        stats.cells++;
        if (cell.kind === "integer" || cell.kind === "number") stats.numbers++;
        if (cell.kind === "formula") stats.formulas++;
        if (cell.kind === "label") {
          stats.labels++;
          if (!LABEL_PREFIXES.has(cell.prefix)) {
            const byte = hex(cell.prefix.charCodeAt(0));
            sink.add({ severity: "warning", code: "unknown-label-prefix", offset, opcode, message: `label at ${where} has prefix byte ${byte}` });
          }
        }
        if (cell.col > MAX_COL || cell.row > MAX_ROW) {
          sink.add({ severity: "warning", code: "address-out-of-range", offset, opcode, message: `${where} is outside the WK1 grid A1:IV8192` });
        }
        const key = cellKey(cell.col, cell.row);
        if (sheet.cells.has(key)) {
          sink.add({ severity: "warning", code: "duplicate-cell", offset, opcode, message: `${where} appears again; the later record wins` });
        }
        sheet.cells.set(key, cell);
      } else {
        stats.skippedRecords++;
        stats.skippedByOpcode[opcode] = (stats.skippedByOpcode[opcode] ?? 0) + 1;
        if (!seenSkipped.has(opcode)) {
          seenSkipped.add(opcode);
          sink.add({ severity: "info", code: "skipped-opcode", offset, opcode, message: `skipped record ${hex(opcode)}` });
        }
      }
    }
  }

  if (stats.records === 0) {
    sink.add({ severity: "error", code: "missing-bof", offset: 0, message: "no complete record, so no BOF" });
  }
  if (!sheet.sawEof && !truncated) {
    sink.add({ severity: "warning", code: "missing-eof", offset: input.pos, message: "input ends without an EOF record" });
  }
  stats.bytesRead = input.pos;
  return { sheet, diagnostics: sink.list, stats };
}
