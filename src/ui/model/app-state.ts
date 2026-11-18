// The app's state between the Summon and Sheet views (requirements 1, 15, 22, 24, 60, 61). Pure and
// without timers; actions of an older batch are ignored by their batchId.
import type { RaisedFile } from "../../workers/verify-protocol.ts";
import { COPY } from "../copy.ts";
import type { FileItem, Phase } from "./batch-rows.ts";
import { classifyRaised } from "./classify-file.ts";
import { skippedCounts, type SkipReason, type Skipped } from "./entries.ts";
import type { Filter } from "./status-groups.ts";

export type Toast = { id: number; kind: "info" | "error"; text: string };
export type Panel = { kind: "unsupported" | "skipped" | "failed" | "worker"; lines: string[] };

const REASONS: readonly SkipReason[] = ["extension", "too-large", "unreadable", "over-limit"];

/** "3 files skipped: not WK1 or WKS.", one line per reason present, in a fixed order. */
export function skippedLines(skipped: readonly Skipped[]): string[] {
  const counts = skippedCounts(skipped);
  return REASONS.filter((r) => counts[r] > 0).map((r) => COPY.skippedLine(counts[r], COPY.skipWhy[r]));
}

/** Nothing to raise: wrong extensions alone get the extensions panel; any other reason is named. */
function skippedPanel(skipped: readonly Skipped[]): Panel {
  return skipped.every((s) => s.why === "extension") ? { kind: "unsupported", lines: [] } : { kind: "skipped", lines: skippedLines(skipped) };
}

export type AppState = {
  view: "summon" | "sheet";
  batchId: number;
  items: FileItem[];
  skipped: Skipped[];
  selectedId: number | null;
  /** The shown sheet of the selected file; 0 when a file opens. */
  sheetIndex: number;
  /** The person chose a file; stops the first raised file from opening on its own. */
  userPicked: boolean;
  filter: Filter;
  /** The drawer's cell; row and column come from the model. */
  cell: { address: string } | null;
  panel: Panel | null;
  toasts: Toast[];
};

export type AppAction =
  | { type: "summoned"; batchId: number; entries: { name: string; path: string; size: number }[]; skipped: Skipped[] }
  /** start: sent to the worker; read and check: the worker's two progress messages. */
  | { type: "progress"; batchId: number; id: number; step: "start" | "read" | "check" }
  | { type: "raised"; batchId: number; id: number; file: RaisedFile }
  /** The worker answered this one request with an error. */
  | { type: "fileFailed"; batchId: number; id: number; message: string }
  | { type: "workerFailed"; batchId: number; message: string }
  | { type: "selectFile"; id: number }
  | { type: "selectSheet"; index: number }
  | { type: "setFilter"; filter: Filter }
  | { type: "openCell"; address: string }
  | { type: "closeCell" }
  | { type: "toast"; kind: Toast["kind"]; text: string }
  | { type: "dismissToast"; id: number }
  | { type: "reset" };

export const initialState: AppState = {
  view: "summon",
  batchId: 0,
  items: [],
  skipped: [],
  selectedId: null,
  sheetIndex: 0,
  userPicked: false,
  filter: "all",
  cell: null,
  panel: null,
  toasts: [],
};

const UNFINISHED: readonly Phase[] = ["queued", "reading", "checking"];

const update = (s: AppState, id: number, change: (item: FileItem) => FileItem): FileItem[] => s.items.map((i) => (i.id === id ? change(i) : i));

/** A failed or unsupported item: the panel shows while nothing of the batch is raised. */
function fail(s: AppState, id: number, phase: "failed" | "unsupported", failure: FileItem["failure"], panel: Panel, file?: RaisedFile): AppState {
  const items = update(s, id, (i) => ({ ...i, phase, failure, ...(file ? { raised: file } : {}) }));
  return { ...s, items, panel: s.view === "sheet" ? s.panel : panel };
}

function raised(s: AppState, id: number, file: RaisedFile): AppState {
  const verdict = classifyRaised(file);
  if (verdict.kind === "unsupported") return fail(s, id, "unsupported", { reason: COPY.unsupportedTitle, lines: [] }, { kind: "unsupported", lines: [] }, file);
  if (verdict.kind === "failed") {
    const reason = file.diagnostics.find((d) => d.severity === "error")!.message;
    return fail(s, id, "failed", { reason, lines: verdict.lines }, { kind: "failed", lines: verdict.lines }, file);
  }
  const items = update(s, id, (i) => ({ ...i, phase: "raised", raised: file }));
  const first = s.selectedId === null && !s.userPicked;
  return { ...s, items, view: "sheet", selectedId: first ? id : s.selectedId, sheetIndex: first ? 0 : s.sheetIndex, panel: null };
}

function cellStatus(s: AppState, address: string) {
  const item = s.items.find((i) => i.id === s.selectedId);
  return item?.raised?.sheets[s.sheetIndex]?.verification.cells.find((c) => c.address === address)?.status;
}

function selectSheet(s: AppState, index: number): AppState {
  const count = s.items.find((i) => i.id === s.selectedId)?.raised?.sheets.length ?? 1;
  return { ...s, sheetIndex: Math.min(Math.max(0, Math.trunc(index)), Math.max(0, count - 1)), cell: null };
}

export function appReducer(s: AppState, a: AppAction): AppState {
  if ("batchId" in a && a.type !== "summoned" && a.batchId !== s.batchId) return s;
  switch (a.type) {
    case "summoned": {
      const items = a.entries.map((e, id): FileItem => ({ id, ...e, phase: "queued" }));
      const panel: Panel | null = items.length === 0 && a.skipped.length > 0 ? skippedPanel(a.skipped) : null;
      return { ...initialState, batchId: a.batchId, items, skipped: a.skipped, panel, toasts: s.toasts };
    }
    case "progress": {
      const phase: Phase = a.step === "start" ? "reading" : "checking";
      return { ...s, items: update(s, a.id, (i) => (UNFINISHED.includes(i.phase) ? { ...i, phase } : i)) };
    }
    case "raised":
      return raised(s, a.id, a.file);
    case "fileFailed":
      return fail(s, a.id, "failed", { reason: a.message, lines: [a.message] }, { kind: "failed", lines: [a.message] });
    case "workerFailed": {
      const failure = { reason: a.message, lines: [a.message] };
      const items = s.items.map((i): FileItem => (UNFINISHED.includes(i.phase) ? { ...i, phase: "failed", failure } : i));
      return { ...s, items, panel: { kind: "worker", lines: [a.message] } };
    }
    case "selectFile":
      return { ...s, selectedId: a.id, sheetIndex: 0, userPicked: true, cell: null };
    case "selectSheet":
      return selectSheet(s, a.index);
    case "setFilter": {
      const hidden = s.cell !== null && a.filter !== "all" && cellStatus(s, s.cell.address) !== a.filter;
      return { ...s, filter: a.filter, cell: hidden ? null : s.cell };
    }
    case "openCell":
      return { ...s, cell: { address: a.address } };
    case "closeCell":
      return { ...s, cell: null };
    case "toast": {
      const id = s.toasts.reduce((max, t) => Math.max(max, t.id), 0) + 1;
      return { ...s, toasts: [...s.toasts, { id, kind: a.kind, text: a.text }] };
    }
    case "dismissToast":
      return { ...s, toasts: s.toasts.filter((t) => t.id !== a.id) };
    case "reset":
      return initialState;
  }
}
