// Verified percentage, headline, proof bar segments and the text description (requirements 27 to 29).
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { describeTotals, headline, percentVerified, proofSegments } from "../../../../src/ui/model/totals.ts";
import type { Totals } from "../../../../src/verify/index.ts";

const t = (formulas: number, matched: number, mismatched = 0, unverifiable = formulas - matched - mismatched): Totals => ({
  formulas,
  matched,
  mismatched,
  unverifiable,
  exact: matched,
  withinTolerance: 0,
  byReason: {},
});

const golden = JSON.parse(readFileSync("tests/differential/verify/golden.json", "utf8")) as Record<string, Totals>;
const ksbaseTotals = (): Totals => golden["fixtures/ksbase/KSBASE.WK1"]!;

describe("headline and percentVerified", () => {
  it("floors to one decimal with integer arithmetic", () => {
    // 1180 * 1000 / 1204 = 980.07, floor 980.
    expect(headline(t(1204, 1180))).toBe("98.0%");
    expect(headline(t(1000, 999))).toBe("99.9%");
    // 99,999,000 / 100,000 = 999.99, floor 999.
    expect(headline(t(100_000, 99_999))).toBe("99.9%");
    expect(headline(t(5, 0))).toBe("0.0%");
  });

  it("KSBASE from golden.json is 160 of 160, 100.0%", () => {
    const k = ksbaseTotals();
    expect(k.formulas).toBe(160);
    expect(k.matched).toBe(160);
    expect(headline(k)).toBe("100.0%");
  });

  it("no formulas reads No formulas", () => {
    expect(percentVerified(t(0, 0))).toEqual({ kind: "none" });
    expect(headline(t(0, 0))).toBe("No formulas");
  });

  it("property: tenths is 1000 if and only if every formula matched, and never above the true percentage", () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2_000_000 }), fc.double({ min: 0, max: 1, noNaN: true }), (formulas, share) => {
        const matched = Math.min(formulas, Math.floor(formulas * share));
        const p = percentVerified(t(formulas, matched));
        if (p.kind !== "pct") throw new Error("expected a percentage");
        expect(p.tenths === 1000).toBe(matched === formulas);
        expect(Number.isInteger(p.tenths)).toBe(true);
        expect(p.tenths * formulas <= matched * 1000).toBe(true);
        expect((p.tenths + 1) * formulas > matched * 1000).toBe(true);
      }),
      { numRuns: 1000 },
    );
  });
});

describe("proofSegments", () => {
  it("orders matched, mismatched, unverifiable and skips zero counts", () => {
    expect(proofSegments(t(10, 7, 2, 1)).map((s) => s.status)).toEqual(["matched", "mismatched", "unverifiable"]);
    expect(proofSegments(t(10, 7, 0, 3)).map((s) => s.status)).toEqual(["matched", "unverifiable"]);
    expect(proofSegments(t(160, 160))).toEqual([{ status: "matched", fraction: 1 }]);
    expect(proofSegments(t(0, 0))).toEqual([]);
  });

  it("property: fractions are positive and sum to 1 within 1e-12", () => {
    fc.assert(
      fc.property(fc.nat(100_000), fc.nat(100_000), fc.nat(100_000), (a, b, c) => {
        fc.pre(a + b + c > 0);
        const segs = proofSegments(t(a + b + c, a, b, c));
        for (const s of segs) expect(s.fraction).toBeGreaterThan(0);
        expect(Math.abs(segs.reduce((sum, s) => sum + s.fraction, 0) - 1)).toBeLessThanOrEqual(1e-12);
      }),
    );
  });
});

describe("describeTotals", () => {
  it("names all three counts", () => {
    expect(describeTotals(t(160, 160))).toBe("160 matched, 0 mismatched, 0 unverifiable");
    expect(describeTotals(t(1204, 1180, 3, 21))).toBe("1,180 matched, 3 mismatched, 21 unverifiable");
  });
});
