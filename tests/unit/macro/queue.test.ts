import fc from "fast-check";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { DetectedMacro } from "../../../src/macro/detect.ts";
import { approve, buildQueue, counts, explainRequest, reject, setExplanation, toReportItems, undo, type MacroQueue } from "../../../src/macro/queue.ts";
import { unknownOpcodes } from "../../../src/report/features.ts";
import type { ReportRow } from "../../../src/report/types.ts";
import type { CellResult } from "../../../src/verify/index.ts";

const macro = (start: string, name: string | null, lines: string[]): DetectedMacro => ({ id: `macro:Sheet1!${start}`, name, sheet: "Sheet1", start, lines, source: name ? "named" : "unnamed" });
const cell = (address: string, message: string, code = "unknown-opcode"): CellResult =>
  ({ address, col: 0, row: 0, status: "unverifiable", cached: { t: "num", v: 1 }, recalculated: null, reason: { code, message }, formula: null, lotusFormula: null, candidateOpcodes: [] }) as unknown as CellResult;

const input = {
  macros: [macro("F1", "\\P", ["/PPR", "A1..D8~GQ"]), macro("A12", null, ["{GOTO}B2~"])],
  sheets: [{ name: "Sheet1", cells: [cell("A10", "x (opcode 0x5A at offset 3)."), cell("B10", "y (opcode 0x5A at offset 9)."), cell("C10", "y (opcode 0x07 at offset 1)."), cell("D10", "no code here"), cell("E10", "fine", "volatile-function")] }],
};
const q0 = buildQueue(input, "2026-11-18T14:03:00.000Z");

describe("buildQueue", () => {
  it("puts macros first, then one item per opcode in ascending order, then the unknown code", () => {
    expect(q0.items.map((i) => [i.id, i.kind, i.title, i.input, i.cells, i.cellCount, i.status])).toEqual([
      ["macro:Sheet1!F1", "macro", "\\P", "/PPRA1..D8~GQ", ["F1"], 1, "pending"],
      ["macro:Sheet1!A12", "macro", "Macro at A12", "{GOTO}B2~", ["A12"], 1, "pending"],
      ["opcode:0x07", "unknown-opcode", "0x07", "0x07", ["C10"], 1, "pending"],
      ["opcode:0x5A", "unknown-opcode", "0x5A", "0x5A", ["A10", "B10"], 2, "pending"],
      ["opcode:unknown", "unknown-opcode", "Unknown code", "unknown", ["D10"], 1, "pending"],
    ]);
    expect(q0.items[0]!.steps.map((s) => s.raw).join("")).toBe("/PPRA1..D8~GQ");
    expect(q0.items[0]).toMatchObject({ suggestion: null, model: null, decidedAt: null, queuedAt: "2026-11-18T14:03:00.000Z" });
    expect(q0.history).toEqual([]);
  });
  it("caps the cells at 50 and counts all of them", () => {
    const many = Array.from({ length: 60 }, (_, i) => cell(`A${i + 1}`, `x (opcode 0x5A at offset ${i}).`));
    const q = buildQueue({ macros: [], sheets: [{ name: "S", cells: many }] }, null);
    expect(q.items).toHaveLength(1);
    expect(q.items[0]).toMatchObject({ cellCount: 60, queuedAt: null, sheet: "S" });
    expect(q.items[0]!.cells).toEqual(many.slice(0, 50).map((c) => c.address));
  });
  it("does not change its input", () => {
    const copy = structuredClone(input);
    buildQueue(input, "t");
    expect(input).toEqual(copy);
  });
  it("reads opcodes as the report does", () => {
    const rows = input.sheets[0]!.cells.map((c) => ({ address: c.address, reason: c.reason }) as ReportRow);
    const report = unknownOpcodes(rows).map((o) => [o.opcode ?? "unknown", o.addresses]);
    expect(q0.items.filter((i) => i.kind === "unknown-opcode").map((i) => [i.input, i.cells])).toEqual(report);
  });
});

