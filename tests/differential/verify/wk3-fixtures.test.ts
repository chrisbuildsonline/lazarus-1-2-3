// verifyWorkbookBytes on every wk3 fixture of the manifest, enumerated at run time: each WK3 formula
// is decoded with the Release 3 token table and recalculated against the 10-byte result the file stored.
// Before WK3 formulas were decoded (F17), all 683 formulas of the two real NOAA files were
// unverifiable (wk3-formula-not-decoded) and none was matched. After: 682 matched, 1 mismatched, 0 unverifiable.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verifyWorkbookBytes } from "../../../src/verify/index.ts";
import { scanWk3 } from "../../unit/helpers/wk3-scan.ts";

type Entry = { path: string; format: string; origin: "real" | "synthetic"; counts: { formulas: number } };

const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: Entry[] };
const entries = manifest.fixtures.filter((e) => e.format === "wk3");
const M3 = "fixtures/noaa-ala-wai-m3/m3.wk3";
const M21 = "fixtures/noaa-ala-wai-m21/m21tab.wk3";
const read = (path: string) => new Uint8Array(readFileSync(path));

describe("verifyWorkbookBytes on every wk3 fixture", () => {
  it("the manifest has the two real WK3 files with formulas", () => {
    expect(entries.filter((e) => e.origin === "real" && e.counts.formulas > 0).map((e) => e.path).sort()).toEqual([M21, M3]);
  });

  for (const entry of entries) {
    describe(`${entry.path} (${entry.origin})`, () => {
      const bytes = read(entry.path);
      const verifications = verifyWorkbookBytes(bytes, entry.path).verifications;
      const cells = verifications.flatMap((v, i) => v.cells.map((c) => ({ ...c, sheet: i })));
      const t = { formulas: cells.length, matched: cells.filter((c) => c.status === "matched").length, mismatched: cells.filter((c) => c.status === "mismatched").length };
      console.info(`${entry.path} (${entry.origin}): ${t.formulas} formulas, ${t.matched} matched, ${t.mismatched} mismatched, ${t.formulas - t.matched - t.mismatched} unverifiable`);

      it("gives each formula cell of the independent walker exactly one result", () => {
        const scan = scanWk3(bytes);
        expect(t.formulas).toBe(entry.counts.formulas);
        const listed = verifications.flatMap((v, i) => v.cells.map((c) => `${scan.sheets[i]!.name}!${c.address}`));
        expect(listed.sort()).toEqual(scan.cells.filter((c) => c.kind === "formula").map((c) => c.cell).sort());
      });

      it("keeps the stored value of every formula as the walker reads it", () => {
        const scan = scanWk3(bytes);
        const stored = new Map(scan.cells.map((c) => [c.cell, c.value]));
        verifications.forEach((v, i) => {
          for (const c of v.cells) if (c.cached?.t === "num") expect(c.cached.v, c.address).toBe(stored.get(`${scan.sheets[i]!.name}!${c.address}`));
        });
      });
    });
  }

  it("m3.wk3: all 675 formulas decode and recalculate to the stored value", () => {
    const [v] = verifyWorkbookBytes(read(M3)).verifications;
    expect(v!.totals).toMatchObject({ formulas: 675, matched: 675, mismatched: 0, unverifiable: 0 });
    for (const c of v!.cells) expect(c.formula, c.address).not.toBeNull();
  });

  it("m21tab.wk3: 7 of 8 match; V44 = L44/C44 is mismatched because the file holds no C44", () => {
    const [v] = verifyWorkbookBytes(read(M21)).verifications;
    expect(v!.totals).toMatchObject({ formulas: 8, matched: 7, mismatched: 1, unverifiable: 0 });
    const odd = v!.cells.filter((c) => c.status !== "matched");
    expect(odd.map((c) => [c.address, c.lotusFormula, c.recalculated])).toEqual([["V44", "L44/C44", { t: "err" }]]);
    // The finding, checked with the independent walker: there is no record for C44 (C45 and C46 exist),
    // so 1-2-3 itself gives ERR for L44/C44 today. The stored 0.012281069011234387 = 0.176 / C44 means
    // C44 held about 14.33 when the file was last recalculated; it was cleared after that.
    const scan = scanWk3(read(M21)).cells;
    expect(scan.find((c) => c.cell === "A!C44")).toBeUndefined();
    expect(scan.find((c) => c.cell === "A!C45")).toMatchObject({ value: 13.158 });
    expect(0.176 / 0.012281069011234387).toBeCloseTo(14.331, 3);
  });
});
