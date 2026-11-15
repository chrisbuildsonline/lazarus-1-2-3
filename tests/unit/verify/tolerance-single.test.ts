import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Requirement 26: the tolerance lives only in src/verify/tolerance.ts. Every other .ts file under
// src/verify, src/workers and src/cli is checked for Number.EPSILON, the word epsilon and any
// 1e- literal. Comments count too: a tolerance described in a comment belongs in tolerance.ts.

const ROOTS = ["src/verify", "src/workers", "src/cli"];
const ALLOWED = join("src/verify", "tolerance.ts");

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const path = join(dir, e.name);
    if (e.isDirectory()) return tsFiles(path);
    return e.name.endsWith(".ts") ? [path] : [];
  });
}

const PATTERNS = [/Number\.EPSILON/, /epsilon/i, /\b\d*\.?\d+e-\d/i];

/** The patterns the text matches, as strings. */
function toleranceHits(text: string): string[] {
  return PATTERNS.filter((p) => p.test(text)).map(String);
}

describe("single tolerance", () => {
  it("the check catches each forbidden form", () => {
    expect(toleranceHits("if (Math.abs(a - b) < Number.EPSILON) return true;")).not.toEqual([]);
    expect(toleranceHits("const EPS = epsilonFor(x);")).not.toEqual([]);
    expect(toleranceHits("const close = d < 1e-9;")).not.toEqual([]);
    expect(toleranceHits("const close = d < 2.5E-7;")).not.toEqual([]);
    expect(toleranceHits("const big = 1e300; const t = time - 1;")).toEqual([]);
  });

  const files = ROOTS.flatMap(tsFiles).filter((f) => f !== ALLOWED);

  it("has the tolerance file itself", () => {
    expect(ROOTS.flatMap(tsFiles)).toContain(ALLOWED);
  });

  for (const file of files) {
    it(`${file} holds no tolerance`, () => {
      expect(toleranceHits(readFileSync(file, "utf8")), file).toEqual([]);
    });
  }
});
