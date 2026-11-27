// What the cell drawer shows for one formula cell (requirements 43 to 46). The status always comes
// from CellResult.status; the difference is computed only to be shown.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { drawerModel } from "../../../../src/ui/model/drawer-model.ts";
import { TOLERANCE, verifyWorkbookBytes } from "../../../../src/verify/index.ts";
import { cellResult } from "../../helpers/raised.ts";

const UNCONFIRMED = "Read by this program but not yet confirmed against a real file.";

describe("drawerModel", () => {
  it("matched: the matched sentence and both values", () => {
    const m = drawerModel(cellResult(14, 2, "O3", "matched", 0.25153768659966846, { recalculated: { t: "num", v: 0.25153768659966846 } }), TOLERANCE);
    expect(m.address).toBe("O3");
    expect(m.status).toBe("matched");
    expect(m.sentence).toBe("Raised value matches what the file remembers.");
    expect(m.remembered).toBe("0.25153768659966846");
    expect(m.raised).toBe("0.25153768659966846");
    expect(m.lotus).toBe("+A1+B1");
    expect(m.excel).toBe("A1+B1");
  });

  it("mismatched: the sentence, the difference with the tolerance read from the argument, and the inputs", () => {
    const r = cellResult(2, 0, "C1", "mismatched", 6, {
      recalculated: { t: "num", v: 5 },
      reason: { code: "value-differs", message: "Recalculating this formula gives 5, but the file stores 6." },
      inputs: [
        { address: "A1", kind: "number", value: { t: "num", v: 2 }, cached: { t: "num", v: 2 } },
        { address: "B1", kind: "number", value: { t: "num", v: 3 }, cached: { t: "num", v: 3 } },
        { address: "D1", kind: "empty", value: null, cached: null },
      ],
      inputsOmitted: 4,
    });
    const m = drawerModel(r, TOLERANCE);
    expect(m.sentence).toBe("The numbers disagree.");
    expect(m.remembered).toBe("6");
    expect(m.raised).toBe("5");
    // 5 - 6 = -1.
    expect(m.difference).toBe("Differs by -1. Tolerance 1e-12 relative, 1e-12 absolute.");
    expect(drawerModel(r, { relative: 1e-9, absolute: 1e-10 }).difference).toBe("Differs by -1. Tolerance 1e-9 relative, 1e-10 absolute.");
    expect(m.inputs).toEqual([
      { address: "A1", kind: "number", value: "2", cached: "2" },
      { address: "B1", kind: "number", value: "3", cached: "3" },
      { address: "D1", kind: "empty", value: "empty", cached: "empty" },
    ]);
    expect(m.inputsOmitted).toBe(4);
    expect(m.diagnostics).toContain("value-differs");
    // A number that differs is not explained by an empty input alone: no cause is claimed.
    expect(m.cause).toBeNull();
  });

  it("mismatched to ERR with an empty input: the cause names the cell the file no longer holds", () => {
    const r = cellResult(21, 43, "V44", "mismatched", 0.012281069011234387, {
      recalculated: { t: "err" },
      lotusFormula: "L44/C44",
      reason: { code: "value-differs", message: "x" },
      inputs: [
        { address: "C44", kind: "empty", value: null, cached: null },
        { address: "L44", kind: "number", value: { t: "num", v: 0.176 }, cached: { t: "num", v: 0.176 } },
      ],
    });
    const m = drawerModel(r, TOLERANCE);
    expect(m.remembered).toBe("0.012281069011234387");
    expect(m.raised).toBe("ERR");
    expect(m.cause).toBe(
      "Recalculated now, the formula gives ERR, because the file no longer holds C44: that cell is empty. The remembered value was calculated while C44 still held a number. This is a finding about the file, not a reading error.",
    );
    expect(m.inputs[0]).toEqual({ address: "C44", kind: "empty", value: "empty", cached: "empty" });
  });

  it("two empty inputs are both named", () => {
    const empty = (address: string) => ({ address, kind: "empty" as const, value: null, cached: null });
    const m = drawerModel(cellResult(0, 0, "A1", "mismatched", 1, { recalculated: { t: "err" }, inputs: [empty("B1"), empty("C1")] }), TOLERANCE);
    expect(m.cause).toBe(
      "Recalculated now, the formula gives ERR, because the file no longer holds B1 and C1: those cells are empty. The remembered value was calculated while B1 and C1 still held numbers. This is a finding about the file, not a reading error.",
    );
  });

  it("the real NOAA file: V44 of m21tab.wk3 shows the stored value, ERR and the missing C44", () => {
    const [v] = verifyWorkbookBytes(new Uint8Array(readFileSync("fixtures/noaa-ala-wai-m21/m21tab.wk3"))).verifications;
    const v44 = v!.cells.find((c) => c.address === "V44")!;
    const m = drawerModel(v44, v!.tolerance);
    expect(m.status).toBe("mismatched");
    expect(m.remembered).toBe("0.012281069011234387");
    expect(m.raised).toBe("ERR");
    expect(m.cause).toContain("the file no longer holds C44");
    expect(m.inputs.find((i) => i.address === "C44")).toMatchObject({ kind: "empty", value: "empty" });
  });

  it("matched and unverifiable cells never get a cause", () => {
    expect(drawerModel(cellResult(0, 0, "A1", "matched", 1, { recalculated: { t: "num", v: 1 } }), TOLERANCE).cause).toBeNull();
    expect(drawerModel(cellResult(0, 0, "A1", "unverifiable", 1, { recalculated: null }), TOLERANCE).cause).toBeNull();
  });

  it("unverifiable: the reason is the sentence, no difference, and the missing recalculated value", () => {
    const message = "This formula uses @NOW, which gives a different answer every time it is calculated. It cannot be checked against the stored number.";
    const m = drawerModel(cellResult(1, 1, "B2", "unverifiable", 7, { recalculated: null, reason: { code: "volatile-function", rule: "S25", message } }), TOLERANCE);
    expect(m.sentence).toBe(message);
    expect(m.difference).toBeNull();
    expect(m.raised).toBe("Could not be calculated");
    expect(m.diagnostics).toContain("volatile-function (rule S25)");
    expect(m.inputs).toEqual([]);
    expect(m.inputsOmitted).toBe(0);
  });

  it("a cached null reads Not stored in the file", () => {
    const m = drawerModel(cellResult(1, 1, "B2", "unverifiable", null, { reason: { code: "cached-not-a-number", message: "x" } }), TOLERANCE);
    expect(m.remembered).toBe("Not stored in the file");
    expect(m.difference).toBeNull();
  });

  it("a formula that could not be read says so in its slot", () => {
    const m = drawerModel(cellResult(1, 1, "B2", "unverifiable", 1, { formula: null, lotusFormula: null }), TOLERANCE);
    expect(m.lotus).toBe("The formula could not be read.");
    expect(m.excel).toBe("The formula could not be read.");
  });

  it("within-tolerance keeps its reason message", () => {
    const message = "The recalculated value 0.30000000000000004 matches the stored value 0.3 within the tolerance (relative difference 1.85e-16).";
    const m = drawerModel(
      cellResult(0, 0, "A1", "matched", 0.3, { recalculated: { t: "num", v: 0.30000000000000004 }, reason: { code: "within-tolerance", message } }),
      TOLERANCE,
    );
    expect(m.sentence).toBe("Raised value matches what the file remembers.");
    expect(m.diagnostics).toContain(message);
  });

  it("candidate opcodes read as hex with the unconfirmed line", () => {
    const m = drawerModel(cellResult(0, 0, "A1", "matched", 1, { candidateOpcodes: [8] }), TOLERANCE);
    expect(m.diagnostics).toContain(`0x08: ${UNCONFIRMED}`);
  });

  it("source check: the status is the CellResult's and nothing compares the difference", () => {
    const src = readFileSync("src/ui/model/drawer-model.ts", "utf8");
    expect(src).toMatch(/status: r\.status/);
    expect(src).not.toMatch(/withinTolerance|Math\.abs|diff\w*\s*(?:[<>]=?|===?|!==?)|(?:[<>]=?|===?|!==?)\s*diff/);
    expect(src).not.toMatch(/status:\s*"/);
  });
});
