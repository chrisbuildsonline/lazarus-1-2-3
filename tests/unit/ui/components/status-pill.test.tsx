// The status pill: text plus a glyph shape, so colour is never the only signal (requirements 34, 68).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatusPill } from "../../../../src/ui/components/StatusPill.tsx";

const COLOUR = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i;
const glyphClass = (html: string) => /<span[^>]*class="([^"]*\bpill__glyph\b[^"]*)"/.exec(html)?.[1];

describe("StatusPill", () => {
  it("mismatched: the text, a bar glyph, no colour literal inline", () => {
    const html = renderToStaticMarkup(<StatusPill status="mismatched" />);
    expect(html).toContain(">Mismatched<");
    expect(glyphClass(html)).toMatch(/\bglyph--bar\b/);
    expect(html).not.toMatch(/style="[^"]*(#|rgb|hsl)/i);
    expect(html).not.toMatch(COLOUR);
  });

  it("each status has its own text and glyph shape: dot, bar, ring", () => {
    const shapes = { matched: "glyph--dot", mismatched: "glyph--bar", unverifiable: "glyph--ring" } as const;
    const texts = { matched: "Matched", mismatched: "Mismatched", unverifiable: "Unverifiable" } as const;
    for (const status of ["matched", "mismatched", "unverifiable"] as const) {
      const html = renderToStaticMarkup(<StatusPill status={status} />);
      expect(html, status).toContain(`>${texts[status]}<`);
      expect(glyphClass(html), status).toMatch(new RegExp(`\\b${shapes[status]}\\b`));
      expect(html, status).toMatch(new RegExp(`class="[^"]*\\bpill--${status}\\b`));
      for (const other of Object.values(shapes)) if (other !== shapes[status]) expect(html, status).not.toContain(other);
    }
  });

  it("the glyph is decorative: hidden from assistive technology, the text carries the status", () => {
    const html = renderToStaticMarkup(<StatusPill status="unverifiable" />);
    expect(html).toMatch(/<span[^>]*aria-hidden="true"[^>]*class="[^"]*pill__glyph|<span[^>]*class="[^"]*pill__glyph[^"]*"[^>]*aria-hidden="true"/);
  });
});
