// The progress surface while a file is raised (requirement 19): two honest stages, a 4px bar, a polite
// live region.
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProgressSurface } from "../../../../src/ui/components/ProgressSurface.tsx";

const stages = (html: string) => [...html.matchAll(/<li([^>]*)>([^<]*)<\/li>/g)].map((m) => ({ attrs: m[1]!, text: m[2]! }));
const valueNow = (html: string) => Number(/role="progressbar"[^>]*aria-valuenow="(\d+)"|aria-valuenow="(\d+)"[^>]*role="progressbar"/.exec(html)!.slice(1).find(Boolean));

describe("ProgressSurface", () => {
  it("shows the file name and two stages, the current one marked", () => {
    const html = renderToStaticMarkup(<ProgressSurface name="KSBASE.WK1" phase="reading" index={0} count={1} />);
    expect(html).toContain("KSBASE.WK1");
    const s = stages(html);
    expect(s.map((x) => x.text)).toEqual(["Reading records", "Recalculating and comparing"]);
    expect(s[0]!.attrs).toContain('aria-current="step"');
    expect(s[1]!.attrs).not.toContain("aria-current");
  });

  it("after read, the second stage is current and the bar is at 50", () => {
    const html = renderToStaticMarkup(<ProgressSurface name="KSBASE.WK1" phase="checking" index={0} count={1} />);
    const s = stages(html);
    expect(s[0]!.attrs).not.toContain("aria-current");
    expect(s[1]!.attrs).toContain('aria-current="step"');
    expect(valueNow(html)).toBe(50);
  });

  it("the bar is a progressbar from 0 to 100 named by the file", () => {
    const html = renderToStaticMarkup(<ProgressSurface name="KSBASE.WK1" phase="reading" index={0} count={1} />);
    expect(valueNow(html)).toBe(0);
    expect(html).toMatch(/role="progressbar"[^>]*aria-valuemin="0"[^>]*aria-valuemax="100"/);
    expect(html).not.toMatch(/style="[^"]*(#|rgb|hsl)/i);
  });

  it("in a batch the bar counts files: the third of four, checking, is (2 + 0.5) / 4", () => {
    const html = renderToStaticMarkup(<ProgressSurface name="b.wk1" phase="checking" index={2} count={4} />);
    // (2 + 0.5) / 4 * 100 = 62.5, rounded down to 62.
    expect(valueNow(html)).toBe(62);
    expect(html).toContain("3 of 4");
  });

  it("announces the stage in a polite live region", () => {
    const html = renderToStaticMarkup(<ProgressSurface name="KSBASE.WK1" phase="checking" index={0} count={1} />);
    const live = /<p[^>]*aria-live="polite"[^>]*>([^<]*)<\/p>/.exec(html);
    expect(live).not.toBeNull();
    expect(live![1]).toContain("Recalculating and comparing");
  });
});
