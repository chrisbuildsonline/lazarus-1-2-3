// The inline error panels: a failed file, an unsupported file, and the worker (requirements 21, 22).
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ErrorPanel } from "../../../../src/ui/components/ErrorPanel.tsx";

const LINES = ["offset 0x0000  record 0x0000  BOF record is too short", "offset 0x01A4  formula length past end of record", "and 3 more"];
const DANGER = /\b(pill--danger|danger)\b/;

describe("ErrorPanel failed", () => {
  const html = renderToStaticMarkup(<ErrorPanel kind="failed" reason="BOF record is too short" lines={LINES} />);

  it("is an alert with the title and the danger pill", () => {
    expect(html).toMatch(/^<section[^>]*role="alert"/);
    expect(/<h2[^>]*>([^<]*)<\/h2>/.exec(html)![1]).toBe("This file could not be raised.");
    expect(html).toMatch(/<span class="pill pill--danger"[^>]*>(<span[^>]*><\/span>)?Could not raise<\/span>/);
    expect(html).toContain("BOF record is too short");
  });

  it("puts one diagnostics line per entry in a mono block", () => {
    const block = /<pre[^>]*class="[^"]*\bmono-block\b[^"]*"[^>]*>([\s\S]*?)<\/pre>/.exec(html);
    expect(block).not.toBeNull();
    const lines = [...block![1]!.matchAll(/<span class="mono-block__line">([^<]*)<\/span>/g)].map((m) => m[1]);
    expect(lines).toEqual(LINES);
  });

  it("has a Copy diagnostics text button", () => {
    expect(html).toMatch(/<button[^>]*class="btn-text"[^>]*>Copy diagnostics<\/button>/);
  });
});

describe("ErrorPanel skipped", () => {
  const html = renderToStaticMarkup(<ErrorPanel kind="skipped" lines={["1 file skipped: larger than 32 MiB."]} />);

  it("names the size limit calmly, not the extensions", () => {
    expect(/<h2[^>]*>([^<]*)<\/h2>/.exec(html)![1]).toBe("1 file skipped: larger than 32 MiB.");
    expect(html).not.toContain("not a WK1 or WKS");
    expect(html).not.toMatch(DANGER);
    expect(html).not.toContain('role="alert"');
  });
});

describe("ErrorPanel unsupported", () => {
  const html = renderToStaticMarkup(<ErrorPanel kind="unsupported" lines={[]} />);

  it("names the accepted extensions and uses no danger colour", () => {
    expect(/<h2[^>]*>([^<]*)<\/h2>/.exec(html)![1]).toBe("This is not a Lotus or dBase file this version can read.");
    for (const ext of [".wk1", ".wks", ".wk3", ".dbf"]) expect(html).toContain(`>${ext}<`);
    expect(html).not.toMatch(DANGER);
    expect(html).not.toContain('role="alert"');
  });
});

describe("ErrorPanel worker", () => {
  const html = renderToStaticMarkup(<ErrorPanel kind="worker" lines={["The checking engine could not start."]} />);

  it("is an alert with the message and Copy diagnostics", () => {
    expect(html).toMatch(/^<section[^>]*role="alert"/);
    expect(html).toContain("The checking engine could not start.");
    expect(html).toContain(">Copy diagnostics<");
  });
});
