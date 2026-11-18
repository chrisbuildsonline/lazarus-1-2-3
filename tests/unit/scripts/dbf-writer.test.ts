import { describe, expect, it } from "vitest";
import { padValue, writeDbf } from "../../../scripts/lib/dbf-writer.ts";
import { SAMPLE_DBF } from "../helpers/dbf-sample.ts";
import { scanDbf } from "../helpers/dbf-scan.ts";

describe("writeDbf", () => {
  it("writes the hand-built SAMPLE_DBF byte for byte", () => {
    const bytes = writeDbf({
      lastUpdate: [126, 11, 14],
      codePage: 0,
      fields: [
        { name: "NAME", type: "C", length: 10 },
        { name: "PRICE", type: "N", length: 8, decimals: 2 },
      ],
      records: [{ values: ["Apple", "1.50"] }, { values: ["Pear", "12.00"] }],
    });
    expect([...bytes]).toEqual([...SAMPLE_DBF]);
  });

  it("puts the deletion flag, header and record lengths where the independent scanner reads them", () => {
    const bytes = writeDbf({ fields: [{ name: "Q", type: "N", length: 4 }], records: [{ values: ["7"] }, { deleted: true, values: ["8"] }] });
    const view = new DataView(bytes.buffer);
    expect(view.getUint32(4, true)).toBe(2);
    expect(view.getUint16(8, true)).toBe(32 + 32 + 1);
    expect(view.getUint16(10, true)).toBe(5);
    expect(bytes[65 + 5]).toBe(0x2a);
    expect(bytes.at(-1)).toBe(0x1a);
    expect(scanDbf(bytes).cells.map((c) => c.value)).toEqual([7, 8]);
  });

  it("pads text left-aligned and numbers right-aligned, cutting to the width", () => {
    expect(padValue({ name: "A", type: "C", length: 4 }, "ab")).toBe("ab  ");
    expect(padValue({ name: "A", type: "N", length: 4 }, "12")).toBe("  12");
    expect(padValue({ name: "A", type: "C", length: 2 }, "abcd")).toBe("ab");
  });
});
