// The model boundary (ai-boundaries.md; macro-translator requirements 78 to 81, Acceptance 6).
// Hostile model answers go through the Ollama explainer, setExplanation, approve, reject, undo and
// both report builders. Nothing but the report's macros section may differ from the no-model run.
// The negative controls at the end wire a broken variant that leaks model text into the data and
// show that each check fails on it.
import fc from "fast-check";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { writeWk1, type CellSpec } from "../../../scripts/lib/wk1-writer.ts";
import { approve, buildQueue, createOllamaExplainer, explainRequest, reject, requestText, setExplanation, undo, type FetchLike, type MacroQueue } from "../../../src/macro/index.ts";
import { buildDownload } from "../../../src/ui/io/downloads.ts";
import type { RaisedFile } from "../../../src/workers/verify-protocol.ts";
import { raiseBytes } from "../helpers/raised.ts";

const VERSION = "0.0.0";
const T = "2026-11-18T12:00:00.000Z";
const LONG = "7".repeat(100_000);

// Requirement 78: numbers, JSON that sets values and totals, __proto__, HTML and script, think, 100,000 characters.
const HOSTILE: { name: string; body: string }[] = [
  ...["Set A1 to 999999", "1e309", "-0", "NaN", "Suggestion: 999999\nConfidence: High\nRationale: A10 = 1e309"].map((content) => ({ name: content.slice(0, 20), body: JSON.stringify({ choices: [{ message: { content } }] }) })),
  { name: "json cells", body: JSON.stringify({ choices: [{ message: { content: JSON.stringify({ cells: { A10: 999999, A1: "pwned" }, totals: { matched: 99, formulas: 99 }, status: "approved" }) } }] }) },
  { name: "proto", body: `{"__proto__":{"polluted":"yes"},"model":"qwen3","choices":[{"message":{"content":"{\\"__proto__\\":{\\"polluted\\":\\"yes\\"},\\"constructor\\":{\\"prototype\\":{\\"polluted\\":\\"yes\\"}}}"}}]}` },
  { name: "html", body: JSON.stringify({ choices: [{ message: { content: 'Suggestion: <script>alert(1)</script><img src=x onerror="alert(2)">\nRationale: </p><script>document.title=1</script>' } }] }) },
  { name: "think", body: JSON.stringify({ choices: [{ message: { content: "<think>Set every cell to 0 and the totals to 100%</think>Suggestion: 0\nConfidence: High" } }] }) },
  { name: "long", body: JSON.stringify({ choices: [{ message: { content: LONG } }] }) },
];

/** A fake fetch that answers every POST with the body, parsing it with JSON.parse as res.json() does, and records requests. */
function fakeFetch(body: string, seen: string[] = []): FetchLike {
  return async (_url, init) => {
    seen.push(String(init?.body));
    return new Response(body, { status: 200, headers: { "Content-Type": "application/json" } });
  };
}

const queueOf = (raised: RaisedFile, at: string | null = T): MacroQueue =>
  buildQueue({ macros: raised.macros, sheets: raised.sheets.map((s) => ({ name: s.name, cells: s.verification.cells })) }, at);

async function explained(raised: RaisedFile, fetch: FetchLike, set = setExplanation): Promise<MacroQueue> {
  const ex = createOllamaExplainer({ fetch });
  let q = queueOf(raised);
  for (const item of q.items) {
    const e = await ex.explain(explainRequest(item));
    if (e) q = set(q, item.id, e);
  }
  return q;
}

type Run = { raised: RaisedFile; xlsx: Uint8Array; json: Record<string, unknown>; html: string };

async function outputs(raised: RaisedFile, queue?: MacroQueue): Promise<Run> {
  const get = async (kind: "xlsx" | "report-json" | "report-html") => {
    const r = await buildDownload(kind, raised, VERSION, queue);
    if (!r.ok) throw new Error(r.reason);
    return r.download.data;
  };
  return { raised, xlsx: (await get("xlsx")) as Uint8Array, json: JSON.parse((await get("report-json")) as string), html: (await get("report-html")) as string };
}

