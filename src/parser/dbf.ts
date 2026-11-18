// dBase III/IV table reader. Pure: bytes in, one sheet "Table" + table header + diagnostics + stats out.
// Layout: .kiro/specs/wk3-dbf-readers/design.md "Header and fields" and evidence.md. Never throws.
// Row 0 holds the field names; data row n (1-based) is live record n. Values are kept as read.

import { DiagnosticSink, type Diagnostic } from "./diagnostics.ts";
import { cellKey, type Cell, type Sheet, type Workbook } from "./sheet.ts";

export type DbfField = { name: string; type: string; length: number; decimals: number };
export type DbfTable = {
  version: number;
  lastUpdate: { year: number; month: number; day: number };
  declaredRecords: number;
  headerLength: number;
  recordLength: number;
  codePage: number;
  fields: DbfField[];
};
export type DbfStats = {
  records: number;
  deletedRecords: number;
  fields: number;
  headerCells: number;
  cells: number;
  labels: number;
  numbers: number;
  otherTyped: number;
  blankCells: number;
  unreadableCells: number;
  bytesRead: number;
};
export type DbfParseResult = { workbook: Workbook; diagnostics: Diagnostic[]; stats: DbfStats; table: DbfTable };

/** Excel's row limit minus the header row. */
export const DBF_ROW_LIMIT = 1_048_575;
const MAX_FIELDS = 255;
const TERMINATOR = 0x0d;
const DELETED = 0x2a;
const END_OF_FILE = 0x1a;
const NUMBER_TEXT = /^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/;

/** One char per byte, no TextDecoder, so every runtime agrees. */
function latin1(bytes: Uint8Array, start: number, end: number): string {
  let s = "";
  for (let i = start; i < end; i++) s += String.fromCharCode(bytes[i]!);
  return s;
}
const trimEnd = (s: string) => s.replace(/[ \0]+$/, "");
const trimBoth = (s: string) => trimEnd(s).replace(/^[ \0]+/, "");

