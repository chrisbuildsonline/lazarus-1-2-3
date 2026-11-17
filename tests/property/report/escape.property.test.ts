// escapeHtml on arbitrary strings (requirement 41).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { escapeHtml } from "../../../src/report/escape.ts";

describe("escapeHtml properties", () => {
  it("leaves no < > \" ' and starts every & an entity it writes", () => {
    fc.assert(
      fc.property(fc.string({ unit: "binary" }), (s) => {
        const out = escapeHtml(s);
        expect(/[<>"']/.test(out)).toBe(false);
        expect(out.replace(/&(amp|lt|gt|quot|#39);/g, "").includes("&")).toBe(false);
      }),
    );
  });
});
