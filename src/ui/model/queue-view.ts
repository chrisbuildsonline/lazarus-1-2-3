// The Macros view model (design.md "Macros view", requirement 76). Pure: no React, no DOM; the time
// zone is passed in so the tests pin it.
import type { MacroQueue, QueueItem, QueueStatus } from "../../macro/index.ts";
import type { Status } from "../../verify/index.ts";
import { COPY } from "../copy.ts";

export type QueuePillState = "waiting" | "approved" | "rejected";
export type QueueRow = { id: string; kind: string; time: string | null; line: string; pill: QueuePillState; selected: boolean; tabIndex: 0 | -1 };
export type Counts = { pending: number; approved: number; rejected: number };
export type QueueKey = { action: "move"; to: "prev" | "next" | "first" | "last" } | { action: "open" } | { action: "approve" } | { action: "reject" } | { action: "undo" } | null;
export type ExplainState = "idle" | "loading" | "unavailable" | "done";
export type DetailModel = {
  title: string;
  pill: QueuePillState;
  meta: string;
  steps: { raw: string; label: string }[];
  opcode: { bytes: string; suggestion: string | null; confidence: string | null; rationale: string | null; note: string; cells: { address: string; status: Status }[] } | null;
  explanation: { state: ExplainState; text: string | null; model: string | null };
  approveDisabled: boolean;
  rejectDisabled: boolean;
};

const PILL: Record<QueueStatus, QueuePillState> = { pending: "waiting", approved: "approved", rejected: "rejected" };
const TEXT_START = 60;

export const pillState = (s: QueueStatus): QueuePillState => PILL[s];

function hhmm(iso: string | null, timeZone: string | undefined): string | null {
  if (iso === null) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone }).format(d);
}

const rowLine = (i: QueueItem) => (i.kind === "macro" ? `${i.title}  ${i.input.slice(0, TEXT_START)}` : `${i.title}  ${i.cells[0] ?? ""}`);

export function queueRows(q: MacroQueue, selectedId: string | null, timeZone?: string): QueueRow[] {
  const shown = q.items.some((i) => i.id === selectedId) ? selectedId : (q.items[0]?.id ?? null);
  return q.items.map((i) => ({
    id: i.id,
    kind: i.kind === "macro" ? COPY.macroKind : COPY.opcodeKind,
    time: hhmm(i.queuedAt, timeZone),
    line: rowLine(i),
    pill: PILL[i.status],
    selected: i.id === selectedId,
    tabIndex: i.id === shown ? 0 : -1,
  }));
}

export const statusLine = (c: Counts): string => COPY.statusLine(c.pending, c.approved, c.rejected);
export const tabLabel = (waiting: number): string => COPY.tabMacros(waiting);

/** The next pending item after `afterId` in queue order, wrapping; null when none waits. */
export function nextWaiting(q: MacroQueue, afterId: string): string | null {
  const at = q.items.findIndex((i) => i.id === afterId);
  if (at < 0) return null;
  for (let k = 1; k <= q.items.length; k++) {
    const i = q.items[(at + k) % q.items.length]!;
    if (i.status === "pending") return i.id;
  }
  return null;
}

const MOVES: Record<string, QueueKey> = {
  ArrowUp: { action: "move", to: "prev" },
  ArrowDown: { action: "move", to: "next" },
  Home: { action: "move", to: "first" },
  End: { action: "move", to: "last" },
  Enter: { action: "open" },
};
const LETTERS: Record<string, QueueKey> = { a: { action: "approve" }, r: { action: "reject" }, z: { action: "undo" } };

/** Single-letter keys stay off while Ctrl, Meta or Alt is held, so browser shortcuts keep working. */
export function keyToAction(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): QueueKey {
  if (e.key in MOVES) return MOVES[e.key]!;
  if (e.key.length !== 1) return null;
  const letter = LETTERS[e.key.toLowerCase()];
  if (!letter || e.ctrlKey || e.metaKey || e.altKey) return null;
  return letter;
}

/** What the detail panel shows. `lines` is the macro's line count when the caller knows it. */
export function detailModel(item: QueueItem, explain: ExplainState, lines: number | null = null): DetailModel {
  const state: ExplainState = item.suggestion !== null ? "done" : explain === "done" ? "idle" : explain;
  const text = state === "done" ? item.suggestion : state === "loading" ? COPY.explanationLoading : state === "unavailable" ? COPY.explanationUnavailable : null;
  const opcode =
    item.kind === "unknown-opcode"
      ? {
          bytes: item.input,
          suggestion: item.suggestion,
          confidence: item.confidence === null ? null : COPY.confidence(item.confidence),
          rationale: item.rationale,
          note: COPY.opcodeApproveNote,
          // Every cell of an opcode item stops at that opcode, so its proof state is Unverifiable (requirement 37).
          cells: item.cells.map((address) => ({ address, status: "unverifiable" as const })),
        }
      : null;
  return {
    title: item.title,
    pill: PILL[item.status],
    meta: item.kind === "macro" ? COPY.macroMeta(COPY.macroKind, lines, item.steps.length, item.cells[0] ?? "") : COPY.opcodeMeta(item.cellCount, item.cells[0] ?? ""),
    steps: item.steps.map((s) => ({ raw: s.raw, label: s.label })),
    opcode,
    explanation: { state, text, model: state === "done" ? item.model : null },
    approveDisabled: item.status === "approved",
    rejectDisabled: item.status === "rejected",
  };
}
