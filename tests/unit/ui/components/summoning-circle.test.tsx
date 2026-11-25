// The summoning circle in the drop zone (seance-visuals task 5; requirements 10 to 15). Decoration only:
// the zone stays one button with the same text, and the circle adds nothing to its accessible name.
import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DropZone } from "../../../../src/ui/components/DropZone.tsx";
import { SummoningCircle } from "../../../../src/ui/components/SummoningCircle.tsx";
import { COPY } from "../../../../src/ui/copy.ts";
import { RUNES } from "../../../../src/ui/model/runes.ts";

const noop = () => {};
const zone = () => renderToStaticMarkup(<DropZone onActivate={noop} onDrop={noop} />);
const count = (html: string, re: RegExp) => html.match(re)?.length ?? 0;
const svg = (html: string) => /<svg[^>]*class="summoning-circle"[\s\S]*?<\/svg>/.exec(html)?.[0] ?? "";
const textOf = (html: string) => html.replace(/<svg[\s\S]*?<\/svg>/g, "").replace(/<[^>]+>/g, "");

describe("DropZone with the summoning circle", () => {
  it("is still one button, whose text is the same as before the circle", () => {
    const html = zone();
    expect(count(html, /<button\b/g)).toBe(1);
    expect(textOf(html)).toBe(COPY.dropZone + COPY.dropZonePhone + COPY.dropZoneHint);
  });

  it("holds the circle as aria-hidden decoration with nothing focusable in it", () => {
    const circle = svg(zone());
    expect(circle).not.toBe("");
    expect(circle).toMatch(/^<svg[^>]*aria-hidden="true"/);
    expect(circle).toMatch(/^<svg[^>]*focusable="false"/);
    expect(circle).not.toMatch(/tabindex|<a\b|<button\b|<foreignObject/i);
  });

  it("has two rings, five candles, one rune ring with every rune, and the file glyph at the centre", () => {
    const circle = svg(zone());
    expect(count(circle, /class="circle__ring\b/g)).toBe(2);
    expect(count(circle, /<g class="circle__candle"/g)).toBe(5);
    expect(count(circle, /<textPath\b/g)).toBe(1);
    const runes = /<textPath[^>]*>([^<]*)<\/textPath>/.exec(circle)![1]!;
    for (const r of RUNES) expect(runes).toContain(r);
    expect(count(circle, /class="circle__glyph"/g)).toBe(1);
  });

  it("puts no colour literal in the markup, and its path ids are unique per circle", () => {
    const html = renderToStaticMarkup(
      <>
        <SummoningCircle />
        <SummoningCircle />
      </>,
    );
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i);
    const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    expect(ids.length).toBeGreaterThanOrEqual(2);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("app.css moves the circle with transitions only: no keyframes and no animation for it", () => {
    const css = readFileSync("src/ui/styles/app.css", "utf8");
    const rules = [...css.matchAll(/([^{}]*circle__[^{}]*)\{([^}]*)\}/g)];
    expect(rules.length).toBeGreaterThan(0);
    for (const [, selector, body] of rules) expect(body, selector).not.toMatch(/animation|infinite/);
    expect(css).not.toMatch(/@keyframes[^{]*(circle|rune|candle)/);
  });
});