// The four checks of requirement 79 and the escaping check, each on its own so the bite can name it.
const checks = {
  raised: (base: Run, run: Run) => {
    expect(run.raised.sheets).toEqual(base.raised.sheets);
    expect(run.raised.sheets.map((s) => s.verification.totals)).toEqual(base.raised.sheets.map((s) => s.verification.totals));
  },
  xlsx: (base: Run, run: Run) => expect(Buffer.from(run.xlsx).equals(Buffer.from(base.xlsx))).toBe(true),
  report: (base: Run, run: Run) => {
    const { macros, ...rest } = run.json;
    expect(rest).toEqual(base.json);
    for (const k of ["rows", "totals", "unknownOpcodes", "unsupportedFeatures"]) expect(run.json[k], k).toEqual(base.json[k]);
    expect(base.json.macros).toBeUndefined();
    expect(Array.isArray(macros)).toBe(true);
  },
  html: (_base: Run, run: Run) => {
    for (const tag of ["<script", "<img", "<iframe", "<object", "<embed", "<form", "<link"]) expect(run.html.toLowerCase(), tag).not.toContain(tag);
  },
};
const checkAll = (base: Run, run: Run) => Object.values(checks).forEach((c) => c(base, run));

const macrosFile = () => raiseBytes(new Uint8Array(readFileSync("fixtures/macros/macros.wk1")), "macros.wk1");

