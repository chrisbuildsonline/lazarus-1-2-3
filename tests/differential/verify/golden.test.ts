// The committed golden table for the real fixtures (acceptance 2). `bun run verify:golden`
// regenerates it and keeps the human-written findings; this test fails when a measured number
// moves or a non-matched group has no finding. Never edit a count by hand.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { measure, realFixtures, type GoldenFixture } from "../../../scripts/verify-golden.ts";
import { TOLERANCE, verifyBytes } from "../../../src/verify/index.ts";

const golden = JSON.parse(readFileSync("tests/differential/verify/golden.json", "utf8")) as Record<string, GoldenFixture>;

describe("golden table for the real fixtures", () => {
  it("covers exactly the real wk1/wks fixtures with formulas", () => {
    expect(Object.keys(golden).sort()).toEqual([...realFixtures()].sort());
    expect(Object.keys(golden).sort()).toEqual([
      "fixtures/ksbase/KSBASE.WK1",
      "fixtures/libreoffice-wks-functions/gnome647171-1.wks",
      "fixtures/lotus123-wks/testLotus123.wks",
    ]);
  });

  for (const path of realFixtures()) {
    describe(path, () => {
      const g = golden[path]!;
      const m = measure(path);

      it("counts, exact, withinTolerance and byReason are as measured", () => {
        const pick = (x: GoldenFixture) => ({ formulas: x.formulas, matched: x.matched, mismatched: x.mismatched, unverifiable: x.unverifiable, exact: x.exact, withinTolerance: x.withinTolerance, byReason: x.byReason });
        expect(pick(m)).toEqual(pick(g));
      });

      it("the largest relative difference among matched cells and the candidate opcodes are as measured", () => {
        expect(m.maxRelativeDifference).toBe(g.maxRelativeDifference);
        expect(m.candidateOpcodes).toEqual(g.candidateOpcodes);
      });

      it("groups of non-matched cells are as measured", () => {
        const strip = (x: GoldenFixture) => x.groups.map(({ finding: _, ...rest }) => rest);
        expect(strip(m)).toEqual(strip(g));
        expect(g.groups.reduce((s, x) => s + x.count, 0)).toBe(g.mismatched + g.unverifiable);
      });

      it("every non-matched group has a human-written finding", () => {
        for (const x of g.groups) expect(x.finding.trim(), `${x.reason} ${x.rule}`).not.toBe("");
      });
    });
  }
});

// Tolerance sign-off (requirements 26 to 28, open question 2). Measured: every matched real cell
// is bit-identical to its cached double, including non-integer results such as KSBASE O3
// (0.5 * (J3 + J4) = 0.25153768659966846). The real data never needed the tolerance, so it
// cannot bound it from below; 1e-12 stays on the design's reasoning (docs/verify-evidence.md).
describe("tolerance sign-off against the real fixtures", () => {
  it("keeps TOLERANCE at relative 1e-12, absolute 1e-12", () => {
    expect(TOLERANCE).toEqual({ relative: 1e-12, absolute: 1e-12 });
  });

  it("every matched real cell is exact: largest relative difference 0, none within tolerance only", () => {
    for (const path of realFixtures()) {
      expect(golden[path]!.maxRelativeDifference, path).toBe(0);
      expect(golden[path]!.withinTolerance, path).toBe(0);
      expect(golden[path]!.exact, path).toBe(golden[path]!.matched);
    }
  });

  it("exactness is not only integers: a real non-integer result matches bit for bit", () => {
    const o3 = verifyBytes(new Uint8Array(readFileSync("fixtures/ksbase/KSBASE.WK1"))).verification.cells.find((c) => c.address === "O3")!;
    expect(o3.reason.code).toBe("exact");
    expect(o3.cached).toEqual({ t: "num", v: 0.25153768659966846 }); // 3fd01931866a0d7e in docs/verify-evidence.md
    expect(Number.isInteger((o3.cached as { v: number }).v)).toBe(false);
  });
});
