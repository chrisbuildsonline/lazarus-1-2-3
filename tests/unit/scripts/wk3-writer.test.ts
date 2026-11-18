import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { bof, encode80, formula80, label, number80, sheetName, small, smallInt } from "../../../scripts/lib/wk3-writer.ts";

/** Slow oracle: the exact value of 10 extended bytes as a rational p / q with BigInt, then compared via a double. */
function oracle80(b: Uint8Array): number {
  let sig = 0n;
  for (let i = 7; i >= 0; i--) sig = (sig << 8n) | BigInt(b[i]!);
  const se = b[8]! | (b[9]! << 8);
  let exp = (se & 0x7fff) - 16383 - 63;
  const sign = se & 0x8000 ? -1 : 1;
  if (sig === 0n) return sign * 0;
  while ((sig & 1n) === 0n) {
    sig >>= 1n;
    exp++;
  }
  // For values from a double the significand has at most 53 significant bits, so this is exact.
  return sign * Number(sig) * 2 ** exp;
}

describe("wk3 writer", () => {
  it("writes the 26-byte BOF with version 0x1000 and sub-version 4", () => {
    expect([...bof().subarray(0, 8)]).toEqual([0, 0, 26, 0, 0x00, 0x10, 0x04, 0x00]);
    expect(bof().length).toBe(30);
  });

  it("puts the address as row u16, sheet u8, col u8 with no format byte", () => {
    const r = label(2, 5, 0x0102, "'", "Hi");
    expect([...r]).toEqual([0x16, 0, 8, 0, 0x02, 0x01, 2, 5, 0x27, 0x48, 0x69, 0]);
    expect([...small(1, 3, 4, smallInt(-1))]).toEqual([0x18, 0, 6, 0, 4, 0, 1, 3, 0xfe, 0xff]);
  });

  it("writes NUMBER and FORMULA with 10-byte values; FORMULA RPN runs to the record end", () => {
    expect(number80(0, 0, 0, 1).length).toBe(4 + 14);
    const f = formula80(0, 1, 2, 3, [0x05, 0x03]);
    expect(f.length).toBe(4 + 14 + 2);
    expect([...f.subarray(18)]).toEqual([0x05, 0x03]);
  });

  it("writes the sheet name record as subtype 14000, sheet u16, name, NUL", () => {
    expect([...sheetName(2, "Tot")]).toEqual([0x1b, 0, 8, 0, 0xb0, 0x36, 2, 0, 0x54, 0x6f, 0x74, 0]);
  });

  it("encode80 bytes decode with the BigInt oracle to the same double", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), (d) => {
        expect(Object.is(oracle80(encode80(d)), d)).toBe(true);
      }),
    );
    expect(oracle80(encode80(5e-324))).toBe(5e-324);
  });
});
