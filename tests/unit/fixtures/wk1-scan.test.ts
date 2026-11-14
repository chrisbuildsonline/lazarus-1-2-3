import { describe, expect, it } from "vitest";
import { scanWk1 } from "../helpers/wk1-scan.ts";

// Hand-written WK1 bytes: opcode u16 LE, length u16 LE, body.
const SAMPLE = new Uint8Array([
  // BOF, version 0x0406
  0x00, 0x00, 0x02, 0x00, 0x06, 0x04,
  // INTEGER A1 = -2: format, col 0, row 0, int16
  0x0d, 0x00, 0x07, 0x00, 0xff, 0x00, 0x00, 0x00, 0x00, 0xfe, 0xff,
  // NUMBER B1 = 1.5: format, col 1, row 0, double
  0x0e, 0x00, 0x0d, 0x00, 0xff, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xf8, 0x3f,
  // LABEL A2 = 'Hi: format, col 0, row 1, prefix, text, NUL
  0x0f, 0x00, 0x09, 0x00, 0xff, 0x00, 0x00, 0x01, 0x00, 0x27, 0x48, 0x69, 0x00,
  // FORMULA B2, cached 43, formula length 1, one RPN byte
  0x10, 0x00, 0x10, 0x00, 0xff, 0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x80, 0x45, 0x40, 0x01, 0x00, 0x03,
  // EOF
  0x01, 0x00, 0x00, 0x00,
]);

describe("scanWk1", () => {
  it("counts records by kind", () => {
    const scan = scanWk1(SAMPLE);
    expect(scan.version).toBe(0x0406);
    expect(scan.counts).toEqual({ cells: 4, formulas: 1, labels: 1, numbers: 2 });
    expect(scan.eof).toBe(true);
    expect(scan.truncated).toBe(false);
  });

  it("returns cells with A1 addresses and stored values", () => {
    expect(scanWk1(SAMPLE).cells).toEqual([
      { cell: "A1", kind: "integer", value: -2 },
      { cell: "B1", kind: "number", value: 1.5 },
      { cell: "A2", kind: "label", value: "Hi", prefix: "'" },
      { cell: "B2", kind: "formula", value: 43 },
    ]);
  });

  it("does not throw on truncated input", () => {
    for (let n = 0; n < SAMPLE.length; n++) {
      expect(scanWk1(SAMPLE.subarray(0, n)).eof).toBe(false);
    }
    const cut = scanWk1(SAMPLE.subarray(0, 20));
    expect(cut.truncated).toBe(true);
    expect(cut.counts.numbers).toBe(1);
    expect(scanWk1(SAMPLE.subarray(0, 17)).truncated).toBe(false);
  });

  it("names columns past Z", () => {
    const bytes = new Uint8Array([0x0d, 0x00, 0x07, 0x00, 0xff, 0x1b, 0x00, 0x09, 0x00, 0x05, 0x00]);
    expect(scanWk1(bytes).cells).toEqual([{ cell: "AB10", kind: "integer", value: 5 }]);
  });
});
