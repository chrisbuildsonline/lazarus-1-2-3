import { describe, expect, it } from "vitest";
import { scanDbf } from "../helpers/dbf-scan.ts";
import { SAMPLE_DBF } from "../helpers/dbf-sample.ts";

describe("scanDbf", () => {
  it("counts cells from the header and field descriptors", () => {
    expect(scanDbf(SAMPLE_DBF).counts).toEqual({ cells: 4, formulas: 0, labels: 2, numbers: 2 });
  });

  it("returns stored values by record:field", () => {
    expect(scanDbf(SAMPLE_DBF).cells).toEqual([
      { cell: "1:NAME", kind: "label", value: "Apple" },
      { cell: "1:PRICE", kind: "number", value: 1.5 },
      { cell: "2:NAME", kind: "label", value: "Pear" },
      { cell: "2:PRICE", kind: "number", value: 12 },
    ]);
  });

  it("does not throw on truncated input", () => {
    for (let n = 0; n < SAMPLE_DBF.length; n++) scanDbf(SAMPLE_DBF.subarray(0, n));
    expect(scanDbf(SAMPLE_DBF.subarray(0, 10)).cells).toEqual([]);
    // header 97 bytes + one 19-byte record = 116
    expect(scanDbf(SAMPLE_DBF.subarray(0, 115)).cells).toHaveLength(0);
    expect(scanDbf(SAMPLE_DBF.subarray(0, 116)).cells).toHaveLength(2);
  });
});
