// Markup of the Macros view (design.md "Markup tests", requirements 59 to 75). Focus, keys and layout
// are covered by e2e/seance-macros.spec.ts.
import { renderToStaticMarkup } from "react-dom/server";
import { beforeAll, describe, expect, it } from "vitest";
import { approve, buildQueue, setExplanation, type MacroQueue, type QueueItem } from "../../../../src/macro/index.ts";
import { MacrosView, type MacrosViewProps } from "../../../../src/ui/components/MacrosView.tsx";
import { COPY } from "../../../../src/ui/copy.ts";
import { raiseFixture } from "../../helpers/raised.ts";

let queue: MacroQueue;
beforeAll(async () => {
  const file = await raiseFixture("fixtures/macros/macros.wk1");
  queue = buildQueue({ macros: file.macros, sheets: file.sheets.map((s) => ({ name: s.name, cells: s.verification.cells })) }, "2026-11-18T14:03:00.000Z");
});

const noop = () => {};
const view = (p: Partial<MacrosViewProps> = {}) =>
  renderToStaticMarkup(
    <MacrosView queue={queue} selectedId={queue.items[0]!.id} explainState="idle" noteLines={[]} narrow={false} open={false} format="wk1" timeZone="UTC" onSelect={noop} onDecide={noop} onUndo={noop} onOpen={noop} onClose={noop} {...p} />,
  );
const count = (s: string, re: RegExp) => s.match(re)?.length ?? 0;
const primaries = (html: string) => count(html, /class="[^"]*\bbtn-primary\b/g);
const opcodeItem = (q: MacroQueue): QueueItem => q.items.find((i) => i.kind === "unknown-opcode")!;

describe("MacrosView", () => {
  it("one h1 Macros, the status line and the AI line", () => {
    const html = view();
    expect(count(html, /<h1/g)).toBe(1);
    expect(html).toMatch(/<h1[^>]*>Macros<\/h1>/);
    expect(html).toContain(">4 waiting<");
    expect(html).toContain(COPY.aiLine);
  });

  it("a labelled listbox with four options, one tab stop, one selected", () => {
    const html = view();
    expect(html).toMatch(/role="listbox"[^>]*aria-label="Macros and unknown codes"/);
    expect(count(html, /role="option"/g)).toBe(4);
    expect(count(html, /role="option"[^>]*tabindex="0"/g)).toBe(1);
    expect(count(html, /aria-selected="true"/g)).toBe(1);
  });

  it("each row has its kind text and pill text, and the hint line shows", () => {
    const html = view();
    expect(count(html, />Macro</g)).toBeGreaterThanOrEqual(3);
    expect(html).toContain(">Unknown opcode<");
    expect(count(html, />Waiting</g)).toBeGreaterThanOrEqual(4);
    expect(html).toContain(">14:03<");
    expect(html).toContain(COPY.queueHint);
  });

  it("the detail: steps block before the explanation heading, the model name, one primary", () => {
    const q = setExplanation(queue, queue.items[0]!.id, { suggestion: "Goes to A1.", rationale: null, confidence: null, model: "recorded fixture" });
    const html = view({ queue: q, explainState: "done" });
    const steps = html.indexOf(COPY.parsedLabel);
    const heading = html.indexOf(COPY.explanationLabel);
    expect(steps).toBeGreaterThan(0);
    expect(heading).toBeGreaterThan(steps);
    expect(html.indexOf("Go to A1")).toBeGreaterThan(steps);
    expect(html.indexOf("Go to A1")).toBeLessThan(heading);
    expect(html).toContain(">recorded fixture<");
    expect(html.indexOf("Goes to A1.")).toBeGreaterThan(heading);
    expect(primaries(html)).toBe(1);
    expect(html).toMatch(/class="btn-primary[^"]*"[^>]*>Approve</);
    expect(html).toMatch(/class="btn-ghost[^"]*"[^>]*>Reject</);
  });

  it("loading is a status line, unavailable is the exact sentence, Approve stays", () => {
    const loading = view({ explainState: "loading" });
    expect(loading).toMatch(/role="status"[^>]*>Asking the local model\.\.\.</);
    const off = view({ explainState: "unavailable" });
    expect(off).toContain(COPY.explanationUnavailable);
    expect(off).toMatch(/>Approve</);
    expect(off).not.toMatch(/btn-primary[^"]*"[^>]*aria-disabled/);
  });

  it("the opcode detail: confidence as text, the approve note, the cell with its pill", () => {
    const op = opcodeItem(queue);
    const q = setExplanation(queue, op.id, { suggestion: "@ISNUMBER", rationale: "A guess.", confidence: "Medium", model: "qwen3" });
    const html = view({ queue: q, selectedId: op.id, explainState: "done" });
    expect(html).toContain(">Confidence: Medium<");
    expect(html).toContain(COPY.opcodeApproveNote);
    expect(html).toContain(">@ISNUMBER<");
    expect(html).toMatch(/A10<\/span><span class="pill pill--unverifiable"/);
  });

  it("an approved item has Approve aria-disabled, with its pill as the reason", () => {
    const q = approve(queue, queue.items[0]!.id, "T");
    const html = view({ queue: q });
    expect(html).toMatch(/class="btn-primary[^"]*" aria-disabled="true"[^>]*>Approve</);
    expect(html).toContain(">Approved<");
  });

  it("an empty queue says so, with the WK3 line for a WK3 or DBF file", () => {
    const empty = { items: [], history: [] };
    const wk1 = view({ queue: empty, selectedId: null });
    expect(wk1).toContain(COPY.macroEmpty);
    expect(wk1).not.toContain(COPY.macroEmptyWk3);
    expect(wk1).not.toContain('role="option"');
    expect(primaries(wk1)).toBe(0);
    expect(view({ queue: empty, selectedId: null, format: "wk3" })).toContain(COPY.macroEmptyWk3);
    expect(view({ queue: empty, selectedId: null, format: "dbf" })).toContain(COPY.macroEmptyWk3);
  });

  it("notes are listed in a muted block", () => {
    const html = view({ noteLines: ["NAME record at offset 0x10 is cut short."] });
    expect(html).toMatch(/class="macros__notes"[\s\S]*NAME record at offset 0x10 is cut short\./);
  });

  it("narrow: no side detail; open gives a modal dialog with the sticky footer", () => {
    const closed = view({ narrow: true });
    expect(closed).not.toContain('role="dialog"');
    expect(closed).not.toContain(COPY.parsedLabel);
    const open = view({ narrow: true, open: true });
    expect(open).toMatch(/role="dialog" aria-modal="true"/);
    expect(open).toContain("macro-dialog__foot");
    expect(open).toContain(">Back to list<");
    expect(primaries(open)).toBe(1);
  });

  it("a hostile explanation is escaped text", () => {
    const q = setExplanation(queue, queue.items[0]!.id, { suggestion: "<script>alert(1)</script>", rationale: null, confidence: null, model: "<b>m</b>" });
    const html = view({ queue: q, explainState: "done" });
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<b>m");
    expect(html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
  });
});
