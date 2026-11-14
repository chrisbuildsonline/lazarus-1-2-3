import { describe, expect, it } from "vitest";
import { buildAll } from "../../../scripts/gen-fixtures.ts";
import { writeWk1 } from "../../../scripts/lib/wk1-writer.ts";
import { detectFormat } from "../../../src/cli/inventory.ts";
import { SAMPLE_DBF } from "../helpers/dbf-sample.ts";

const WK1 = buildAll().find((f) => f.path.endsWith("mixed.wk1"))!.bytes;
const WKS = writeWk1(0x0404, [{ kind: "integer", col: 0, row: 0, value: 1 }]);

describe("detectFormat", () => {
  it("detects WK1 from a BOF with version 0x0406", () => {
    expect(detectFormat(WK1, ".wk1")).toEqual({ format: "wk1" });
  });

  it("detects WKS from a BOF with version 0x0404", () => {
    expect(detectFormat(WKS, ".wks")).toEqual({ format: "wks" });
  });

  it("detects DBF from the version byte and a consistent header", () => {
    expect(detectFormat(SAMPLE_DBF, ".dbf")).toEqual({ format: "dbf" });
  });

  it("ignores the case of the extension", () => {
    expect(detectFormat(WK1, ".WK1")).toEqual({ format: "wk1" });
  });

  it("reports unknown for other bytes, empty and short files", () => {
    expect(detectFormat(new TextEncoder().encode("hello, world"), ".txt")).toEqual({ format: "unknown" });
    expect(detectFormat(new Uint8Array(0), "")).toEqual({ format: "unknown" });
    expect(detectFormat(WK1.subarray(0, 5), "")).toEqual({ format: "unknown" });
    expect(detectFormat(SAMPLE_DBF.subarray(0, 31), "")).toEqual({ format: "unknown" });
  });

  it("reports unknown for a BOF version outside the table", () => {
    const symphony = Uint8Array.from(WK1);
    symphony[4] = 0x05; // 0x0405
    expect(detectFormat(symphony, "")).toEqual({ format: "unknown" });
  });

  it("reports unknown for a DBF header that does not fit the file", () => {
    const records = Uint8Array.from(SAMPLE_DBF);
    records[4] = 50; // 50 records of 19 bytes cannot fit
    expect(detectFormat(records, ".dbf")).toEqual({ format: "unknown", note: "extension says dbf" });
  });

  it("trusts the bytes and adds a note when the extension disagrees", () => {
    expect(detectFormat(WK1, ".dbf")).toEqual({ format: "wk1", note: "extension says dbf" });
    expect(detectFormat(WKS, ".wk1")).toEqual({ format: "wks", note: "extension says wk1" });
    expect(detectFormat(SAMPLE_DBF, ".wks")).toEqual({ format: "dbf", note: "extension says wks" });
  });

  it("adds no note for extensions that name no corpus format", () => {
    expect(detectFormat(WK1, ".bak")).toEqual({ format: "wk1" });
  });
});
