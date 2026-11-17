// Every string of DESIGN.md section 7 lives in src/ui/copy.ts, in the tone it asks for (requirement 62).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COPY } from "../../../src/ui/copy.ts";

/** The section 7 table, one string per slot alternative ("A / B" and "A · B" are two strings). */
const designStrings = (() => {
  const md = readFileSync("design/DESIGN.md", "utf8");
  const section = md.slice(md.indexOf("## 7. Copy guide"), md.indexOf("## 8."));
  const rows = [...section.matchAll(/^\| ([^|]+) \| ([^|]+) \|$/gm)].map((m) => [m[1]!.trim(), m[2]!.trim()] as const);
  return rows.filter(([slot]) => slot !== "Slot" && !slot.startsWith("---")).flatMap(([, s]) => s.split(/ \/ | · /));
})();

/** Every string of COPY; a function is called with "N" for each parameter. */
function flatten(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (typeof v === "function") return [String(v(...Array.from({ length: v.length }, () => "N")))];
  if (v && typeof v === "object") return Object.values(v).flatMap(flatten);
  return [];
}

describe("copy.ts", () => {
  const all = flatten(COPY);

  it("the design table parses into its strings", () => {
    expect(designStrings).toContain("Raise a Lotus 1-2-3 file");
    expect(designStrings).toContain("Raised, with N disagreements");
    expect(designStrings).toContain("JSON");
    expect(designStrings.length).toBeGreaterThanOrEqual(20);
  });

  it("holds every string of DESIGN.md section 7", () => {
    for (const s of designStrings) expect(all, s).toContain(s);
  });

  it("never says correct or 100% accurate, and has no exclamation mark", () => {
    for (const s of all) {
      expect(s, s).not.toMatch(/correct/i);
      expect(s, s).not.toContain("100% accurate");
      expect(s, s).not.toContain("!");
    }
  });
});