export function parseDbf(bytes: Uint8Array, options: { rowLimit?: number } = {}): DbfParseResult {
  const rowLimit = options.rowLimit ?? DBF_ROW_LIMIT;
  const sink = new DiagnosticSink();
  const stats: DbfStats = {
    records: 0,
    deletedRecords: 0,
    fields: 0,
    headerCells: 0,
    cells: 0,
    labels: 0,
    numbers: 0,
    otherTyped: 0,
    blankCells: 0,
    unreadableCells: 0,
    bytesRead: 0,
  };
  const table: DbfTable = {
    version: 0,
    lastUpdate: { year: 1900, month: 0, day: 0 },
    declaredRecords: 0,
    headerLength: 0,
    recordLength: 0,
    codePage: 0,
    fields: [],
  };
  const sheet: Sheet = { format: "dbf", version: null, sawEof: false, declaredDimensions: null, cells: new Map() };
  const done = (sheets: boolean): DbfParseResult => ({
    workbook: { format: "dbf", sheets: sheets ? [{ name: "Table", sheet }] : [] },
    diagnostics: sink.list,
    stats,
    table,
  });
  const badHeader = (offset: number, message: string) => sink.add({ severity: "error", code: "bad-header", offset, message });

  if (bytes.length < 32) {
    badHeader(0, `a dBase header needs 32 bytes, the input has ${bytes.length}`);
    stats.bytesRead = 0;
    return done(false);
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  table.version = bytes[0]!;
  table.lastUpdate = { year: 1900 + bytes[1]!, month: bytes[2]!, day: bytes[3]! };
  table.declaredRecords = view.getUint32(4, true);
  table.headerLength = view.getUint16(8, true);
  table.recordLength = view.getUint16(10, true);
  table.codePage = bytes[29]!;
  sheet.version = table.version;
  stats.bytesRead = 32;
  if (table.codePage !== 0x00 && table.codePage !== 0x03) {
    sink.add({ severity: "info", code: "code-page-not-decoded", offset: 29, message: `code page byte 0x${table.codePage.toString(16).padStart(2, "0")}; text is read as Latin-1` });
  }

  // Field descriptors: 32 bytes each from offset 32, until a 0x0D byte inside the header.
  const headerEnd = Math.min(table.headerLength, bytes.length);
  let terminated = false;
  let p = 32;
  while (p < headerEnd) {
    if (bytes[p] === TERMINATOR) {
      terminated = true;
      break;
    }
    if (p + 32 > headerEnd) break;
    let nameEnd = p;
    while (nameEnd < p + 11 && bytes[nameEnd] !== 0) nameEnd++;
    table.fields.push({ name: latin1(bytes, p, nameEnd), type: String.fromCharCode(bytes[p + 11]!), length: bytes[p + 16]!, decimals: bytes[p + 17]! });
    p += 32;
  }
  stats.fields = table.fields.length;
  stats.bytesRead = Math.max(stats.bytesRead, terminated ? p + 1 : p);

  if (table.headerLength > bytes.length) {
    badHeader(8, `header length ${table.headerLength} is past the end of the ${bytes.length}-byte input`);
    return done(false);
  }
  if (!terminated) {
    badHeader(p, "the field list has no 0x0D terminator before the header ends");
    return done(false);
  }
  if (table.fields.length > MAX_FIELDS) {
    badHeader(32, `${table.fields.length} field descriptors; dBase allows at most ${MAX_FIELDS}`);
    return done(false);
  }
  if (table.recordLength === 0) {
    badHeader(10, "record length is 0");
    return done(false);
  }

  // Header row and per-field plan.
  const fieldSum = table.fields.reduce((n, f) => n + f.length, 0);
  if (fieldSum + 1 !== table.recordLength) {
    sink.add({
      severity: "warning",
      code: "bad-field",
      offset: 10,
      message: `field lengths plus the deletion byte are ${fieldSum + 1}, the header says records are ${table.recordLength} bytes; stepping by ${table.recordLength}`,
    });
  }
  type Plan = { field: DbfField; col: number; start: number; readable: boolean };
  const plans: Plan[] = [];
  let at = 1;
  table.fields.forEach((field, col) => {
    sheet.cells.set(cellKey(col, 0), { kind: "label", col, row: 0, prefix: "'", text: field.name });
    stats.headerCells++;
    let readable = true;
    if (at + field.length > table.recordLength) {
      readable = false;
      sink.add({ severity: "warning", code: "bad-field", offset: 32 + col * 32, message: `field ${field.name} crosses the end of the ${table.recordLength}-byte record; no cells` });
    } else if (!"CNFDLM".includes(field.type) || field.type === "") {
      readable = false;
      const code = field.type.charCodeAt(0);
      sink.add({ severity: "warning", code: "unsupported-field-type", offset: 32 + col * 32 + 11, message: `field ${field.name} has type ${code >= 32 && code < 127 ? field.type : `0x${code.toString(16)}`}, which this version does not read; no cells` });
    }
    if (field.type === "M" && !plans.some((x) => x.field.type === "M")) {
      sink.add({ severity: "warning", code: "memo-not-read", offset: 32 + col * 32 + 11, message: `memo field ${field.name}: the memo text is in a separate file this version does not read; the block number is shown` });
    }
    plans.push({ field, col, start: at, readable });
    at += field.length;
  });

  // Records.
  const available = Math.floor((bytes.length - table.headerLength) / table.recordLength);
  const complete = Math.min(table.declaredRecords, available);
  let row = 0;
  let firstDeleted = 0;
  let pos = table.headerLength;
  let stopped = false;
  for (let i = 0; i < complete; i++) {
    if (row === rowLimit) {
      sink.add({ severity: "error", code: "row-limit", offset: pos, message: `the table declares ${table.declaredRecords} records; only the first ${rowLimit} live records fit in a worksheet` });
      stopped = true;
      break;
    }
    const start = pos;
    pos += table.recordLength;
    stats.records++;
    if (bytes[start] === DELETED) {
      stats.deletedRecords++;
      if (firstDeleted === 0) firstDeleted = i + 1;
      continue;
    }
    row++;
    for (const plan of plans) {
      if (!plan.readable) {
        stats.unreadableCells++;
        continue;
      }
      const raw = latin1(bytes, start + plan.start, start + plan.start + plan.field.length);
      const cell = readValue(plan, raw, row, start + plan.start, sink, stats);
      if (cell === null) stats.blankCells++;
      else {
        stats.cells++;
        sheet.cells.set(cellKey(plan.col, row), cell);
      }
    }
  }
  if (firstDeleted > 0) {
    sink.add({ severity: "info", code: "deleted-record", offset: table.headerLength + (firstDeleted - 1) * table.recordLength, message: `record ${firstDeleted} is marked deleted and is not shown (${stats.deletedRecords} deleted in all)` });
  }
  stats.bytesRead = pos;
  if (stopped) return done(true);
  if (complete < table.declaredRecords) {
    sink.add({ severity: "error", code: "truncated-table", offset: pos, message: `the header declares ${table.declaredRecords} records, the file holds ${complete} complete ones` });
    return done(true);
  }
  if (bytes[pos] === END_OF_FILE) {
    sheet.sawEof = true;
    pos++;
    stats.bytesRead = pos;
  } else {
    sink.add({ severity: "info", code: "missing-eof", offset: pos, message: "no 0x1A end-of-file byte after the last record" });
  }
  if (pos < bytes.length) {
    sink.add({ severity: "info", code: "trailing-bytes", offset: pos, message: `${bytes.length - pos} bytes after the table` });
  }
  return done(true);
}

function readValue(plan: { field: DbfField; col: number }, raw: string, row: number, offset: number, sink: DiagnosticSink, stats: DbfStats): Cell | null {
  const { col, field } = plan;
  if (field.type === "C") {
    stats.labels++;
    return { kind: "label", col, row, prefix: "'", text: trimEnd(raw) };
  }
  const text = trimBoth(raw);
  if (text === "") return null;
  if (field.type === "N" || field.type === "F") {
    if (NUMBER_TEXT.test(text)) {
      stats.numbers++;
      return { kind: "number", col, row, value: Number(text) };
    }
    sink.add({ severity: "warning", code: "invalid-number", offset, message: `field ${field.name} of record row ${row} holds "${text}", not a number; kept as text` });
  }
  stats.otherTyped++;
  return { kind: "label", col, row, prefix: "'", text };
}
