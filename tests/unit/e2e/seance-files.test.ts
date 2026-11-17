// The e2e fixture builders must keep meaning what the specs say they mean (design.md "Test strategy").
import { describe, expect, it } from "vitest";
import { corruptWk1, mismatchWk1, mixedStatusWk1, UNKNOWN_OPCODE, UNKNOWN_RPN } from "../../../e2e/fixtures/seance-files.ts";
import { decodeRpn } from "../../../src/formula/decode.ts";
import { parseWk1 } from "../../../src/parser/index.ts";
import { verifyBytes } from "../../../src/verify/index.ts";

const statuses = (bytes: Uint8Array) => Object.fromEntries(verifyBytes(bytes).verification.cells.map((c) => [c.address, c.status]));

describe("e2e fixture files", () => {
  it("the mixed-status formula uses an opcode the decoder does not know", () => {
    const decoded = decodeRpn(Uint8Array.from(UNKNOWN_RPN), { col: 3, row: 0 });
    expect(decoded.unknown).toEqual({ opcode: UNKNOWN_OPCODE, offset: 0 });
    expect(decoded.diagnostics.map((d) => d.code)).toEqual(["unknown-opcode"]);
  });

  it("mixed-status.wk1 has one mismatched and one unverifiable cell, for the unknown opcode", () => {
    const v = verifyBytes(mixedStatusWk1()).verification;
    expect(v.totals).toMatchObject({ formulas: 4, matched: 2, mismatched: 1, unverifiable: 1 });
    expect(statuses(mixedStatusWk1())).toEqual({ C1: "mismatched", D1: "unverifiable", A2: "matched", B2: "matched" });
    expect(v.cells.find((c) => c.address === "D1")!.reason.code).toBe("unknown-opcode");
  });

  it("mismatch.wk1 stores 6 in C1 where the engine computes 5", () => {
    expect(statuses(mismatchWk1())).toEqual({ C1: "mismatched", A2: "matched", B2: "matched" });
  });

  it("corrupt.wk1 is a WK1 with no cell and one error", () => {
    const parsed = parseWk1(corruptWk1());
    expect(parsed.sheet.cells.size).toBe(0);
    expect(parsed.diagnostics.map((d) => [d.severity, d.code])).toEqual([["error", "truncated-record"]]);
    expect(verifyBytes(corruptWk1()).verification.format).toBe("wk1");
  });
});
