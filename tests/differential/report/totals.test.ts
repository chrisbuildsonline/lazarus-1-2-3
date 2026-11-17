// Report totals on every wk1/wks fixture of the manifest (requirement 55). The real-file numbers
// are read from the committed golden table, not retyped.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReport } from "../../../src/report/index.ts";
import { verifyBytes } from "../../../src/verify/index.ts";

const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: { path: string; format: string }[] };
const golden = JSON.parse(readFileSync("tests/differential/verify/golden.json", "utf8")) as Record<string, { formulas: number; matched: number; mismatched: number; unverifiable: number; byReason: Record<string, number> }>;

describe("report totals", () => {
  for (const f of manifest.fixtures.filter((x) => x.format === "wk1" || x.format === "wks")) {
    it(f.path, () => {
      const { verification } = verifyBytes(new Uint8Array(readFileSync(f.path)));
      const r = buildReport({ fileName: f.path, sha256: "0".repeat(64), byteLength: 0, toolVersion: "0", verification });
      expect(r.totals).toEqual(verification.totals);
      const count = (s: string) => r.rows.filter((x) => x.status === s).length;
      expect({ matched: count("matched"), mismatched: count("mismatched"), unverifiable: count("unverifiable") }).toEqual({ matched: r.totals.matched, mismatched: r.totals.mismatched, unverifiable: r.totals.unverifiable });
      expect(r.totals.matched + r.totals.mismatched + r.totals.unverifiable).toBe(r.totals.formulas);
      expect(r.rows.length).toBe(r.totals.formulas);
      const g = golden[f.path];
      if (g) expect({ formulas: r.totals.formulas, matched: r.totals.matched, mismatched: r.totals.mismatched, unverifiable: r.totals.unverifiable, byReason: r.totals.byReason }).toEqual({ formulas: g.formulas, matched: g.matched, mismatched: g.mismatched, unverifiable: g.unverifiable, byReason: g.byReason });
    });
  }

  it("the golden table holds the three real files", () => {
    expect(Object.keys(golden).sort()).toEqual(["fixtures/ksbase/KSBASE.WK1", "fixtures/libreoffice-wks-functions/gnome647171-1.wks", "fixtures/lotus123-wks/testLotus123.wks"]);
    expect(golden["fixtures/libreoffice-wks-functions/gnome647171-1.wks"]!.byReason["string-result"]).toBe(1);
  });
});