describe("decisions", () => {
  it("approve, reject, change of mind and undo as a stack", () => {
    const a = approve(q0, "opcode:0x5A", "t1");
    expect(a.items[3]).toMatchObject({ status: "approved", decidedAt: "t1" });
    const b = reject(a, "opcode:0x5A", "t2");
    expect(b.items[3]).toMatchObject({ status: "rejected", decidedAt: "t2" });
    expect(counts(b)).toEqual({ pending: 4, approved: 0, rejected: 1 });
    const u1 = undo(b);
    expect(u1.restored).toBe("opcode:0x5A");
    expect(u1.queue.items[3]).toMatchObject({ status: "approved", decidedAt: "t1" });
    expect(undo(u1.queue).queue).toEqual(q0);
    expect(undo(q0)).toEqual({ queue: q0, restored: null });
  });
  it("a decision to the same status or for an unknown id returns the same object", () => {
    const a = approve(q0, "macro:Sheet1!F1", "t1");
    expect(approve(a, "macro:Sheet1!F1", "t2")).toBe(a);
    expect(reject(q0, "nope", "t")).toBe(q0);
  });
  it("setExplanation keeps status, time and history", () => {
    const a = approve(q0, "macro:Sheet1!F1", "t1");
    const e = setExplanation(a, "macro:Sheet1!F1", { suggestion: "Prints A1..D8", rationale: null, confidence: null, model: "m" });
    expect(e.items[0]).toMatchObject({ status: "approved", decidedAt: "t1", suggestion: "Prints A1..D8", model: "m" });
    expect(e.history).toBe(a.history);
    expect(e.items.map((i) => i.status)).toEqual(a.items.map((i) => i.status));
  });
  it("keeps confidence for an opcode only, and ignores an unknown id", () => {
    const ex = { suggestion: "s", rationale: "r", confidence: "High" as const, model: "m" };
    expect(setExplanation(q0, "macro:Sheet1!F1", ex).items[0]!.confidence).toBeNull();
    expect(setExplanation(q0, "opcode:0x5A", ex).items[3]).toMatchObject({ suggestion: "s", rationale: "r", confidence: "High", model: "m", status: "pending" });
    expect(setExplanation(q0, "nope", ex)).toBe(q0);
  });
  it("builds the explainer request from the item, with no cell", () => {
    expect(explainRequest(q0.items[0]!)).toEqual({ kind: "macro", text: "/PPRA1..D8~GQ", stepLabels: q0.items[0]!.steps.map((s) => s.label) });
    expect(explainRequest(q0.items[3]!)).toEqual({ kind: "unknown-opcode", opcode: "0x5A" });
  });
  it("toReportItems copies, never shares arrays", () => {
    const items = toReportItems(q0);
    expect(items[0]).toEqual({ kind: "macro", title: "\\P", sheet: "Sheet1", steps: q0.items[0]!.steps, explanation: null, rationale: null, confidence: null, model: null, status: "pending", decidedAt: null, cells: ["F1"] });
    expect(items[0]!.steps[0]).not.toBe(q0.items[0]!.steps[0]);
    expect(items[0]!.steps).not.toBe(q0.items[0]!.steps);
    expect(items[0]!.cells).not.toBe(q0.items[0]!.cells);
  });
  it("any sequence of decisions keeps the counts whole, and undoing all restores the start", () => {
    const ids = q0.items.map((i) => i.id);
    fc.assert(
      fc.property(fc.array(fc.tuple(fc.constantFrom("a", "r", "u"), fc.constantFrom(...ids)), { maxLength: 30 }), (ops) => {
        let q: MacroQueue = q0;
        for (const [op, id] of ops) q = op === "a" ? approve(q, id, "t") : op === "r" ? reject(q, id, "t") : undo(q).queue;
        const c = counts(q);
        expect(c.pending + c.approved + c.rejected).toBe(q0.items.length);
        while (q.history.length > 0) q = undo(q).queue;
        expect(q).toEqual(q0);
      }),
    );
  });
  it("reads no clock", () => {
    expect(readFileSync(new URL("../../../src/macro/queue.ts", import.meta.url), "utf8")).not.toMatch(/\bDate\b/);
  });
});