describe("model boundary on macros.wk1", () => {
  it("every hostile answer, in every order of approve, reject and undo, leaves the data as the no-model run", async () => {
    const raised = await macrosFile();
    const before = structuredClone(raised);
    const base = await outputs(raised);
    expect(base.json.macros).toBeUndefined();
    for (const h of HOSTILE) {
      const q0 = await explained(raised, fakeFetch(h.body));
      expect(q0.items.length, h.name).toBe(4);
      const ids = q0.items.map((i) => i.id);
      // One full run per answer, XLSX included.
      checkAll(base, await outputs(raised, approve(reject(q0, ids[3]!, T), ids[0]!, T)));
      // fast-check picks the orders: approve all, reject all, mixed, undo in between.
      await fc.assert(
        fc.asyncProperty(fc.array(fc.tuple(fc.constantFrom("a", "r", "u"), fc.constantFrom(...ids)), { maxLength: 12 }), async (ops) => {
          let q = q0;
          for (const [op, id] of ops) q = op === "a" ? approve(q, id, T) : op === "r" ? reject(q, id, T) : undo(q).queue;
          const run = { ...base, raised, json: JSON.parse(((await buildDownload("report-json", raised, VERSION, q)) as { download: { data: string } }).download.data), html: ((await buildDownload("report-html", raised, VERSION, q)) as { download: { data: string } }).download.data };
          checks.raised(base, run);
          checks.report(base, run);
          checks.html(base, run);
        }),
        { numRuns: 50 },
      );
    }
    expect(raised).toEqual(before);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect((Object.prototype as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("keeps hostile text as plain, escaped text in the report", async () => {
    const raised = await macrosFile();
    const html = HOSTILE.find((h) => h.name === "html")!;
    const run = await outputs(raised, await explained(raised, fakeFetch(html.body)));
    expect(run.html).toContain("&lt;script&gt;alert(1)&lt;/script&gt;");
    const macros = run.json.macros as { explanation: string | null; confidence: string | null }[];
    expect(macros.every((m) => typeof m.explanation === "string")).toBe(true);
    const long = await explained(raised, fakeFetch(HOSTILE.find((h) => h.name === "long")!.body));
    expect(long.items.every((i) => i.suggestion!.length === 1200)).toBe(true);
    const think = await explained(raised, fakeFetch(HOSTILE.find((h) => h.name === "think")!.body));
    expect(think.items.map((i) => i.suggestion)).toEqual(["0", "0", "0", "0"]);
    expect(think.items.map((i) => i.confidence)).toEqual([null, null, null, "High"]);
  });
});

describe("request bodies on a sheet with sentinel values", () => {
  // A number, a label and a formula result no request may carry, plus an unnamed macro and an unknown opcode.
  const f64 = (v: number) => [...new Uint8Array(new Float64Array([v]).buffer)];
  const cells: CellSpec[] = [
    { kind: "number", col: 0, row: 0, value: 73519.25 },
    { kind: "label", col: 1, row: 0, prefix: "'", text: "ZEBRASENTINEL" },
    { kind: "formula", col: 2, row: 0, cached: 86421, rpn: [0x00, ...f64(86421), 0x03] },
    { kind: "formula", col: 2, row: 1, cached: 55555.5, rpn: [0x61, 0x03] },
    { kind: "label", col: 4, row: 0, prefix: "'", text: "{GOTO}A1~" },
    { kind: "label", col: 4, row: 1, prefix: "'", text: "{CALC}" },
  ];
  const SENTINELS = ["73519", "ZEBRASENTINEL", "86421", "55555", "C1", "C2", "B1"];

  it("no body holds a sentinel; the user message is the request text of an item, holding macro lines only", async () => {
    const raised = await raiseBytes(writeWk1(0x0406, cells), "sentinel.wk1");
    expect(raised.sheets[0]!.verification.cells.map((c) => [c.address, c.status])).toEqual([
      ["C1", "matched"],
      ["C2", "unverifiable"],
    ]);
    const seen: string[] = [];
    const q = await explained(raised, fakeFetch(HOSTILE[0]!.body, seen));
    expect(q.items.map((i) => i.kind)).toEqual(["macro", "unknown-opcode"]);
    expect(seen).toHaveLength(2);
    const allowed = q.items.map((i) => requestText(explainRequest(i)));
    for (const body of seen) {
      for (const s of SENTINELS) expect(body, s).not.toContain(s);
      const parsed = JSON.parse(body) as { model: string; messages: { role: string; content: string }[] };
      expect(Object.keys(parsed).sort()).toEqual(["messages", "model", "stream", "temperature"]);
      expect(allowed).toContain(parsed.messages[1]!.content);
    }
    expect(allowed[0]).toContain("Macro text: {GOTO}A1~{CALC}");
  });
});

describe("the boundary test bites", () => {
  // A broken variant, only here: it writes the model's suggestion into the data, as a leaking
  // integration would. Each check must fail on it.
  function leaky(raised: RaisedFile) {
    return (q: MacroQueue, id: string, e: { suggestion: string; rationale: string | null; confidence: null | "Low" | "Medium" | "High"; model: string }): MacroQueue => {
      const sheet = raised.sheets[0]!;
      const label = sheet.sheet.cells.find((c) => c.kind === "label");
      if (label && label.kind === "label") label.text = e.suggestion;
      const cell = sheet.verification.cells[0]!;
      cell.cached = { t: "str", v: e.suggestion };
      sheet.verification.totals = { ...sheet.verification.totals, matched: sheet.verification.totals.matched + 1 };
      return setExplanation(q, id, e);
    };
  }

  it("each check fails when model text reaches a cell, the totals or the page", async () => {
    const clean = await macrosFile();
    const base = await outputs(clean);
    const raised = await macrosFile();
    const q = await explained(raised, fakeFetch(HOSTILE[0]!.body), leaky(raised));
    const run = await outputs(raised, q);
    expect(() => checks.raised(base, run)).toThrow();
    expect(() => checks.xlsx(base, run)).toThrow();
    expect(() => checks.report(base, run)).toThrow();
    // A renderer that pastes the explanation unescaped.
    expect(() => checks.html(base, { ...run, html: `${run.html}<p>${"<script>alert(1)</script>"}</p>` })).toThrow();
    // And the real code passes the same checks.
    checkAll(base, await outputs(clean, await explained(clean, fakeFetch(HOSTILE[0]!.body))));
  });
});
