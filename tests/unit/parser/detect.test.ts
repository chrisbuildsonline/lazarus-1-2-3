import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { writeWk1 } from "../../../scripts/lib/wk1-writer.ts";
import { WK3_VERSIONS, detectKind, isDbfHeader } from "../../../src/parser/detect.ts";
import { SAMPLE_DBF } from "../helpers/dbf-sample.ts";

const LAND = new Uint8Array(readFileSync("fixtures/natural-earth-land/ne_110m_land.dbf"));

/** A BOF record of `length` body bytes whose first word is `version`. */
function bof(version: number, length = 2): Uint8Array {
  const b = new Uint8Array(4 + length);
  const v = new DataView(b.buffer);
  v.setUint16(2, length, true);
  if (length >= 2) v.setUint16(4, version, true);
  return b;
}

describe("detectKind", () => {
  it("gives wk1 for BOF 0x0404 and 0x0406", () => {
    expect(detectKind(writeWk1(0x0404, []))).toBe("wk1");
    expect(detectKind(writeWk1(0x0406, []))).toBe("wk1");
  });

  it("gives dbf for SAMPLE_DBF and ne_110m_land.dbf", () => {
    expect(detectKind(SAMPLE_DBF)).toBe("dbf");
    expect(detectKind(LAND)).toBe("dbf");
  });

  it("gives wk1 for noise, empty, 5 bytes, a cut DBF and an unknown BOF version", () => {
    expect(detectKind(new TextEncoder().encode("hello, world"))).toBe("wk1");
    expect(detectKind(new Uint8Array(0))).toBe("wk1");
    expect(detectKind(writeWk1(0x0406, []).subarray(0, 5))).toBe("wk1");
    expect(detectKind(bof(0x1234))).toBe("wk1");
    expect(detectKind(SAMPLE_DBF.subarray(0, 31))).toBe("wk1");
  });

  it("gives wk3 for a BOF whose version is in the sourced WK3 table", () => {
    expect(WK3_VERSIONS.size).toBeGreaterThan(0);
    for (const v of WK3_VERSIONS) expect(detectKind(bof(v, 26))).toBe("wk3");
  });

  it("gives wk1 for a WK3 version word in a BOF too short to hold it", () => {
    for (const v of WK3_VERSIONS) expect(detectKind(bof(v, 2).subarray(0, 5))).toBe("wk1");
  });
});

describe("isDbfHeader", () => {
  it("accepts SAMPLE_DBF", () => {
    expect(isDbfHeader(SAMPLE_DBF)).toBe(true);
  });

  it("rejects a header whose record count overruns the file", () => {
    const b = Uint8Array.from(SAMPLE_DBF);
    b[4] = 50; // 50 records of 19 bytes cannot fit
    expect(isDbfHeader(b)).toBe(false);
  });

  it("rejects short input, an unknown version byte and a WK file", () => {
    expect(isDbfHeader(SAMPLE_DBF.subarray(0, 31))).toBe(false);
    const b = Uint8Array.from(SAMPLE_DBF);
    b[0] = 0x01;
    expect(isDbfHeader(b)).toBe(false);
    expect(isDbfHeader(writeWk1(0x0406, []))).toBe(false);
  });
});
