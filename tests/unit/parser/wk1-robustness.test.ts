import { describe, expect, it } from "vitest";
import { bof, eof, writeWk1 } from "../../../scripts/lib/wk1-writer.ts";
import { MAX_DIAGNOSTICS } from "../../../src/parser/diagnostics.ts";
import { parseWk1 } from "../../../src/parser/wk1.ts";
import { concat, rawRecord } from "../helpers/bytes.ts";

const codes = (bytes: Uint8Array) => parseWk1(bytes).diagnostics.map((d) => d.code);

const SAMPLE = writeWk1(0x0406, [
  { kind: "integer", col: 0, row: 0, value: -2 },
  { kind: "number", col: 1, row: 0, value: 0.1 },
  { kind: "label", col: 0, row: 1, prefix: "'", text: "Hi" },
  { kind: "formula", col: 1, row: 1, cached: 43, rpn: [0x01, 0x02, 0x03] },
]);

describe("parseWk1 robustness", () => {
  it("handles empty input", () => {
    const result = parseWk1(new Uint8Array(0));
    expect(result.sheet.cells.size).toBe(0);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["missing-bof", "missing-eof"]);
  });

  for (const n of [1, 2, 3]) {
    it(`reports ${n} bytes as a truncated header with no BOF`, () => {
      const result = parseWk1(new Uint8Array(n));
      expect(result.diagnostics.map((d) => d.code).sort()).toEqual(["missing-bof", "truncated-record"]);
      expect(result.stats.records).toBe(0);
      expect(result.stats.bytesRead).toBe(0);
    });
  }

  it("reports a header whose body is missing as truncated", () => {
    expect(codes(Uint8Array.from([0x00, 0x00, 0x02, 0x00])).sort()).toEqual(["missing-bof", "truncated-record"]);
  });

  it("reports a header-only BOF as short and EOF as missing", () => {
    expect(codes(Uint8Array.from([0x00, 0x00, 0x00, 0x00]))).toEqual(["short-record", "missing-eof"]);
  });

  it("handles all 0xFF", () => {
    const result = parseWk1(new Uint8Array(4096).fill(0xff));
    expect(result.diagnostics.map((d) => d.code).sort()).toEqual(["missing-bof", "truncated-record"]);
    expect(result.sheet.format).toBe("unknown");
  });

  it("terminates on all 0x00, an endless run of empty BOF records", () => {
    const result = parseWk1(new Uint8Array(40000));
    expect(result.stats.records).toBe(10000);
    expect(result.stats.skippedByOpcode).toEqual({ 0: 9999 });
    expect(result.stats.bytesRead).toBe(40000);
    expect(result.diagnostics.length).toBeLessThanOrEqual(MAX_DIAGNOSTICS + 1);
    expect(result.diagnostics.map((d) => d.code)).toEqual(["short-record", "skipped-opcode", "missing-eof"]);
  });

  it("caps diagnostics and keeps counting in stats", () => {
    const shortInteger = rawRecord(0x000d, [0xff, 0, 0, 0, 0]);
    const parts = [bof(0x0406), ...Array.from({ length: 3000 }, () => shortInteger), eof()];
    const result = parseWk1(concat(...parts));
    expect(result.diagnostics).toHaveLength(MAX_DIAGNOSTICS + 1);
    expect(result.diagnostics.at(-1)?.code).toBe("diagnostics-truncated");
    expect(result.stats.records).toBe(3002);
    expect(result.sheet.sawEof).toBe(true);
  });

  it("gives the same result for a subarray with a non-zero offset as for a copy", () => {
    const padded = concat([0xaa, 0xbb, 0xcc], SAMPLE, [0xdd]);
    const view = padded.subarray(3, 3 + SAMPLE.length);
    expect(view.byteOffset).toBe(3);
    expect(parseWk1(view)).toEqual(parseWk1(view.slice()));
    expect(parseWk1(view).sheet.cells.size).toBe(4);
    expect(parseWk1(view).diagnostics).toEqual([]);
  });

  it("does not change the input bytes", () => {
    const before = SAMPLE.slice();
    parseWk1(SAMPLE);
    expect(SAMPLE).toEqual(before);
  });

  it("never throws on any prefix of a valid file", () => {
    const bytes = concat(SAMPLE.subarray(0, SAMPLE.length - 4), rawRecord(0x0018, [1, 2, 3, 4]), eof());
    for (let n = 0; n <= bytes.length; n++) {
      const result = parseWk1(bytes.subarray(0, n));
      expect(result.stats.bytesRead).toBeLessThanOrEqual(n);
    }
  });
});
