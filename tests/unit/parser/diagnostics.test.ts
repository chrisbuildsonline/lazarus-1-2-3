import { describe, expect, it } from "vitest";
import { DiagnosticSink, MAX_DIAGNOSTICS, type Diagnostic } from "../../../src/parser/diagnostics.ts";

const at = (offset: number): Diagnostic => ({ severity: "info", code: "skipped-opcode", offset, message: `#${offset}` });

describe("DiagnosticSink", () => {
  it("caps at 1000 by default", () => {
    expect(MAX_DIAGNOSTICS).toBe(1000);
  });

  it("keeps diagnostics in order up to the cap", () => {
    const sink = new DiagnosticSink();
    for (let i = 0; i < MAX_DIAGNOSTICS; i++) sink.add(at(i));
    expect(sink.list).toHaveLength(MAX_DIAGNOSTICS);
    expect(sink.list.map((d) => d.offset)).toEqual(Array.from({ length: MAX_DIAGNOSTICS }, (_, i) => i));
  });

  it("turns the 1001st diagnostic into one diagnostics-truncated and drops later ones", () => {
    const sink = new DiagnosticSink();
    for (let i = 0; i < MAX_DIAGNOSTICS + 50; i++) sink.add(at(i));
    expect(sink.list).toHaveLength(MAX_DIAGNOSTICS + 1);
    const last = sink.list[MAX_DIAGNOSTICS]!;
    expect(last.code).toBe("diagnostics-truncated");
    expect(last.severity).toBe("warning");
    expect(last.offset).toBe(MAX_DIAGNOSTICS);
    expect(sink.list.filter((d) => d.code === "diagnostics-truncated")).toHaveLength(1);
  });

  it("takes a smaller cap", () => {
    const sink = new DiagnosticSink(2);
    for (let i = 0; i < 5; i++) sink.add(at(i));
    expect(sink.list.map((d) => d.code)).toEqual(["skipped-opcode", "skipped-opcode", "diagnostics-truncated"]);
  });
});
