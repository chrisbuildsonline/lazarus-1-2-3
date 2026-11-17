// Value text for the grid, the list and the drawer (requirements 36, 45).
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { formatNumber, formatValue } from "../../../../src/ui/model/format-value.ts";

const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: { path: string; expectedValues: { cell: string; cached: unknown }[] }[] };
const ksbase = manifest.fixtures.find((f) => f.path === "fixtures/ksbase/KSBASE.WK1")!;
const O3 = ksbase.expectedValues.find((v) => v.cell === "O3")!.cached as number;
const B3 = ksbase.expectedValues.find((v) => v.cell === "B3")!.cached as number;

describe("formatNumber", () => {
  it("groups the integer part by three", () => {
    expect(formatNumber(B3)).toBe("35,249");
    expect(formatNumber(1234567.125)).toBe("1,234,567.125");
    expect(formatNumber(-1234)).toBe("-1,234");
    expect(formatNumber(999)).toBe("999");
  });

  it("keeps every digit of the shortest round-trip form", () => {
    expect(formatNumber(O3)).toBe("0.25153768659966846");
    expect(formatNumber(0.1)).toBe("0.1");
    expect(formatNumber(-7)).toBe("-7");
  });

  it("does not group inside a fraction or an exponent, and leaves 1e15 and above as String(n)", () => {
    expect(formatNumber(0.123456789)).toBe("0.123456789");
    expect(formatNumber(1e100)).toBe("1e+100");
    expect(formatNumber(1.5e-7)).toBe("1.5e-7");
    expect(formatNumber(1e15)).toBe("1000000000000000");
    expect(formatNumber(999999999999999)).toBe("999,999,999,999,999");
  });

  it("reads -0 as 0", () => {
    expect(formatNumber(-0)).toBe("0");
  });

  it("property: removing the commas gives the same double back", () => {
    fc.assert(
      fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), (d) => {
        expect(Number(formatNumber(d).replaceAll(",", "")) === d).toBe(true);
      }),
      { numRuns: 2000 },
    );
  });
});

describe("formatValue", () => {
  it("numbers, ERR, NA and strings", () => {
    expect(formatValue({ t: "num", v: 18330 }, "cached")).toBe("18,330");
    expect(formatValue({ t: "err" }, "cached")).toBe("ERR");
    expect(formatValue({ t: "na" }, "recalculated")).toBe("NA");
    expect(formatValue({ t: "str", v: "Total" }, "recalculated")).toBe('"Total"');
  });

  it("a missing value names which one is missing, never a bare dash", () => {
    expect(formatValue(null, "cached")).toBe("Not stored in the file");
    expect(formatValue(null, "recalculated")).toBe("Could not be calculated");
  });
});
