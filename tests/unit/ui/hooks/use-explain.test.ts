// explainStep, the pure core of useExplain (requirement 72): ask only for the shown item, only when it
// has no explanation, at most once per item and file, and cancel when the item or file changes.
import { describe, expect, it } from "vitest";
import type { ExplainRequest, Explainer, Explanation, QueueItem } from "../../../../src/macro/index.ts";
import { explainStep, type Asked } from "../../../../src/ui/hooks/useExplain.ts";
import type { ExplainState } from "../../../../src/ui/model/queue-view.ts";

const item = (id: string, more: Partial<QueueItem> = {}): QueueItem => ({
  id,
  kind: "macro",
  title: "\\0",
  sheet: "Sheet1",
  input: "{CALC}",
  steps: [{ label: "Press Calc (F9)", raw: "{CALC}" }],
  cells: ["F1"],
  cellCount: 1,
  suggestion: null,
  rationale: null,
  confidence: null,
  model: null,
  status: "pending",
  decidedAt: null,
  queuedAt: null,
  ...more,
});
const ANSWER: Explanation = { suggestion: "Recalculates.", rationale: null, confidence: null, model: "m" };

/** A fake explainer that records each call and answers when told to. */
function fake() {
  const calls: { request: ExplainRequest; signal: AbortSignal | undefined; answer: (e: Explanation | null) => void }[] = [];
  const explainer: Explainer = {
    name: "fake",
    explain: (request, signal) => new Promise((answer) => calls.push({ request, signal, answer })),
  };
  return { calls, explainer };
}

function harness(explainer: Explainer, asked: Asked = new Map()) {
  const states: ExplainState[] = [];
  const answers: { itemId: string; explanation: Explanation }[] = [];
  const step = (it: QueueItem | null, fileKey = "1:0") => {
    const c = new AbortController();
    explainStep({ item: it, fileKey, asked, explainer, signal: c.signal, setState: (s) => states.push(s), onExplained: (itemId, explanation) => answers.push({ itemId, explanation }) });
    return c;
  };
  return { states, answers, step, asked };
}
const flush = () => new Promise((r) => setTimeout(r, 0));

describe("explainStep", () => {
  it("idle without an item, done when the item has its explanation, no request", () => {
    const { calls, explainer } = fake();
    const h = harness(explainer);
    h.step(null);
    h.step(item("a", { suggestion: "x" }));
    expect(h.states).toEqual(["idle", "done"]);
    expect(calls).toHaveLength(0);
  });

  it("loading, then the answer goes to onExplained with the macro request", async () => {
    const { calls, explainer } = fake();
    const h = harness(explainer);
    h.step(item("a"));
    expect(h.states).toEqual(["loading"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.request).toEqual({ kind: "macro", text: "{CALC}", stepLabels: ["Press Calc (F9)"] });
    calls[0]!.answer(ANSWER);
    await flush();
    expect(h.answers).toEqual([{ itemId: "a", explanation: ANSWER }]);
  });

  it("null gives unavailable, and asking again for the same item and file sends nothing", async () => {
    const { calls, explainer } = fake();
    const h = harness(explainer);
    h.step(item("a"));
    calls[0]!.answer(null);
    await flush();
    expect(h.states).toEqual(["loading", "unavailable"]);
    h.step(item("a"));
    expect(h.states.at(-1)).toBe("unavailable");
    expect(calls).toHaveLength(1);
    // The same item id in another file is another question.
    h.step(item("a"), "1:1");
    expect(calls).toHaveLength(2);
  });

  it("a second step for an item still loading sends no second request", () => {
    const { calls, explainer } = fake();
    const h = harness(explainer);
    h.step(item("a"));
    h.step(item("a"));
    expect(calls).toHaveLength(1);
    expect(h.states).toEqual(["loading", "loading"]);
  });

  it("aborting (the item changed) passes the signal, drops a late answer, and allows a later ask", async () => {
    const { calls, explainer } = fake();
    const h = harness(explainer);
    const c = h.step(item("a"));
    expect(calls[0]!.signal).toBe(c.signal);
    c.abort();
    expect(calls[0]!.signal!.aborted).toBe(true);
    calls[0]!.answer(ANSWER);
    await flush();
    expect(h.answers).toEqual([]);
    expect(h.states).toEqual(["loading"]);
    h.step(item("a"));
    expect(calls).toHaveLength(2);
  });

  it("an explainer that rejects counts as unavailable", async () => {
    const h = harness({ name: "bad", explain: () => Promise.reject(new Error("boom")) });
    h.step(item("a"));
    await flush();
    expect(h.states).toEqual(["loading", "unavailable"]);
  });
});
