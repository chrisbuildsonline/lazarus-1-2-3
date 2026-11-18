// The approval queue (ai-boundaries.md). Pure: every function returns a new queue and never changes
// its input; times come from the caller. A model suggestion takes effect only as text in the report.
import type { CellResult } from "../verify/index.ts";
import type { DetectedMacro } from "./detect.ts";
import type { Confidence, ExplainRequest, Explanation } from "./explain.ts";
import { joinLines, parseSteps } from "./steps.ts";

export type QueueStatus = "pending" | "approved" | "rejected";
export type QueueItem = {
  id: string;
  kind: "macro" | "unknown-opcode";
  title: string;
  sheet: string;
  input: string;
  steps: { label: string; raw: string }[];
  cells: string[];
  cellCount: number;
  suggestion: string | null;
  rationale: string | null;
  confidence: Confidence | null;
  model: string | null;
  status: QueueStatus;
  decidedAt: string | null;
  queuedAt: string | null;
};
/** The state of an item before a decision, so an undo puts it back as it was. */
export type Decision = { id: string; status: QueueStatus; decidedAt: string | null };
export type MacroQueue = { items: readonly QueueItem[]; history: readonly Decision[] };

/** The report's macro item; the same shape as ReportMacroItem in src/report/types.ts. */
export type ReportMacroItemLike = Pick<QueueItem, "kind" | "title" | "sheet" | "steps" | "rationale" | "confidence" | "model" | "status" | "decidedAt" | "cells"> & { explanation: string | null };

/** Same expression as unknownOpcodes in src/report/features.ts; a test pins the two together. */
const OPCODE = /opcode (0x[0-9A-F]{2}) at offset \d+/;
const MAX_CELLS = 50;

const blank = { suggestion: null, rationale: null, confidence: null, model: null, status: "pending" as const, decidedAt: null };

export function buildQueue(input: { macros: readonly DetectedMacro[]; sheets: readonly { name: string; cells: readonly CellResult[] }[] }, at: string | null): MacroQueue {
  const macros: QueueItem[] = input.macros.map((m) => {
    const { text, lineStarts } = joinLines(m.lines);
    const steps = parseSteps(text, lineStarts).steps.map((s) => ({ label: s.label, raw: s.raw }));
    return { id: m.id, kind: "macro", title: m.name ?? `Macro at ${m.start}`, sheet: m.sheet, input: text, steps, cells: [m.start], cellCount: 1, ...blank, queuedAt: at };
  });
  const groups = new Map<string, QueueItem>();
  for (const sheet of input.sheets) {
    for (const c of sheet.cells) {
      if (c.reason.code !== "unknown-opcode") continue;
      const opcode = OPCODE.exec(c.reason.message)?.[1] ?? null;
      const key = opcode ?? "unknown";
      let g = groups.get(key);
      if (!g) {
        g = { id: `opcode:${key}`, kind: "unknown-opcode", title: opcode ?? "Unknown code", sheet: sheet.name, input: key, steps: [], cells: [], cellCount: 0, ...blank, queuedAt: at };
        groups.set(key, g);
      }
      g.cellCount++;
      if (g.cells.length < MAX_CELLS) g.cells.push(input.sheets.length > 1 ? `${sheet.name}!${c.address}` : c.address);
    }
  }
  const rank = (i: QueueItem) => (i.input === "unknown" ? "￿" : i.input);
  const opcodes = [...groups.values()].sort((a, b) => (rank(a) < rank(b) ? -1 : rank(a) > rank(b) ? 1 : 0));
  return { items: [...macros, ...opcodes], history: [] };
}

function decide(q: MacroQueue, id: string, status: QueueStatus, at: string): MacroQueue {
  const item = q.items.find((i) => i.id === id);
  if (!item || item.status === status) return q;
  return {
    items: q.items.map((i) => (i.id === id ? { ...i, status, decidedAt: at } : i)),
    history: [...q.history, { id, status: item.status, decidedAt: item.decidedAt }],
  };
}

export const approve = (q: MacroQueue, id: string, at: string): MacroQueue => decide(q, id, "approved", at);
export const reject = (q: MacroQueue, id: string, at: string): MacroQueue => decide(q, id, "rejected", at);

export function undo(q: MacroQueue): { queue: MacroQueue; restored: string | null } {
  const last = q.history.at(-1);
  if (!last) return { queue: q, restored: null };
  const items = q.items.map((i) => (i.id === last.id ? { ...i, status: last.status, decidedAt: last.decidedAt } : i));
  return { queue: { items, history: q.history.slice(0, -1) }, restored: last.id };
}

export function setExplanation(q: MacroQueue, id: string, e: Explanation): MacroQueue {
  if (!q.items.some((i) => i.id === id)) return q;
  const items = q.items.map((i) => (i.id === id ? { ...i, suggestion: e.suggestion, rationale: e.rationale, confidence: i.kind === "unknown-opcode" ? e.confidence : null, model: e.model } : i));
  return { items, history: q.history };
}

/** What the explainer is asked about an item: the macro text and step labels, or the opcode. No cell. */
export function explainRequest(item: QueueItem): ExplainRequest {
  return item.kind === "macro" ? { kind: "macro", text: item.input, stepLabels: item.steps.map((s) => s.label) } : { kind: "unknown-opcode", opcode: item.input };
}

export function counts(q: MacroQueue): { pending: number; approved: number; rejected: number } {
  const c = { pending: 0, approved: 0, rejected: 0 };
  for (const i of q.items) c[i.status]++;
  return c;
}

export function toReportItems(q: MacroQueue): ReportMacroItemLike[] {
  return q.items.map((i) => ({
    kind: i.kind,
    title: i.title,
    sheet: i.sheet,
    steps: i.steps.map((s) => ({ label: s.label, raw: s.raw })),
    explanation: i.suggestion,
    rationale: i.rationale,
    confidence: i.confidence,
    model: i.model,
    status: i.status,
    decidedAt: i.decidedAt,
    cells: [...i.cells],
  }));
}
