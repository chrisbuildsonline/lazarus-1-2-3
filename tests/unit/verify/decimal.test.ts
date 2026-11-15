import { describe, expect, it } from "vitest";
import { roundDecimal } from "../../../src/verify/decimal.ts";

// S09: MAN @ROUND (19-14) prints the table for 7145.258 with n from -3 to 3.
const S09: [number, number][] = [
  [-3, 7000],
  [-2, 7100],
  [-1, 7150],
  [0, 7145],
  [1, 7145.3],
  [2, 7145.26],
  [3, 7145.258],
];

const value = (r: ReturnType<typeof roundDecimal>) => ("value" in r ? r.value : "tie");

describe("roundDecimal", () => {
  for (const [n, expected] of S09) {
    it(`S09: ROUND(7145.258, ${n}) is ${expected}`, () => {
      const r = roundDecimal(7145.258, n);
      expect(value(r)).toBe(expected);
      expect("value" in r && Object.is(r.value, expected)).toBe(true);
    });

    it(`S09: ROUND(-7145.258, ${n}) is ${-expected}, the mirror`, () => {
      const r = roundDecimal(-7145.258, n);
      expect("value" in r && Object.is(r.value, -expected)).toBe(true);
    });
  }
});

describe("roundDecimal edges", () => {
  const is = (r: ReturnType<typeof roundDecimal>, expected: number) => "value" in r && Object.is(r.value, expected);

  it("S09: a carry runs through every digit: 9.996 to two places is 10", () => {
    expect(is(roundDecimal(9.996, 2), 10)).toBe(true);
    expect(is(roundDecimal(-9.996, 2), -10)).toBe(true);
  });

  it("U03: a digit 5 followed by zeros at the cut is a tie", () => {
    expect(roundDecimal(2.5, 0)).toEqual({ tie: true });
    expect(roundDecimal(0.125, 2)).toEqual({ tie: true });
    expect(roundDecimal(-2.5, 0)).toEqual({ tie: true });
  });

  it("U03: 1.005 is a tie, since its 15-digit form is 1.00500000000000", () => {
    // The double nearest 1.005 is 1.00499999999999989..., within 1e-16 of the halfway point.
    expect(roundDecimal(1.005, 2)).toEqual({ tie: true });
  });

  it("S09: a 5 followed by a non-zero digit rounds up, not a tie", () => {
    expect(is(roundDecimal(0.1251, 2), 0.13)).toBe(true);
  });

  it("S09: a cut at or beyond 15 digits returns x unchanged", () => {
    // 123.456 has 3 digits before the point; n = 12 cuts at 15.
    expect(is(roundDecimal(123.456, 12), 123.456)).toBe(true);
    expect(is(roundDecimal(0.30000000000000004, 15), 0.30000000000000004)).toBe(true);
  });

  it("S09: a cut below the first digit gives 0: 0.0004 to two places", () => {
    expect(is(roundDecimal(0.0004, 2), 0)).toBe(true);
  });

  it("S09: a result of -0 is 0", () => {
    expect(is(roundDecimal(-0.0004, 2), 0)).toBe(true);
    expect(is(roundDecimal(-0.4, 0), 0)).toBe(true);
    expect(is(roundDecimal(-0, 2), 0)).toBe(true);
  });

  it("S09: n = 15 rounds at the fifteenth decimal place", () => {
    // 0.001234567890123456: fifteenth decimal digit 3, next 4, so 0.001234567890123.
    expect(is(roundDecimal(0.001234567890123456, 15), 0.001234567890123)).toBe(true);
  });

  it("S09: n = -15 rounds to a multiple of 10^15", () => {
    expect(is(roundDecimal(2.6e15, -15), 3e15)).toBe(true);
    expect(is(roundDecimal(4e14, -15), 0)).toBe(true);
  });
});
