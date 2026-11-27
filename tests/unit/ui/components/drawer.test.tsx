// The cell drawer in its two modes (requirements 43, 47, 50). Values come from the drawer model of a
// hand-built cell: cached 6, recalculated 5 (5 - 6 = -1).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Drawer } from "../../../../src/ui/components/Drawer.tsx";
import { drawerModel } from "../../../../src/ui/model/drawer-model.ts";
import { TOLERANCE } from "../../../../src/verify/index.ts";
import { cellResult } from "../../helpers/raised.ts";

const MISMATCHED = drawerModel(
  cellResult(1, 2, "B3", "mismatched", 6, {
    recalculated: { t: "num", v: 5 },
    lotusFormula: "+A1+B1",
    formula: "A1+B1",
    inputs: [
      { address: "A1", kind: "number", value: { t: "num", v: 2 }, cached: { t: "num", v: 2 } },
      { address: "B1", kind: "number", value: { t: "num", v: 3 }, cached: { t: "num", v: 3 } },
    ],
    inputsOmitted: 0,
    candidateOpcodes: [8],
  }),
  TOLERANCE,
);
const UNCONFIRMED = "0x08: Read by this program but not yet confirmed against a real file.";
const noop = () => {};
const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe.each(["desktop", "phone"] as const)("Drawer (%s)", (mode) => {
  const html = renderToStaticMarkup(<Drawer model={MISMATCHED} mode={mode} onClose={noop} />);

  it("shows the address, the pill, the sentence and both value labels", () => {
    expect(html).toMatch(/class="drawer__address"[^>]*>B3</);
    expect(html).toContain(">Mismatched<");
    expect(html).toContain("The numbers disagree.");
    expect(html).toContain("Remembered (cached in the file)");
    expect(html).toContain("Raised (recalculated)");
    expect(text(html)).toContain("Differs by -1. Tolerance 1e-12 relative, 1e-12 absolute.");
  });

  it("puts the Lotus and the Excel formula in separate sunken blocks", () => {
    const blocks = [...html.matchAll(/<pre class="mono-block[^"]*"[^>]*>([\s\S]*?)<\/pre>/g)].map((m) => m[1]);
    expect(blocks).toEqual(["+A1+B1", "A1+B1"]);
  });

  it("has a close button named Close cell details", () => {
    expect(html).toMatch(/<button[^>]*aria-label="Close cell details"/);
  });

  it("lists the inputs and the candidate-opcode line", () => {
    const t = text(html);
    expect(t).toMatch(/A1 2/);
    expect(t).toMatch(/B1 3/);
    expect(t).toContain(UNCONFIRMED);
    expect(html).toContain(">Copy Excel formula<");
  });
});

describe("Drawer modes", () => {
  it("desktop is a complementary aside labelled by the cell", () => {
    const html = renderToStaticMarkup(<Drawer model={MISMATCHED} mode="desktop" onClose={noop} />);
    expect(html).toMatch(/<aside[^>]*role="complementary"[^>]*aria-label="Cell B3"/);
    expect(html).not.toContain('role="dialog"');
    expect(html).not.toContain("Back to list");
  });

  it("phone is a modal dialog with Back to list", () => {
    const html = renderToStaticMarkup(<Drawer model={MISMATCHED} mode="phone" onClose={noop} />);
    expect(html).toMatch(/<div[^>]*role="dialog"[^>]*aria-modal="true"[^>]*aria-label="Cell B3"|<div[^>]*aria-modal="true"[^>]*role="dialog"/);
    expect(html).toMatch(/<button[^>]*>Back to list<\/button>/);
    expect(html).not.toContain("<aside");
  });

  it("a mismatch with a cause shows it under Why, next to the values, and marks the empty input", () => {
    const m = drawerModel(
      cellResult(21, 43, "V44", "mismatched", 0.012281069011234387, {
        recalculated: { t: "err" },
        inputs: [
          { address: "C44", kind: "empty", value: null, cached: null },
          { address: "L44", kind: "number", value: { t: "num", v: 0.176 }, cached: { t: "num", v: 0.176 } },
        ],
      }),
      TOLERANCE,
    );
    for (const mode of ["desktop", "phone"] as const) {
      const html = renderToStaticMarkup(<Drawer model={m} mode={mode} onClose={noop} />);
      const cause = /<section class="drawer__cause"[^>]*>([\s\S]*?)<\/section>/.exec(html);
      expect(cause, mode).not.toBeNull();
      expect(text(cause![1]!)).toContain("Why");
      expect(text(cause![1]!)).toContain("the file no longer holds C44");
      // The cause sits right after the value pair, before the formulas.
      expect(html.indexOf("drawer__cause")).toBeGreaterThan(html.indexOf("drawer__values"));
      expect(html.indexOf("drawer__cause")).toBeLessThan(html.indexOf("drawer__formulas"));
      expect(html).toMatch(/<div class="drawer__input is-missing"><dt>C44<\/dt><dd>empty<\/dd><\/div>/);
    }
  });

  it("no cause, no Why section", () => {
    expect(renderToStaticMarkup(<Drawer model={MISMATCHED} mode="desktop" onClose={noop} />)).not.toContain("drawer__cause");
  });

  it("a missing value reads Not stored in the file, never a bare dash", () => {
    const m = drawerModel(cellResult(1, 1, "B2", "unverifiable", null, { recalculated: null, reason: { code: "cached-not-a-number", message: "x" } }), TOLERANCE);
    const html = renderToStaticMarkup(<Drawer model={m} mode="desktop" onClose={noop} />);
    expect(html).toContain("Not stored in the file");
    expect(html).toContain("Could not be calculated");
    expect(html).not.toMatch(/>\s*[-–—]\s*</);
  });
});
