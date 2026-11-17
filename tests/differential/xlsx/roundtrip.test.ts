// Fixture round trip (requirement 54): parse, verify, write, re-read with exceljs, and compare
// the workbook against the parsed Lotus Sheet (not against the writer's plan).
// Expected values: numbers by Object.is with the parsed double (=== for -0, which XLSX cannot
// hold, see exceljs-probe.test.ts); +Infinity (Lotus ERR) as #VALUE!, -Infinity (NA) as #N/A,
// NaN as no value, each with a note (S27); labels by text; formulas by CellResult.formula and
// the cached double as stored result.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildAll } from "../../../scripts/gen-fixtures.ts";
import { a1, parseWk1 } from "../../../src/parser/index.ts";
import { verifyBytes, verifySheet } from "../../../src/verify/index.ts";
import { writeXlsx } from "../../../src/xlsx/index.ts";
import { readXlsx } from "../../unit/helpers/xlsx-readback.ts";

type Checked = { cells: number; formulas: number; errCells: number; noResultFormulas: string[] };

const sameNumber = (a: unknown, b: number) => (b === 0 ? a === 0 : Object.is(a, b));

/** The value a non-formula cell, or an untranslated formula, holds for a stored double. */
function expectDouble(got: unknown, d: number, where: string) {
  if (d === Infinity) expect(got, where).toEqual({ error: "#VALUE!" });
  else if (d === -Infinity) expect(got, where).toEqual({ error: "#N/A" });
  else if (Number.isNaN(d)) expect(got ?? undefined, where).toBeUndefined();
  else expect(sameNumber(got, d), `${where}: ${String(got)} vs ${d}`).toBe(true);
}

async function roundTrip(bytes: Uint8Array): Promise<Checked> {
  const { sheet } = parseWk1(bytes);
  const verification = verifySheet(sheet);
  const results = new Map(verification.cells.map((r) => [r.address, r]));
  const back = await readXlsx((await writeXlsx({ sheet, verification })).bytes);
  const checked: Checked = { cells: 0, formulas: 0, errCells: 0, noResultFormulas: [] };
  const lotus = new Set<string>();
  for (const cell of sheet.cells.values()) {
    if (cell.col >= 16384 || cell.row >= 1048576) continue;
    const address = a1(cell.col, cell.row);
    lotus.add(address);
    const got = back.cells.get(address);
    const nonFinite = (cell.kind === "number" || cell.kind === "integer") && !Number.isFinite(cell.value);
    if (!got) {
      expect.fail(`${address} is missing from the workbook`);
    }
    checked.cells++;
    if (cell.kind === "number" || cell.kind === "integer") {
      expect(got.formula, address).toBeNull();
      expectDouble(got.value, cell.value, address);
      if (nonFinite) expect(got.note, address).not.toBeNull();
      if (cell.value === Infinity) checked.errCells++;
    } else if (cell.kind === "label") {
      expect(got.value, address).toBe(cell.text);
    } else {
      checked.formulas++;
      const r = results.get(address)!;
      expect(got.formula, address).toBe(r.formula);
      if (r.formula === null) expectDouble(got.value, cell.cached, address);
      else expectDouble(got.result, cell.cached, address);
      if (Number.isNaN(cell.cached)) checked.noResultFormulas.push(address);
    }
  }
  expect([...back.cells.keys()].filter((a) => !lotus.has(a))).toEqual([]);
  return checked;
}

describe("round trip of the synthetic fixtures", () => {
  for (const f of buildAll()) {
    it(f.path, async () => {
      const { sheet } = parseWk1(f.bytes);
      expect((await roundTrip(f.bytes)).cells).toBe(sheet.cells.size);
    });
  }
});

type ManifestEntry = { path: string; sha256: string; counts: { cells: number; formulas: number } };
const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: ManifestEntry[] };
const read = (f: ManifestEntry) => {
  const bytes = new Uint8Array(readFileSync(f.path));
  expect(createHash("sha256").update(bytes).digest("hex"), f.path).toBe(f.sha256);
  return bytes;
};

describe("round trip of every manifest fixture", () => {
  it("skips exactly the fixtures verifyBytes cannot read as wk1 or wks", () => {
    const skipped = manifest.fixtures.filter((f) => verifyBytes(read(f)).verification.format === "unknown").map((f) => f.path);
    expect(skipped).toEqual(["fixtures/natural-earth-land/ne_110m_land.dbf"]);
  });

  for (const f of manifest.fixtures.filter((x) => !x.path.endsWith(".dbf"))) {
    it(f.path, async () => {
      const checked = await roundTrip(read(f));
      expect(checked.cells).toBe(f.counts.cells);
      expect(checked.formulas).toBe(f.counts.formulas);
      if (f.path.endsWith("KSBASE.WK1")) {
        expect(checked.formulas).toBe(160);
        expect(checked.errCells).toBe(6);
      }
      if (f.path.endsWith("gnome647171-1.wks")) expect(checked.noResultFormulas).toEqual(["A5"]);
    });
  }
});
