// Lotus 1-2-3 WKS/WK1 record parser. Pure: bytes in, sheet + diagnostics + stats out.
// Record layouts: .kiro/steering/lotus-format.md. Never throws; every read is bounds-checked.

import { DiagnosticSink, type Diagnostic } from "./diagnostics.ts";
import { ByteReader } from "./reader.ts";
import type { Sheet } from "./sheet.ts";

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

const VERSION_WKS = 0x0404;
const VERSION_WK1 = 0x0406;

function hex(n: number): string {
  return `0x${n.toString(16).padStart(4, "0")}`;
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
    const shortRecord = (name: string, needs: number) =>
      sink.add({ severity: "error", code: "short-record", offset, opcode, message: `${name} body is ${length} bytes, needs ${needs}` });

    if (opcode === BOF && first) {
      const version = body.u16();
      if (version === null) {
        shortRecord("BOF", 2);
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
        shortRecord("DIMENSIONS", 8);
        continue;
      }
      sheet.declaredDimensions = { firstCol, firstRow, lastCol, lastRow };
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
