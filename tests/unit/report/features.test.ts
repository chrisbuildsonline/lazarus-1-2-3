// Unknown opcodes and unsupported features read from reason messages (requirements 35 to 37).
// Each message is built with the verify helper, so a reworded message fails here first.
import { describe, expect, it } from "vitest";
import { buildReport } from "../../../src/report/index.ts";
import { TOLERANCE, type CellResult, type Reason } from "../../../src/verify/index.ts";
import { circularReference, decodeError, stringResult, undocumented, unknownOpcode, unsupportedFunction, volatileFunction } from "../../../src/verify/value.ts";

const row = (i: number, reason: Reason, candidateOpcodes: number[] = []): CellResult => ({
  address: `A${i + 1}`,
  col: 0,
  row: i,
  status: "unverifiable",
  cached: { t: "num", v: 1 },
  recalculated: null,
  reason,
  formula: null,
  lotusFormula: null,
  candidateOpcodes,
});

const report = (reasons: Reason[], candidates: number[][] = []) => {
  const cells = reasons.map((r, i) => row(i, r, candidates[i]));
  return buildReport({
    fileName: "x.wk1",
    sha256: "0".repeat(64),
    byteLength: 1,
    toolVersion: "0",
    verification: { name: "", format: "wk1", tolerance: TOLERANCE, cells, totals: { formulas: cells.length, matched: 0, mismatched: 0, unverifiable: cells.length, exact: 0, withinTolerance: 0, byReason: {} } },
  });
};

describe("features", () => {
  it("lists unknown opcodes by opcode with their addresses", () => {
    const r = report([unknownOpcode(0xff, 9), unknownOpcode(0x4a, 3), unknownOpcode(0xff, 1)]);
    expect(r.unknownOpcodes).toEqual([
      { opcode: "0x4A", count: 1, addresses: ["A2"] },
      { opcode: "0xFF", count: 2, addresses: ["A1", "A3"] },
    ]);
    expect(r.unsupportedFeatures).toEqual([]);
  });

  it("lists each unsupported feature with code, rule, name, count and addresses, sorted", () => {
    const r = report([volatileFunction("RAND"), unsupportedFunction("IRR"), unsupportedFunction("IRR"), circularReference(["A4"]), undocumented("U02", "x"), decodeError("truncated-stream", "short"), stringResult()]);
    expect(r.unsupportedFeatures).toEqual([
      { code: "circular-reference", rule: "S26", name: null, count: 1, addresses: ["A4"] },
      { code: "decode-error", rule: null, name: null, count: 1, addresses: ["A6"] },
      { code: "string-result", rule: null, name: null, count: 1, addresses: ["A7"] },
      { code: "undocumented-semantics", rule: "U02", name: null, count: 1, addresses: ["A5"] },
      { code: "unsupported-function", rule: null, name: "IRR", count: 2, addresses: ["A2", "A3"] },
      { code: "volatile-function", rule: "S25", name: "RAND", count: 1, addresses: ["A1"] },
    ]);
  });

  it("keeps the first 50 addresses in row-major order with the true count", () => {
    const r = report(Array.from({ length: 60 }, () => unsupportedFunction("IRR")));
    expect(r.unsupportedFeatures[0]!.count).toBe(60);
    expect(r.unsupportedFeatures[0]!.addresses).toEqual(Array.from({ length: 50 }, (_, i) => `A${i + 1}`));
  });

  it("uses null when the message does not match and still lists the cell", () => {
    const r = report([{ code: "unknown-opcode", message: "reworded" }, { code: "unsupported-function", message: "reworded" }]);
    expect(r.unknownOpcodes).toEqual([{ opcode: null, count: 1, addresses: ["A1"] }]);
    expect(r.unsupportedFeatures).toEqual([{ code: "unsupported-function", rule: null, name: null, count: 1, addresses: ["A2"] }]);
  });

  it("lists candidate opcodes per row, not among unknown opcodes", () => {
    const r = report([stringResult()], [[0x08]]);
    expect(r.rows[0]!.candidateOpcodes).toEqual(["0x08"]);
    expect(r.unknownOpcodes).toEqual([]);
  });
});
