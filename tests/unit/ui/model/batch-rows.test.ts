// One row of the batch surface per entry (requirement 59).
import { describe, expect, it } from "vitest";
import { batchRow, worstStatus, type FileItem } from "../../../../src/ui/model/batch-rows.ts";
import type { Totals } from "../../../../src/verify/index.ts";
import type { RaisedFile } from "../../../../src/workers/verify-protocol.ts";
import { handBuilt, raiseFixture } from "../../helpers/raised.ts";

const t = (formulas: number, matched: number, mismatched: number, unverifiable: number): Totals => ({
  formulas,
  matched,
  mismatched,
  unverifiable,
  exact: matched,
  withinTolerance: 0,
  byReason: {},
});

const withTotals = (totals: Totals, format: "wk1" | "wks" = "wk1"): RaisedFile => {
  const file = handBuilt([], []);
  const first = file.sheets[0]!;
  return { ...file, format, sheets: [{ ...first, verification: { ...first.verification, format, totals } }] };
};

const item = (more: Partial<FileItem>): FileItem => ({ id: 1, name: "LEDGER.WK1", path: "LEDGER.WK1", size: 100, phase: "raised", ...more });

describe("worstStatus", () => {
  it("picks mismatched over unverifiable over matched", () => {
    expect(worstStatus(t(10, 7, 2, 1))).toBe("mismatched");
    expect(worstStatus(t(10, 9, 0, 1))).toBe("unverifiable");
    expect(worstStatus(t(10, 10, 0, 0))).toBe("matched");
  });
});

describe("batchRow", () => {
  it("a raised file with mismatches: percentage and count", () => {
    // 986 * 1000 / 1000 = 986 tenths, 98.6%.
    const row = batchRow(item({ raised: withTotals(t(1000, 986, 2, 12)) }));
    expect(row).toEqual({ name: "LEDGER.WK1", kind: "WK1", line: "98.6% verified, 2 mismatched", pill: "mismatched" });
  });

  it("KSBASE: 100.0% verified, matched, WK1", async () => {
    const row = batchRow(item({ name: "KSBASE.WK1", raised: await raiseFixture("fixtures/ksbase/KSBASE.WK1") }));
    expect(row).toEqual({ name: "KSBASE.WK1", kind: "WK1", line: "100.0% verified", pill: "matched" });
  });

  it("a WKS file reads WKS from the file format", async () => {
    const row = batchRow(item({ name: "gnome647171-1.wks", raised: await raiseFixture("fixtures/libreoffice-wks-functions/gnome647171-1.wks") }));
    expect(row.kind).toBe("WKS");
    expect(row.pill).toBe("unverifiable");
  });

  it("a sheet with no formulas gets the neutral pill, not Matched", () => {
    const row = batchRow(item({ raised: withTotals(t(0, 0, 0, 0)) }));
    expect(row.line).toBe("No formulas");
    expect(row.pill).toBe("none");
  });

  it("a failed file: the Failed pill and the reason", () => {
    const row = batchRow(item({ phase: "failed", failure: { reason: "The file ends in the middle of a record.", lines: [] } }));
    expect(row).toEqual({ name: "LEDGER.WK1", kind: "-", line: "Could not raise: The file ends in the middle of a record.", pill: "failed" });
  });

  it("an unsupported file in a batch is a failed row", () => {
    const row = batchRow(item({ phase: "unsupported", raised: withTotals(t(0, 0, 0, 0)) }));
    expect(row.pill).toBe("failed");
    expect(row.line).toBe("Could not raise: This is not a WK1 or WKS file this version can read.");
  });

  it("queued, reading and checking items show the raising pill", () => {
    expect(batchRow(item({ phase: "queued" }))).toEqual({ name: "LEDGER.WK1", kind: "-", line: "Waiting", pill: "raising" });
    expect(batchRow(item({ phase: "reading" })).line).toBe("Reading records");
    expect(batchRow(item({ phase: "checking" })).line).toBe("Recalculating and comparing");
    for (const phase of ["queued", "reading", "checking"] as const) expect(batchRow(item({ phase })).pill).toBe("raising");
  });
});
