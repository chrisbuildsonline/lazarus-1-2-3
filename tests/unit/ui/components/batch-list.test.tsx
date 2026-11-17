// The batch surface (requirements 58, 59, 61).
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { BatchList } from "../../../../src/ui/components/BatchList.tsx";
import type { FileItem } from "../../../../src/ui/model/batch-rows.ts";
import type { Skipped } from "../../../../src/ui/model/entries.ts";
import { raiseFixture } from "../../helpers/raised.ts";

const item = (id: number, name: string, more: Partial<FileItem> = {}): FileItem => ({ id, name, path: name, size: 1, phase: "queued", ...more });
let items: FileItem[];

beforeAll(async () => {
  const ksbase = await raiseFixture("fixtures/ksbase/KSBASE.WK1");
  items = [
    item(0, "KSBASE.WK1", { phase: "raised", raised: ksbase }),
    item(1, "corrupt.wk1", { phase: "failed", failure: { reason: "No BOF record", lines: [] } }),
    item(2, "next.wk1", { phase: "reading" }),
    ...Array.from({ length: 9 }, (_, i) => item(3 + i, `q${i}.wk1`)),
  ];
});

const SKIPPED: Skipped[] = [
  { path: "a.txt", why: "extension" },
  { path: "b.dbf", why: "extension" },
  { path: "LICENSE", why: "extension" },
];
const options = (html: string) => [...html.matchAll(/<li([^>]*role="option"[^>]*)>([\s\S]*?)<\/li>/g)].map((m) => ({ attrs: m[1]!, inner: m[2]! }));
const render = (skipped: Skipped[] = SKIPPED, selectedId: number | null = 0) =>
  renderToStaticMarkup(<BatchList items={items} skipped={skipped} selectedId={selectedId} onSelect={() => {}} />);

describe("BatchList", () => {
  it("is a listbox titled 12 files, one option per item", () => {
    const html = render();
    expect(/<h2[^>]*>([^<]*)<\/h2>/.exec(html)![1]).toBe("12 files");
    expect(html).toMatch(/<ul[^>]*role="listbox"/);
    expect(options(html)).toHaveLength(12);
  });

  it("marks the selected row with aria-selected and makes it the tab stop", () => {
    const rows = options(render(SKIPPED, 0));
    expect(rows.map((r) => /aria-selected="(\w+)"/.exec(r.attrs)![1]).filter((s) => s === "true")).toHaveLength(1);
    expect(rows[0]!.attrs).toContain('aria-selected="true"');
    expect(rows[0]!.attrs).toContain('tabindex="0"');
    expect(rows[1]!.attrs).toContain('tabindex="-1"');
  });

  it("a raised row shows its kind, its line and the worst status pill", () => {
    const k = options(render())[0]!.inner;
    expect(k).toContain("KSBASE.WK1");
    expect(k).toContain(">WK1<");
    expect(k).toContain("100.0% verified");
    expect(k).toContain(">Matched<");
  });

  it("a raising row shows the ghost bar", () => {
    const r = options(render())[2]!;
    expect(r.inner).toMatch(/class="ghost-bar"/);
    expect(r.attrs).toContain('aria-busy="true"');
  });

  it("a failed row shows a danger Failed pill and its reason", () => {
    const f = options(render())[1]!.inner;
    expect(f).toMatch(/<span class="pill pill--danger"[^>]*>(<span[^>]*><\/span>)?Failed<\/span>/);
    expect(f).toContain("Could not raise: No BOF record");
  });

  it("ends with the skipped line", () => {
    expect(render()).toContain("3 files skipped: not WK1 or WKS.");
    expect(render([{ path: "a.txt", why: "extension" }])).toContain("1 file skipped: not WK1 or WKS.");
    expect(render([])).not.toContain("skipped");
  });
});
