// The Summon view and its drop zone (requirements 4 to 7, 15, 62).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DropZone } from "../../../../src/ui/components/DropZone.tsx";
import { SummonView } from "../../../../src/ui/components/SummonView.tsx";

const PRIVACY = "Files never leave this browser. No upload, no account.";
const LIMITS =
  "This version reads WK1, WKS and WK3 worksheets and dBase tables. WK3 formulas are checked when they read only their own sheet; a formula that reads another sheet keeps its stored result. Macros in WK1 and WKS files are listed as steps for you to approve. They are never run, and macros in WK3 files are not read yet.";
const noop = () => {};
const view = (more: Partial<Parameters<typeof SummonView>[0]> = {}) =>
  renderToStaticMarkup(<SummonView mode="idle" folderSupported={true} onSample={noop} onFiles={noop} onDrop={noop} {...more} />);

const count = (html: string, re: RegExp) => html.match(re)?.length ?? 0;
const primaries = (html: string) => [...html.matchAll(/<button[^>]*class="[^"]*\bbtn-primary\b[^"]*"[^>]*>([\s\S]*?)<\/button>/g)].map((m) => m[1]!.replace(/<[^>]+>/g, ""));
const elementsWithPrimary = (html: string) => count(html, /class="[^"]*\bbtn-primary\b/g);

describe("SummonView", () => {
  it("has exactly one h1, the title", () => {
    const html = view();
    expect(count(html, /<h1\b/g)).toBe(1);
    expect(/<h1[^>]*>([^<]*)<\/h1>/.exec(html)![1]).toBe("Raise a Lotus 1-2-3 file");
  });

  it("the subtitle names WK1, WKS, WK3 and dBase", () => {
    const sub = /<p[^>]*class="[^"]*\bsummon__subtitle\b[^"]*"[^>]*>([^<]*)<\/p>/.exec(view());
    expect(sub).not.toBeNull();
    for (const name of ["WK1", "WKS", "WK3", "dBase"]) expect(sub![1]).toContain(name);
  });

  it("the drop zone hint lists the four extensions", () => {
    const html = view();
    for (const ext of [".wk1", ".wks", ".wk3", ".dbf"]) expect(html).toContain(ext);
  });

  it("the drop zone is one button with the DESIGN.md text", () => {
    const html = view();
    const zones = [...html.matchAll(/<button[^>]*class="[^"]*\bdropzone(?=[\s"])[^"]*"[^>]*>([\s\S]*?)<\/button>/g)];
    expect(zones).toHaveLength(1);
    expect(zones[0]![1]).toContain("Drop a file or a whole folder here");
    expect(count(html, /class="[^"]*\bdropzone(?=[\s"])/g)).toBe(1);
  });

  it("has exactly one primary pill, Summon the sample", () => {
    const html = view();
    expect(elementsWithPrimary(html)).toBe(1);
    expect(primaries(html)).toEqual(["Summon the sample"]);
  });

  it("offers a real mismatch as a second, ghost sample right after the pill, never a second primary", () => {
    const html = view();
    const alt = /<button[^>]*class="([^"]*\bsummon__mismatch\b[^"]*)"[^>]*>([\s\S]*?)<\/button>/.exec(html);
    expect(alt).not.toBeNull();
    expect(alt![1]).toContain("btn-ghost");
    expect(alt![1]).not.toContain("btn-primary");
    const words = alt![2]!.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
    expect(words).toContain("Open a real mismatch");
    expect(words).toContain("m21tab.wk3");
    expect(words).toContain("NOAA");
    expect(html.indexOf("summon__mismatch")).toBeGreaterThan(html.indexOf("summon__primary"));
    expect(html.indexOf("summon__mismatch")).toBeLessThan(html.indexOf("dropzone"));
    expect(elementsWithPrimary(html)).toBe(1);
  });

  it("the mismatch sample is offered only while nothing failed", () => {
    expect(view({ mode: "failed" })).not.toContain("summon__mismatch");
    expect(view({ mode: "unsupported" })).not.toContain("summon__mismatch");
  });

  it("shows the privacy line and the limits line verbatim", () => {
    const html = view();
    expect(html).toContain(PRIVACY);
    expect(html).toContain(LIMITS);
  });

  it("offers Choose file always and Choose folder only where webkitdirectory works", () => {
    const yes = view();
    expect(yes).toContain(">Choose file<");
    expect(yes).toContain(">Choose folder<");
    expect(yes).toMatch(/<input[^>]*webkitdirectory/);
    const no = view({ folderSupported: false });
    expect(no).toContain(">Choose file<");
    expect(no).not.toContain("Choose folder");
    expect(no).not.toMatch(/webkitdirectory/);
  });

  it("the hidden file input accepts .wk1, .wks, .wk3 and .dbf and several files", () => {
    const input = /<input[^>]*accept="([^"]*)"[^>]*>/.exec(view());
    expect(input).not.toBeNull();
    expect(input![1]).toBe(".wk1,.wks,.wk3,.dbf");
    expect(input![0]).toMatch(/\bmultiple=""/);
    expect(input![0]).toMatch(/type="file"/);
  });

  it("a failed file turns the pill into Try another file, an unsupported one into Choose another file", () => {
    const failed = view({ mode: "failed" });
    expect(primaries(failed)).toEqual(["Try another file"]);
    expect(elementsWithPrimary(failed)).toBe(1);
    const unsupported = view({ mode: "unsupported" });
    expect(primaries(unsupported)).toEqual(["Choose another file"]);
    expect(elementsWithPrimary(unsupported)).toBe(1);
  });

  it("a panel shows above the drop zone, and a busy surface replaces it", () => {
    const withPanel = view({ panel: <div className="probe-panel" /> });
    expect(withPanel.indexOf("probe-panel")).toBeLessThan(withPanel.indexOf("dropzone"));
    const busy = view({ busy: <div className="probe-busy" /> });
    expect(busy).toContain("probe-busy");
    expect(busy).not.toMatch(/class="[^"]*\bdropzone(?=[\s"])/);
  });
});

describe("DropZone", () => {
  it("is a button with both the desktop and the phone text, and a decorative glyph", () => {
    const html = renderToStaticMarkup(<DropZone onActivate={noop} onDrop={noop} />);
    expect(html).toMatch(/^<div[^>]*class="[^"]*\bdropzone-wrap\b/);
    expect(html).toContain("Drop a file or a whole folder here");
    expect(html).toContain("Tap to choose a file");
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html).not.toMatch(/#[0-9a-f]{3,8}\b|rgba?\(/i);
  });
});
