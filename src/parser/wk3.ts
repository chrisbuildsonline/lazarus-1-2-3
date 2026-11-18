// Lotus 1-2-3 release 3 (WK3) record parser. Pure: bytes in, workbook + diagnostics + stats out.
// Record table: wk3-records.ts (each entry sourced). Same framing and checks as parseWk1.
// The RPN of formulas is copied, never decoded. Never throws; every read is bounds-checked.

import { a1 } from "./address.ts";
import { DiagnosticSink, type Diagnostic } from "./diagnostics.ts";
import { float80ToDouble } from "./float80.ts";
import { ByteReader } from "./reader.ts";
import { cellKey, type Cell, type LabelPrefix, type NamedSheet, type Sheet, type Workbook } from "./sheet.ts";
import { WK3_BOF, WK3_EOF, WK3_RECORDS, WK3_SHEET_NAME_SUBTYPE, WK3_SMALL_SCALE, WK3_VERSION } from "./wk3-records.ts";

export type Wk3Stats = {
  records: number;
  cells: number;
  formulas: number;
  labels: number;
  numbers: number;
  roundedNumbers: number;
  sheets: number;
  skippedRecords: number;
  skippedByOpcode: Record<number, number>;
  bytesRead: number;
};
export type Wk3ParseResult = { workbook: Workbook; diagnostics: Diagnostic[]; stats: Wk3Stats };

const LABEL_PREFIXES: ReadonlySet<string> = new Set<LabelPrefix>(["'", '"', "^", "\\", "|"]);
const MAX_ROW = 8191;

const hex = (n: number) => `0x${n.toString(16).padStart(4, "0")}`;
/** Lotus sheet letter for an index: 0 is A, 25 is Z, 26 is AA, 255 is IV. */
export const sheetLetter = (index: number) => a1(index, 0).slice(0, -1);

function latin1UpToNul(body: ByteReader): string {
  const codes: number[] = [];
  for (let b = body.u8(); b !== null && b !== 0; b = body.u8()) codes.push(b);
  let text = "";
  for (let i = 0; i < codes.length; i += 4096) text += String.fromCharCode(...codes.slice(i, i + 4096));
  return text;
}

function smallValue(word: number): { kind: "integer" | "number"; value: number } {
  if ((word & 1) === 0) return { kind: "integer", value: word >> 1 };
  const scale = WK3_SMALL_SCALE[(word >> 1) & 7]!;
  const mantissa = word >> 4;
  return { kind: "number", value: scale > 0 ? mantissa * scale : mantissa / -scale };
}

