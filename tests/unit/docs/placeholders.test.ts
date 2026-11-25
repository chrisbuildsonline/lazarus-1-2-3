import { existsSync, readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Jury run 145: the Devpost draft still said "[fill in measured result]". Every write-up in the repo
// (README, docs/*.md, design/*.md; docs/sources/ holds downloads, not ours) must carry real numbers.
const docs = [
  "README.md",
  ...readdirSync("docs").filter((f) => f.endsWith(".md")).map((f) => `docs/${f}`),
  ...readdirSync("design").filter((f) => f.endsWith(".md")).map((f) => `design/${f}`),
];

describe("write-ups", () => {
  it("include the demo script and the Devpost write-up", () => {
    for (const f of ["docs/demo-script.md", "docs/devpost.md"]) expect(existsSync(f), f).toBe(true);
  });

  for (const file of docs) {
    it(`${file} has no "[fill in" placeholder`, () => {
      const lines = readFileSync(file, "utf8").split("\n");
      const left = lines.flatMap((l, i) => (/\[fill in/i.test(l) ? [`${file}:${i + 1}`] : []));
      expect(left).toEqual([]);
    });
  }

  // README "Macros": approving records a decision and changes no cell, so no write-up may promise
  // that an approval turns a cell green.
  for (const file of ["docs/demo-script.md", "docs/devpost.md"].filter(existsSync)) {
    it(`${file} does not claim an approval turns a cell green`, () => {
      expect(readFileSync(file, "utf8")).not.toMatch(/(approv\w*|fix)[^.]*\bturns? green/i);
    });
  }
});
