// Every string of DESIGN.md section 7 lives in src/ui/copy.ts, in the tone it asks for (requirement 62).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { COPY } from "../../../src/ui/copy.ts";

/** The section 7 table, one string per slot alternative ("A / B" and "A · B" are two strings). */
const designStrings = (() => {
  const md = readFileSync("design/DESIGN.md", "utf8");
  const section = md.slice(md.indexOf("## 7. Copy guide"), md.indexOf("## 8."));
  const rows = [...section.matchAll(/^\| ([^|]+) \| ([^|]+) \|$/gm)].map((m) => [m[1]!.trim(), m[2]!.trim()] as const);
  return rows.filter(([slot]) => slot !== "Slot" && !slot.startsWith("---")).flatMap(([, s]) => s.split(/ \/ | · /));
})();

/** Every string of COPY; a function is called with "N" for each parameter. */
function flatten(v: unknown): string[] {
  if (typeof v === "string") return [v];
  if (typeof v === "function") return [String(v(...Array.from({ length: v.length }, () => "N")))];
  if (v && typeof v === "object") return Object.values(v).flatMap(flatten);
  return [];
}

describe("copy.ts", () => {
  const all = flatten(COPY);

  it("the design table parses into its strings", () => {
    expect(designStrings).toContain("Raise a Lotus 1-2-3 file");
    expect(designStrings).toContain("Raised, with N disagreements");
    expect(designStrings).toContain("JSON");
    expect(designStrings.length).toBeGreaterThanOrEqual(20);
  });

  it("holds every string of DESIGN.md section 7", () => {
    for (const s of designStrings) expect(all, s).toContain(s);
  });

  it("holds the Macros view strings of requirements 45, 60, 64 to 69 and 75 verbatim", () => {
    expect(COPY.explanationUnavailable).toBe("Explanation unavailable: the local model is not running. The steps above are complete.");
    expect(COPY.macrosTitle).toBe("Macros");
    expect(COPY.aiLine).toBe("The model only explains. It never reads or changes a number.");
    expect(COPY.macroPageTitle("ledger.wk1")).toBe("Macros · ledger.wk1 · Lazarus 1-2-3");
    expect(COPY.queueLabel).toBe("Macros and unknown codes");
    expect(COPY.queueHint).toBe("A approve · R reject · Z undo while the list has focus");
    expect(COPY.macroKind).toBe("Macro");
    expect(COPY.opcodeKind).toBe("Unknown opcode");
    expect([COPY.pillWaiting, COPY.pillApproved, COPY.pillRejected]).toEqual(["Waiting", "Approved", "Rejected"]);
    expect(COPY.toastApproved).toBe("Approved. Press Z to undo.");
    expect(COPY.toastRejected).toBe("Rejected. Press Z to undo.");
    expect(COPY.toastUndone).toBe("Decision undone.");
    expect(COPY.parsedLabel).toBe("Parsed (deterministic)");
    expect(COPY.explanationLabel).toBe("Explanation (local model, unchecked)");
    expect(COPY.explanationLoading).toBe("Asking the local model...");
    expect(COPY.opcodeApproveNote).toBe("Approving records your decision in the report. The cell stays Unverifiable until the engine can reproduce the remembered value.");
    expect(COPY.confidence("Medium")).toBe("Confidence: Medium");
    expect([COPY.approve, COPY.reject, COPY.backToList, COPY.tabSheet, COPY.modelRecorded]).toEqual(["Approve", "Reject", "Back to list", "Sheet", "recorded fixture"]);
    expect(COPY.tabMacros(4)).toBe("Macros 4");
    expect(COPY.tabMacros(0)).toBe("Macros");
    expect(COPY.macroEmpty).toBe("No macros in this file.");
    expect(COPY.macroEmptyWk3).toBe("Macros in WK3 files and dBase tables are not read yet.");
    expect(COPY.limits).toBe(
      "This version reads WK1, WKS and WK3 worksheets and dBase tables. WK3 formulas are checked when they read only their own sheet; a formula that reads another sheet keeps its stored result. Macros in WK1 and WKS files are listed as steps for you to approve. They are never run, and macros in WK3 files are not read yet.",
    );
  });

  it("never says correct or 100% accurate, and has no exclamation mark", () => {
    for (const s of all) {
      expect(s, s).not.toMatch(/correct/i);
      expect(s, s).not.toContain("100% accurate");
      expect(s, s).not.toContain("!");
    }
  });
});
