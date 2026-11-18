import { describe, expect, it } from "vitest";
import { float80ToDouble } from "../../../src/parser/float80.ts";

/** 10 bytes from a 64-bit significand and a sign+exponent word, little-endian. */
export function bytes80(sig: bigint, signExp: number): Uint8Array {
  const b = new Uint8Array(10);
  for (let i = 0; i < 8; i++) b[i] = Number((sig >> BigInt(8 * i)) & 0xffn);
  b[8] = signExp & 0xff;
  b[9] = (signExp >> 8) & 0xff;
  return b;
}
const ONE = 1n << 63n; // explicit integer bit
const BIAS = 16383;

describe("float80ToDouble", () => {
  it("reads +0 and -0 exactly", () => {
    expect(Object.is(float80ToDouble(bytes80(0n, 0)).value, 0)).toBe(true);
    expect(Object.is(float80ToDouble(bytes80(0n, 0x8000)).value, -0)).toBe(true);
    expect(float80ToDouble(bytes80(0n, 0)).exact).toBe(true);
  });

  it("reads 1, -2.5 and 0.1 (a double widened to 80 bits)", () => {
    expect(float80ToDouble(bytes80(ONE, BIAS))).toEqual({ value: 1, exact: true });
    // -2.5 = -1.01b x 2^1
    expect(float80ToDouble(bytes80(ONE | (1n << 61n), 0x8000 | (BIAS + 1)))).toEqual({ value: -2.5, exact: true });
    // 0.1 as a double: significand 0x1999999999999A x 2^-56; widened: shifted left 11 bits, exponent -4.
    expect(float80ToDouble(bytes80(0x1999999999999an << 11n, BIAS - 4))).toEqual({ value: 0.1, exact: true });
  });

  it("reads the largest finite double and the smallest subnormal exactly", () => {
    expect(float80ToDouble(bytes80(((1n << 53n) - 1n) << 11n, BIAS + 1023))).toEqual({ value: Number.MAX_VALUE, exact: true });
    expect(float80ToDouble(bytes80(ONE, BIAS - 1074))).toEqual({ value: 5e-324, exact: true });
  });

  it("reads infinity and NaN from exponent 0x7FFF", () => {
    expect(float80ToDouble(bytes80(ONE, 0x7fff))).toEqual({ value: Infinity, exact: true });
    expect(float80ToDouble(bytes80(ONE, 0xffff))).toEqual({ value: -Infinity, exact: true });
    expect(Number.isNaN(float80ToDouble(bytes80(ONE | 1n, 0x7fff)).value)).toBe(true);
  });

  it("rounds a 64-bit significand down, up and to even", () => {
    // 1 + 2^-53 is the exact tie between 1 and 1 + 2^-52: even is 1.
    expect(float80ToDouble(bytes80(ONE | (1n << 10n), BIAS))).toEqual({ value: 1, exact: false });
    // 1 + 3 x 2^-53 ties between 1 + 2^-52 (odd) and 1 + 2^-51 (even): goes up to 1 + 2^-51.
    expect(float80ToDouble(bytes80(ONE | (3n << 10n), BIAS))).toEqual({ value: 1 + 2 ** -51, exact: false });
    // just above the tie rounds up, just below rounds down
    expect(float80ToDouble(bytes80(ONE | (1n << 10n) | 1n, BIAS))).toEqual({ value: 1 + 2 ** -52, exact: false });
    expect(float80ToDouble(bytes80(ONE | ((1n << 10n) - 1n), BIAS))).toEqual({ value: 1, exact: false });
  });

  it("overflows to infinity and underflows to zero or a subnormal, not exact", () => {
    expect(float80ToDouble(bytes80(ONE, BIAS + 1024))).toEqual({ value: Infinity, exact: false });
    expect(float80ToDouble(bytes80(ONE, 0x8000 | (BIAS + 5000)))).toEqual({ value: -Infinity, exact: false });
    expect(float80ToDouble(bytes80(ONE, BIAS - 2000))).toEqual({ value: 0, exact: false });
    // 1.5 x 2^-1074 rounds to even: 2 x 2^-1074
    expect(float80ToDouble(bytes80(ONE | (1n << 62n), BIAS - 1074))).toEqual({ value: 1e-323, exact: false });
  });

  it("reads at an offset without reading past 10 bytes", () => {
    const b = new Uint8Array(13);
    b.set(bytes80(ONE, BIAS), 3);
    expect(float80ToDouble(b, 3)).toEqual({ value: 1, exact: true });
  });
});
