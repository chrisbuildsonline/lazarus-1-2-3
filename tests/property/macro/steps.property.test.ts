import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { parseSteps } from "../../../src/macro/steps.ts";

const macroish = fc.array(fc.constantFrom(..."{}~/ABC123,.? PRGQ".split(""), "{GOTO}", "{DOWN 2}", "{LET ", "/PP"), { maxLength: 60 }).map((a) => a.join(""));
const anyText = fc.oneof(fc.string({ maxLength: 200 }), fc.string({ unit: "binary", maxLength: 100 }), macroish);

describe("parseSteps properties", () => {
  it("never throws, round trips, keeps offsets, labels every step, and is deterministic", () => {
    fc.assert(
      fc.property(anyText, (text) => {
        const a = parseSteps(text);
        expect(a.steps.map((s) => s.raw).join("")).toBe(text);
        let offset = 0;
        for (const s of a.steps) {
          expect(s.start).toBe(offset);
          expect(s.raw.length).toBeGreaterThan(0);
          expect(typeof s.label).toBe("string");
          expect(s.label.length).toBeGreaterThan(0);
          offset += s.raw.length;
        }
        expect(parseSteps(text)).toEqual(a);
      }),
      { numRuns: 1000 },
    );
  });
  it("finishes a 1,000,000-character input in under a second", () => {
    const text = "{GOTO}A1~/PPR".repeat(76_924).slice(0, 1_000_000);
    const t0 = performance.now();
    const { steps } = parseSteps(text);
    expect(performance.now() - t0).toBeLessThan(1000);
    expect(steps.map((s) => s.raw).join("")).toBe(text);
  });
});