export function parseWk3(bytes: Uint8Array): Wk3ParseResult {
  const stats: Wk3Stats = { records: 0, cells: 0, formulas: 0, labels: 0, numbers: 0, roundedNumbers: 0, sheets: 0, skippedRecords: 0, skippedByOpcode: {}, bytesRead: 0 };
  const sink = new DiagnosticSink();
  const input = new ByteReader(bytes);
  const sheets = new Map<number, Sheet>();
  const names = new Map<number, string>();
  const seenSkipped = new Set<number>();
  let version: number | null = null;
  let sawEof = false;
  let truncated = false;

  const sheetAt = (index: number): Sheet => {
    let s = sheets.get(index);
    if (!s) {
      s = { format: "wk3", version, sawEof: false, declaredDimensions: null, cells: new Map() };
      sheets.set(index, s);
    }
    return s;
  };
  const skip = (opcode: number, offset: number) => {
    stats.skippedRecords++;
    stats.skippedByOpcode[opcode] = (stats.skippedByOpcode[opcode] ?? 0) + 1;
    if (!seenSkipped.has(opcode)) {
      seenSkipped.add(opcode);
      sink.add({ severity: "info", code: "skipped-opcode", offset, opcode, message: `skipped record ${hex(opcode)}` });
    }
  };
  /** 10-byte value to a double; counts and reports (once per file) a value that had to be rounded. */
  const read80 = (body: ByteReader, where: string, offset: number): number | null => {
    const raw = body.slice(10);
    if (raw === null) return null;
    const { value, exact } = float80ToDouble(raw);
    if (!exact) {
      if (stats.roundedNumbers === 0) {
        sink.add({ severity: "info", code: "value-rounded", offset, message: `${where} stores a 10-byte number a double cannot hold exactly; it was rounded to the nearest double` });
      }
      stats.roundedNumbers++;
    }
    return value;
  };

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
      sink.add({ severity: "error", code: "truncated-record", offset, opcode, message: `record ${hex(opcode)} at ${offset} says ${length} body bytes but ${input.remaining()} remain` });
      truncated = true;
      input.pos = offset;
      break;
    }
    stats.records++;
    const first = stats.records === 1;
    if (first && opcode !== WK3_BOF) sink.add({ severity: "error", code: "missing-bof", offset, message: `first record is ${hex(opcode)}, not BOF` });
    if (opcode === WK3_EOF) {
      sawEof = true;
      if (input.remaining() > 0) sink.add({ severity: "info", code: "trailing-bytes", offset: input.pos, message: `${input.remaining()} bytes after EOF` });
      break;
    }
    const shortRecord = (name: string) => sink.add({ severity: "error", code: "short-record", offset, opcode, message: `${name} body of ${length} bytes is too short` });

    if (opcode === WK3_BOF && first) {
      version = body.u16();
      if (version === null) {
        shortRecord("BOF");
      } else if (version !== WK3_VERSION) {
        sink.add({ severity: "warning", code: "unknown-version", offset, message: `unknown WK3 BOF version ${hex(version)}` });
      }
      continue;
    }
    const entry = WK3_RECORDS.get(opcode);
    if (!entry) {
      skip(opcode, offset);
      continue;
    }
    if (entry.decoder === "names") {
      const subtype = body.u16();
      if (subtype !== WK3_SHEET_NAME_SUBTYPE) {
        if (subtype === null) shortRecord(entry.name);
        else skip(opcode, offset);
        continue;
      }
      const index = body.u16();
      if (index === null) {
        shortRecord(entry.name);
        continue;
      }
      names.set(index, latin1UpToNul(body));
      sheetAt(index);
      continue;
    }

    const row = body.u16();
    const sheetIndex = body.u8();
    const col = body.u8();
    if (row === null || sheetIndex === null || col === null) {
      shortRecord(entry.name);
      continue;
    }
    const where = `${names.get(sheetIndex) ?? sheetLetter(sheetIndex)}!${a1(col, row)}`;
    let cell: Cell | null = null;
    if (entry.decoder === "label") {
      const prefix = body.u8();
      if (prefix !== null) cell = { kind: "label", col, row, prefix: String.fromCharCode(prefix), text: latin1UpToNul(body) };
    } else if (entry.decoder === "small") {
      const word = body.i16();
      if (word !== null) cell = { ...smallValue(word), col, row };
    } else if (entry.decoder === "number80") {
      const value = read80(body, where, offset);
      if (value !== null) cell = { kind: "number", col, row, value };
    } else {
      const cached = read80(body, where, offset);
      const rpn = body.slice(body.remaining());
      if (cached !== null && rpn !== null) cell = { kind: "formula", col, row, cached, rpn };
    }
    if (cell === null) {
      shortRecord(entry.name);
      continue;
    }
    stats.cells++;
    if (cell.kind === "label") {
      stats.labels++;
      if (!LABEL_PREFIXES.has(cell.prefix)) {
        sink.add({ severity: "warning", code: "unknown-label-prefix", offset, opcode, message: `label at ${where} has prefix byte ${hex(cell.prefix.charCodeAt(0))}` });
      }
    } else if (cell.kind === "formula") stats.formulas++;
    else stats.numbers++;
    if (row > MAX_ROW) sink.add({ severity: "warning", code: "address-out-of-range", offset, opcode, message: `${where} is outside the WK3 grid A1:IV8192` });
    const sheet = sheetAt(sheetIndex);
    const key = cellKey(col, row);
    if (sheet.cells.has(key)) sink.add({ severity: "warning", code: "duplicate-cell", offset, opcode, message: `${where} appears again; the later record wins` });
    sheet.cells.set(key, cell);
  }

  if (stats.records === 0) sink.add({ severity: "error", code: "missing-bof", offset: 0, message: "no complete record, so no BOF" });
  if (!sawEof && !truncated) sink.add({ severity: "warning", code: "missing-eof", offset: input.pos, message: "input ends without an EOF record" });
  stats.bytesRead = input.pos;

  const taken = new Set<string>();
  const named: NamedSheet[] = [];
  for (const index of [...sheets.keys()].sort((a, b) => a - b)) {
    const sheet = sheets.get(index)!;
    sheet.version = version;
    sheet.sawEof = sawEof;
    const base = names.get(index) || sheetLetter(index);
    let name = base;
    for (let n = 2; taken.has(name); n++) name = `${base} ${n}`;
    if (name !== base) sink.add({ severity: "warning", code: "duplicate-sheet-name", offset: 0, message: `two sheets are named ${base}; sheet ${index + 1} is shown as ${name}` });
    taken.add(name);
    named.push({ name, sheet });
  }
  stats.sheets = named.length;
  return { workbook: { format: "wk3", sheets: named }, diagnostics: sink.list, stats };
}
