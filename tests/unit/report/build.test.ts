// buildReport, sha256Hex and serializeReportJson (requirements 27 to 34, 38).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildReport, serializeReportJson, sha256Hex, type ReportInput } from "../../../src/report/index.ts";
import { TOLERANCE, type CellResult, type SheetVerification } from "../../../src/verify/index.ts";

const cell = (address: string, row: number, over: Partial<CellResult>): CellResult => ({
  address,
  col: 0,
  row,
  status: "matched",
  cached: { t: "num", v: 0.1 + 0.2 },
  recalculated: { t: "num", v: 0.3 },
  reason: { code: "within-tolerance", message: "close" },
  formula: "A9+1",
  lotusFormula: "+A9+1",
  candidateOpcodes: [],
  ...over,
});

const verification = (): SheetVerification => ({
  name: "x",
  format: "wk1",
  tolerance: { ...TOLERANCE },
  cells: [
    cell("A1", 0, {}),
    cell("A2", 1, {
      status: "mismatched",
      cached: { t: "num", v: 5 },
      recalculated: { t: "num", v: 2 },
      reason: { code: "value-differs", message: "differs" },
      inputs: [{ address: "B1", kind: "number", value: { t: "num", v: 1 }, cached: { t: "num", v: 1 } }],
    }),
    cell("A3", 2, { status: "unverifiable", recalculated: null, reason: { code: "volatile-function", rule: "S25", message: "This formula uses @RAND, which gives" }, formula: null, candidateOpcodes: [0x08, 0x0a] }),
  ],
  totals: { formulas: 3, matched: 1, mismatched: 1, unverifiable: 1, exact: 0, withinTolerance: 1, byReason: { "within-tolerance": 1, "value-differs": 1, "volatile-function": 1 } },
});

const input = (fileName: string, v = verification()): ReportInput => ({ fileName, sha256: "a".repeat(64), byteLength: 99, toolVersion: "1.2.3", verification: v });

describe("buildReport", () => {
  it("has the keys of requirement 29 in order, schema 1, and the tool", () => {
    const r = buildReport(input("BOOK.WK1"));
    expect(Object.keys(r)).toEqual(["schemaVersion", "tool", "source", "tolerance", "totals", "unsupportedFeatures", "unknownOpcodes", "rows"]);
    expect(r.schemaVersion).toBe(1);
    expect(r.tool).toEqual({ name: "lazarus-1-2-3", version: "1.2.3" });
    expect(r.source).toEqual({ fileName: "BOOK.WK1", sha256: "a".repeat(64), byteLength: 99, format: "wk1" });
    expect(r.tolerance).toEqual(TOLERANCE);
  });

  it("keeps the base name only", () => {
    for (const name of ["C:\\old\\BOOK.WK1", "/tmp/x/BOOK.WK1", "BOOK.WK1"]) expect(buildReport(input(name)).source.fileName).toBe("BOOK.WK1");
  });

  it("copies rows in order with unrounded values, inputs and candidate opcodes", () => {
    const r = buildReport(input("B.WK1"));
    expect(r.rows.map((x) => x.address)).toEqual(["A1", "A2", "A3"]);
    expect(r.rows[0]).toEqual({ address: "A1", lotusFormula: "+A9+1", excelFormula: "A9+1", cached: { t: "num", v: 0.30000000000000004 }, recalculated: { t: "num", v: 0.3 }, status: "matched", reason: { code: "within-tolerance", message: "close" } });
    expect(r.rows[1]!.inputs).toEqual([{ address: "B1", kind: "number", value: { t: "num", v: 1 }, cached: { t: "num", v: 1 } }]);
    expect(r.rows[2]!.candidateOpcodes).toEqual(["0x08", "0x0A"]);
    expect(r.rows[0]!.candidateOpcodes).toBeUndefined();
  });

  it("copies totals and shares no reference with its input", () => {
    const v = verification();
    const r = buildReport(input("B.WK1", v));
    const before = serializeReportJson(r);
    expect(r.totals).toEqual(v.totals);
    expect(r.totals.formulas).toBe(r.rows.length);
    v.totals.byReason["value-differs"] = 7;
    (v.tolerance as { relative: number }).relative = 1;
    (v.cells[0]!.cached as { v: number }).v = 42;
    v.cells[1]!.inputs![0]!.address = "Z9";
    v.cells[2]!.reason.message = "changed";
    expect(serializeReportJson(r)).toBe(before);
  });
});

describe("sha256Hex", () => {
  it("matches the FIPS 180-2 example and the empty-input digest", async () => {
    // FIPS 180-2, Appendix B.1: SHA-256("abc").
    expect(await sha256Hex(new TextEncoder().encode("abc"))).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
    // SHA-256 of the empty message (NIST CSRC example values).
    expect(await sha256Hex(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855");
  });

  it("matches the manifest hash of a fixture", async () => {
    const m = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: { path: string; sha256: string }[] };
    const f = m.fixtures.find((x) => x.path.endsWith("KSBASE.WK1"))!;
    expect(await sha256Hex(new Uint8Array(readFileSync(f.path)))).toBe(f.sha256);
  });
});

describe("serializeReportJson", () => {
  it("uses two-space indent, a trailing newline, the key order, and parses back equal", () => {
    const r = buildReport(input("B.WK1"));
    const s = serializeReportJson(r);
    expect(s.endsWith("}\n")).toBe(true);
    expect(s.split("\n")[1]).toBe('  "schemaVersion": 1,');
    expect(JSON.parse(s)).toEqual(r);
    expect(serializeReportJson(r)).toBe(s);
  });
});
