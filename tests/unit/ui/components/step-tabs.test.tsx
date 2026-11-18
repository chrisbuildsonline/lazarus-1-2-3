// Step tabs, Sheet then Macros (requirement 59): pill tabs with a roving tabindex, the waiting count
// after the Macros label, no Report tab, and aria-controls pointing at the step panel.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { STEP_PANEL, StepTabs } from "../../../../src/ui/components/StepTabs.tsx";

const view = (step: "sheet" | "macros", waiting: number, under = false) => renderToStaticMarkup(<StepTabs step={step} waiting={waiting} under={under} onStep={() => {}} />);
const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0;

describe("StepTabs", () => {
  it("is a labelled tablist with Sheet then Macros and no Report tab", () => {
    const html = view("sheet", 4);
    expect(html).toMatch(/role="tablist" aria-label="Steps"/);
    expect(count(html, /role="tab"/g)).toBe(2);
    expect(html.indexOf(">Sheet<")).toBeLessThan(html.indexOf(">Macros"));
    expect(html).not.toContain("Report");
  });

  it("the Macros tab carries the waiting count, none at zero", () => {
    expect(view("sheet", 4)).toMatch(/Macros <span class="tab__count">4<\/span>/);
    expect(view("sheet", 0)).not.toContain("tab__count");
  });

  it("the chosen step is selected and the one tab stop; both control the panel", () => {
    const html = view("macros", 2);
    expect(count(html, /aria-selected="true"/g)).toBe(1);
    expect(count(html, /tabindex="0"/g)).toBe(1);
    expect(html).toMatch(/id="step-tab-macros"[^>]*aria-selected="true"[^>]*tabindex="0"/);
    expect(count(html, new RegExp(`aria-controls="${STEP_PANEL}"`, "g"))).toBe(2);
  });

  it("under the title on a phone it is the segmented control", () => {
    expect(view("sheet", 1, true)).toContain("step-tabs--under");
    expect(view("sheet", 1, false)).not.toContain("step-tabs--under");
  });
});
