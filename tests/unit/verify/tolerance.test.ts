import { describe, expect, it } from "vitest";
import { TOLERANCE, withinTolerance } from "../../../src/verify/tolerance.ts";

// Requirement 27: equal when |a - b| <= max(relative * max(|a|, |b|), absolute), or bit-identical
// (with -0 equal to 0). The numbers are provisional until task 50.

describe("withinTolerance", () => {
  it("has the provisional bounds from design.md", () => {
    expect(TOLERANCE).toEqual({ relative: 1e-12, absolute: 1e-12 });
  });

  it("is true for identical doubles", () => {
    expect(withinTolerance(0.25153768659966846, 0.25153768659966846)).toBe(true);
  });

  it("treats -0 and 0 as equal", () => {
    expect(withinTolerance(-0, 0)).toBe(true);
    expect(withinTolerance(0, -0)).toBe(true);
  });

  it("is true inside the relative bound", () => {
    // 1000 * (1 + 5e-13) differs from 1000 by 5e-10; the bound is 1e-12 * 1000.0000000005 ~ 1e-9.
    expect(withinTolerance(1000, 1000 * (1 + 5e-13))).toBe(true);
  });

  it("is true inside the absolute bound: 0.1 + 0.2 - 0.3 against 0", () => {
    // 0.1 + 0.2 - 0.3 is about 5.55e-17, well under the absolute floor 1e-12.
    expect(withinTolerance(0.1 + 0.2 - 0.3, 0)).toBe(true);
  });

  it("is false just outside the relative bound", () => {
    // 1000 against 1000 * (1 + 2e-12): difference 2e-9, bound about 1e-9.
    expect(withinTolerance(1000, 1000 * (1 + 2e-12))).toBe(false);
  });

  it("is false just outside the absolute bound", () => {
    // 2e-12 against 0: the relative part is 2e-24, the absolute floor 1e-12 < 2e-12.
    expect(withinTolerance(2e-12, 0)).toBe(false);
  });

  it("is symmetric", () => {
    const pairs: [number, number][] = [
      [1000, 1000 * (1 + 5e-13)],
      [1000, 1000 * (1 + 2e-12)],
      [0.1 + 0.2 - 0.3, 0],
      [2e-12, 0],
      [-3, 3],
    ];
    for (const [a, b] of pairs) expect(withinTolerance(a, b), `${a}, ${b}`).toBe(withinTolerance(b, a));
  });

  it("is false for NaN against anything, NaN included", () => {
    expect(withinTolerance(NaN, NaN)).toBe(false);
    expect(withinTolerance(NaN, 0)).toBe(false);
    expect(withinTolerance(1, NaN)).toBe(false);
  });

  it("accepts an infinity only against the identical infinity", () => {
    expect(withinTolerance(Infinity, Infinity)).toBe(true);
    expect(withinTolerance(-Infinity, -Infinity)).toBe(true);
    expect(withinTolerance(Infinity, -Infinity)).toBe(false);
    expect(withinTolerance(Infinity, Number.MAX_VALUE)).toBe(false);
  });

  it("is false for 1e100 against 1e100 * (1 + 1e-11)", () => {
    expect(withinTolerance(1e100, 1e100 * (1 + 1e-11))).toBe(false);
  });
});
