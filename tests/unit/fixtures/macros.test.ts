// The macros fixture (requirements 56 to 58, Acceptance 1, 2 and 4). Expected values come from
// design.md "Fixture" and the generator spec, not from what the code under test prints.
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { OPCODE_TABLE } from "../../../src/formula/opcodes.ts";
import { buildQueue, detectMacros, readNames, requestText, type ExplainRequest } from "../../../src/macro/index.ts";
import { parseWk1 } from "../../../src/parser/index.ts";
import { raiseFixture } from "../helpers/raised.ts";

const PATH = "fixtures/macros/macros.wk1";
const RECORDED = "fixtures/macros/recorded-explanations.json";
const bytes = () => new Uint8Array(readFileSync(PATH));
const sha = (t: string) => createHash("sha256").update(t, "utf8").digest("hex");
// The unknown byte: the lowest above 0x60 that src/formula/opcodes.ts does not list (0x5A is the last entry).
const UNKNOWN = "0x61";

describe("fixtures/macros/macros.wk1", () => {
  it("exists with a LICENSE.txt", () => {
    expect(existsSync(PATH)).toBe(true);
    expect(readFileSync("fixtures/macros/LICENSE.txt", "utf8")).toMatch(/^Redistribution: allowed$/m);
  });

  it("holds the NAME records \\0 over F1 and \\P over H1", () => {
    const { names, notes } = readNames(bytes());
    expect(names.map((n) => [n.name, n.startCol, n.startRow, n.endCol, n.endRow])).toEqual([
      ["\\0", 5, 0, 5, 0],
      ["\\P", 7, 0, 7, 0],
    ]);
    expect(notes).toEqual([]);
  });

  it("parses with no error diagnostic", () => {
    const r = parseWk1(bytes());
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(r.stats.skippedByOpcode[11]).toBe(2);
  });

  it("gives the three macros of Acceptance 2", () => {
    const sheet = parseWk1(bytes()).sheet;
    const { macros, notes } = detectMacros(sheet, readNames(bytes()).names, "Sheet1");
    expect(notes).toEqual([]);
    expect(macros.map((m) => [m.name, m.start, m.lines, m.source])).toEqual([
      ["\\0", "F1", ["{GOTO}A1~", "{CALC}", "{QUIT}"], "named"],
      ["\\P", "H1", ["/PPRA1..D8~GQ"], "named"],
      [null, "J1", ["{GOTO}D8~", "{DOWN 3}{EDIT}"], "unnamed"],
    ]);
  });

  it("has exactly one unknown-opcode reason, on A10, with a byte the table does not know", async () => {
    expect(OPCODE_TABLE.has(Number.parseInt(UNKNOWN, 16))).toBe(false);
    for (let b = 0x61; b < Number.parseInt(UNKNOWN, 16); b++) expect(OPCODE_TABLE.has(b)).toBe(true);
    const file = await raiseFixture(PATH);
    const unknown = file.sheets.flatMap((s) => s.verification.cells).filter((c) => c.reason.code === "unknown-opcode");
    expect(unknown.map((c) => [c.address, c.cached])).toEqual([["A10", { t: "num", v: 42 }]]);
    expect(unknown[0]!.reason.message).toContain(`opcode ${UNKNOWN} at offset`);
  });

  it("gives four pending items: three macros and the opcode with its cell", async () => {
    const file = await raiseFixture(PATH);
    const macros = detectMacros(parseWk1(bytes()).sheet, readNames(bytes()).names, "Sheet1").macros;
    const q = buildQueue({ macros, sheets: file.sheets.map((s) => ({ name: s.name, cells: s.verification.cells })) }, null);
    expect(q.items.map((i) => [i.title, i.status, i.cells])).toEqual([
      ["\\0", "pending", ["F1"]],
      ["\\P", "pending", ["H1"]],
      ["Macro at J1", "pending", ["J1"]],
      [UNKNOWN, "pending", ["A10"]],
    ]);
    expect(q.items[0]!.steps.map((s) => s.label)).toEqual(["Go to A1", "Press Calc (F9)", "End the macro"]);
    expect(q.items[2]!.steps.map((s) => s.label)).toEqual(["Go to D8", "Press Down 3 times", "Press Edit (F2)"]);
  });
});

describe("fixtures/macros/recorded-explanations.json", () => {
  // The four requests, written out from design.md "Fixture" and Acceptance 3.
  const requests: ExplainRequest[] = [
    { kind: "macro", text: "{GOTO}A1~{CALC}{QUIT}", stepLabels: ["Go to A1", "Press Calc (F9)", "End the macro"] },
    // No Release 2 menu tree was sourced (evidence.md, "What the later tasks may use"), so each key
    // after "/" up to the Enter is one unknown-key step, then Enter, then the typed rest.
    { kind: "macro", text: "/PPRA1..D8~GQ", stepLabels: [..."PPRA1..D8"].map((k) => `Unknown menu key "${k}"`).concat(["Press Enter", 'Type "GQ"']) },
    { kind: "macro", text: "{GOTO}D8~{DOWN 3}{EDIT}", stepLabels: ["Go to D8", "Press Down 3 times", "Press Edit (F2)"] },
    { kind: "unknown-opcode", opcode: UNKNOWN },
  ];
  const recorded = () => JSON.parse(readFileSync(RECORDED, "utf8")) as { schemaVersion: number; model: string; note: string; entries: Record<string, { suggestion: string; rationale: string | null; confidence: string | null }> };

  it("has the header of design.md", () => {
    const r = recorded();
    expect(r.schemaVersion).toBe(1);
    expect(r.model).toBe("recorded fixture");
    expect(r.note).toBe("Text written by the developer to stand in for a model.");
  });

  it("has one entry per queue item, keyed by the SHA-256 of its request text", () => {
    const r = recorded();
    expect(Object.keys(r.entries).sort()).toEqual(requests.map((q) => sha(requestText(q))).sort());
    for (const [i, q] of requests.entries()) {
      const e = r.entries[sha(requestText(q))]!;
      expect(e.suggestion.length, String(i)).toBeGreaterThan(0);
      if (q.kind === "macro") expect([e.rationale, e.confidence]).toEqual([null, null]);
      else expect(["Low", "Medium", "High"]).toContain(e.confidence);
    }
  });
});
