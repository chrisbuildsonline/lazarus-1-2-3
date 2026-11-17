// escapeHtml (requirement 41).
import { describe, expect, it } from "vitest";
import { escapeHtml } from "../../../src/report/escape.ts";

describe("escapeHtml", () => {
  it("escapes each of the five characters", () => {
    expect(escapeHtml(`&<>"'`)).toBe("&amp;&lt;&gt;&quot;&#39;");
  });

  it("escapes an existing entity again instead of trusting it", () => {
    expect(escapeHtml("&lt;")).toBe("&amp;lt;");
  });

  it("leaves other text alone", () => {
    expect(escapeHtml("")).toBe("");
    expect(escapeHtml("@SUM(A1..A3) 3.5")).toBe("@SUM(A1..A3) 3.5");
  });

  it("handles 1 MB quickly", () => {
    const s = "<a&b>".repeat(200_000);
    const start = globalThis.performance.now();
    expect(escapeHtml(s).length).toBe(200_000 * "&lt;a&amp;b&gt;".length);
    expect(globalThis.performance.now() - start).toBeLessThan(1000);
  });
});
