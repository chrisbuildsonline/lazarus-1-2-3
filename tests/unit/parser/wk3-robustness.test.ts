import { describe, expect, it } from "vitest";
import { formula80, label, small, smallInt, writeWk3 } from "../../../scripts/lib/wk3-writer.ts";
import { MAX_DIAGNOSTICS } from "../../../src/parser/diagnostics.ts";
import { parseWk3 } from "../../../src/parser/wk3.ts";
import { bof } from "../../../scripts/lib/wk3-writer.ts";

describe("parseWk3 robustness", () => {
  it("never throws on empty, 1 to 3 bytes, a header only and all 0xFF", () => {
    for (const bytes of [new Uint8Array(0), new Uint8Array([0]), new Uint8Array([0, 0]), new Uint8Array([0, 0, 26]), bof(), new Uint8Array(64).fill(0xff)]) {
      const r = parseWk3(bytes);
      expect(r.diagnostics.length).toBeGreaterThan(0);
      expect(r.stats.bytesRead).toBeLessThanOrEqual(bytes.length);
    }
  });

  it("parses all 0x00 input without throwing, and caps diagnostics", () => {
    expect(parseWk3(new Uint8Array(40_000)).diagnostics.length).toBeGreaterThan(0);
    const r = parseWk3(writeWk3(Array.from({ length: 1100 }, () => small(0, 0, 0, smallInt(1)))));
    expect(r.diagnostics).toHaveLength(MAX_DIAGNOSTICS + 1);
    expect(r.diagnostics.at(-1)!.code).toBe("diagnostics-truncated");
  });

  it("reads a subarray like a copy and does not change the input", () => {
    const bytes = writeWk3([label(0, 0, 0, "'", "a"), small(1, 0, 0, smallInt(2)), formula80(1, 1, 0, 3, [3])]);
    const before = Uint8Array.from(bytes);
    const padded = new Uint8Array(bytes.length + 5);
    padded.set(bytes, 2);
    expect(parseWk3(padded.subarray(2, 2 + bytes.length))).toEqual(parseWk3(bytes));
    expect(bytes).toEqual(before);
  });
});
