// The Lotus 1-2-3 function names set as runes around the summoning circle (seance-visuals requirement 10).
import { describe, expect, it } from "vitest";
import { OPCODES } from "../../../../src/formula/index.ts";
import { RUNES } from "../../../../src/ui/model/runes.ts";

describe("RUNES", () => {
  it("has at least 8 distinct @ names", () => {
    expect(RUNES.length).toBeGreaterThanOrEqual(8);
    expect(new Set(RUNES).size).toBe(RUNES.length);
    for (const r of RUNES) expect(r).toMatch(/^@[A-Z]+$/);
  });

  it("names only functions the WK1 decoder knows, so the circle reads real Lotus", () => {
    const known = new Set(OPCODES.flatMap((e) => (e.kind === "function" ? [`@${e.name}`] : [])));
    for (const r of RUNES) expect(known.has(r), r).toBe(true);
  });
});
