// The approval pill (DESIGN.md section 3, requirement 65): text and a glyph, never colour alone.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { QueuePill } from "../../../../src/ui/components/QueuePill.tsx";

describe("QueuePill", () => {
  it.each([
    ["waiting", "Waiting", "glyph--dash"],
    ["approved", "Approved", "glyph--check"],
    ["rejected", "Rejected", "glyph--cross"],
  ] as const)("%s reads %s with its glyph", (state, text, glyph) => {
    const html = renderToStaticMarkup(<QueuePill state={state} />);
    expect(html).toContain(`>${text}</span>`);
    expect(html).toContain(`pill--queue-${state}`);
    expect(html).toMatch(new RegExp(`class="pill__glyph ${glyph}" aria-hidden="true"`));
    expect(html).not.toContain("style=");
  });
});
