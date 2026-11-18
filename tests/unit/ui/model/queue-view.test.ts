// The Macros view model (requirements 60, 64 to 66, 68 to 71, 76): pure functions over the queue.
import { describe, expect, it } from "vitest";
import { approve, buildQueue, reject, type MacroQueue, type QueueItem } from "../../../../src/macro/index.ts";
import { COPY } from "../../../../src/ui/copy.ts";
import { detailModel, keyToAction, nextWaiting, queueRows, statusLine, tabLabel } from "../../../../src/ui/model/queue-view.ts";
import { raiseFixture } from "../../helpers/raised.ts";

const AT = "2026-11-18T14:03:00.000Z";
const fixtureQueue = async (at: string | null = AT): Promise<MacroQueue> => {
  const file = await raiseFixture("fixtures/macros/macros.wk1");
  return buildQueue({ macros: file.macros, sheets: file.sheets.map((s) => ({ name: s.name, cells: s.verification.cells })) }, at);
};

const item = (more: Partial<QueueItem>): QueueItem => ({
  id: "m1",
  kind: "macro",
  title: "\\P",
  sheet: "Sheet1",
  input: "/PPRA1..D8~GQ",
  steps: [{ label: "Print > Printer > Range: A1..D8", raw: "/PPRA1..D8~" }],
  cells: ["H1"],
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
const key = (k: string, mods: Partial<{ ctrlKey: boolean; metaKey: boolean; altKey: boolean }> = {}) => keyToAction({ key: k, ctrlKey: false, metaKey: false, altKey: false, ...mods });

describe("queueRows", () => {
  it("one row per item, kind, time in the given zone, line, pill, roving tabindex", async () => {
    const q = await fixtureQueue();
    const rows = queueRows(q, q.items[1]!.id, "UTC");
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.kind)).toEqual([COPY.macroKind, COPY.macroKind, COPY.macroKind, COPY.opcodeKind]);
    expect(rows.every((r) => r.time === "14:03")).toBe(true);
    // Title, two spaces, the first 60 characters of the text (design.md "Macros view").
    expect(rows[1]!.line).toBe("\\P  /PPRA1..D8~GQ");
    expect(rows[0]!.line).toBe("\\0  {GOTO}A1~{CALC}{QUIT}");
    // Opcode rows: the opcode, two spaces, the first cell (the fixture's unknown opcode is on A10).
    expect(rows[3]!.line).toMatch(/^0x[0-9A-F]{2} {2}A10$/);
    expect(rows.map((r) => r.pill)).toEqual(["waiting", "waiting", "waiting", "waiting"]);
    expect(rows.map((r) => r.selected)).toEqual([false, true, false, false]);
    expect(rows.map((r) => r.tabIndex)).toEqual([-1, 0, -1, -1]);
  });

  it("the time follows the zone, and is null without queuedAt", async () => {
    expect(queueRows(await fixtureQueue(), null, "Asia/Tokyo")[0]!.time).toBe("23:03");
    expect(queueRows(await fixtureQueue(null), null, "UTC")[0]!.time).toBeNull();
  });

  it("without a selection the first row is the tab stop; a long text is cut at 60", async () => {
    const q: MacroQueue = { items: [item({ id: "a", input: "x".repeat(80) }), item({ id: "b" })], history: [] };
    const rows = queueRows(q, null, "UTC");
    expect(rows.map((r) => r.tabIndex)).toEqual([0, -1]);
    expect(rows[0]!.line).toBe(`\\P  ${"x".repeat(60)}`);
  });

  it("pills follow the status", async () => {
    let q = await fixtureQueue();
    q = reject(approve(q, q.items[0]!.id, AT), q.items[1]!.id, AT);
    expect(queueRows(q, null, "UTC").map((r) => r.pill)).toEqual(["approved", "rejected", "waiting", "waiting"]);
  });
});

describe("statusLine and tabLabel", () => {
  it("shows approved and rejected only above zero", () => {
    expect(statusLine({ pending: 0, approved: 0, rejected: 0 })).toBe("0 waiting");
    expect(statusLine({ pending: 3, approved: 1, rejected: 0 })).toBe("3 waiting · 1 approved");
    expect(statusLine({ pending: 2, approved: 0, rejected: 1 })).toBe("2 waiting · 1 rejected");
    expect(statusLine({ pending: 4, approved: 9, rejected: 1 })).toBe("4 waiting · 9 approved · 1 rejected");
  });

  it("the tab carries the waiting count, none at zero", () => {
    expect(tabLabel(4)).toBe("Macros 4");
    expect(tabLabel(0)).toBe("Macros");
  });
});

describe("nextWaiting", () => {
  it("the next waiting item after the given one, wrapping, null when none waits", async () => {
    let q = await fixtureQueue();
    const [a, b, c, d] = q.items.map((i) => i.id);
    expect(nextWaiting(q, a!)).toBe(b);
    q = approve(q, b!, AT);
    expect(nextWaiting(q, a!)).toBe(c);
    expect(nextWaiting(q, d!)).toBe(a);
    for (const id of [a!, c!, d!]) q = approve(q, id, AT);
    expect(nextWaiting(q, a!)).toBeNull();
    expect(nextWaiting(q, "nope")).toBeNull();
  });

  it("the item itself counts only after a full turn", async () => {
    const q = await fixtureQueue();
    const one: MacroQueue = { items: [q.items[0]!], history: [] };
    expect(nextWaiting(one, q.items[0]!.id)).toBe(q.items[0]!.id);
  });
});

describe("keyToAction", () => {
  it("maps the list keys", () => {
    expect(key("ArrowUp")).toEqual({ action: "move", to: "prev" });
    expect(key("ArrowDown")).toEqual({ action: "move", to: "next" });
    expect(key("Home")).toEqual({ action: "move", to: "first" });
    expect(key("End")).toEqual({ action: "move", to: "last" });
    expect(key("Enter")).toEqual({ action: "open" });
    expect(key("a")).toEqual({ action: "approve" });
    expect(key("r")).toEqual({ action: "reject" });
    expect(key("z")).toEqual({ action: "undo" });
  });

  it("Shift is fine, Ctrl, Meta or Alt leave the browser shortcut alone", () => {
    expect(key("A")).toEqual({ action: "approve" });
    expect(key("R")).toEqual({ action: "reject" });
    expect(key("Z")).toEqual({ action: "undo" });
    for (const k of ["a", "r", "z", "A"]) {
      expect(key(k, { ctrlKey: true }), k).toBeNull();
      expect(key(k, { metaKey: true }), k).toBeNull();
      expect(key(k, { altKey: true }), k).toBeNull();
    }
  });

  it("other keys do nothing", () => {
    for (const k of ["b", "Tab", "Escape", " ", "ArrowLeft", "ArrowRight", "1"]) expect(key(k), k).toBeNull();
  });
});

describe("detailModel", () => {
  it("a macro: title, pill, meta line, steps, no opcode part", () => {
    const d = detailModel(item({ steps: [{ label: "Print > Printer > Range: A1..D8", raw: "/PPRA1..D8~" }, { label: "Print > Printer > Go", raw: "G" }] }), "idle", 1);
    expect(d.title).toBe("\\P");
    expect(d.pill).toBe("waiting");
    expect(d.meta).toBe("Macro · 1 line · 2 steps · H1");
    expect(d.steps).toEqual([
      { raw: "/PPRA1..D8~", label: "Print > Printer > Range: A1..D8" },
      { raw: "G", label: "Print > Printer > Go" },
    ]);
    expect(d.opcode).toBeNull();
  });

  it("the four explain states", () => {
    expect(detailModel(item({}), "idle").explanation).toEqual({ state: "idle", text: null, model: null });
    expect(detailModel(item({}), "loading").explanation).toEqual({ state: "loading", text: COPY.explanationLoading, model: null });
    expect(detailModel(item({}), "unavailable").explanation).toEqual({ state: "unavailable", text: COPY.explanationUnavailable, model: null });
    const done = item({ suggestion: "Prints A1..D8.", model: "recorded fixture" });
    expect(detailModel(done, "done").explanation).toEqual({ state: "done", text: "Prints A1..D8.", model: "recorded fixture" });
    // An item that already holds its explanation shows it, whatever the request state says.
    expect(detailModel(done, "loading").explanation).toEqual({ state: "done", text: "Prints A1..D8.", model: "recorded fixture" });
  });

  it("an unknown opcode: bytes, suggestion, confidence as text, rationale, note, cells with their pill", () => {
    const op = item({ id: "opcode:0x61", kind: "unknown-opcode", title: "0x61", input: "0x61", steps: [], cells: ["A10", "B2"], cellCount: 2, suggestion: "@ISNUMBER", rationale: "Because.", confidence: "Medium", model: "qwen3" });
    for (const state of ["idle", "loading", "unavailable", "done"] as const) {
      const d = detailModel(op, state);
      expect(d.meta).toBe("Unknown opcode · 2 cells · A10");
      expect(d.opcode).toEqual({ bytes: "0x61", suggestion: "@ISNUMBER", confidence: "Confidence: Medium", rationale: "Because.", note: COPY.opcodeApproveNote, cells: [{ address: "A10", status: "unverifiable" }, { address: "B2", status: "unverifiable" }] });
    }
    const bare = detailModel(item({ kind: "unknown-opcode", title: "0x61", input: "0x61", steps: [], cells: ["A10"] }), "unavailable");
    expect(bare.opcode).toMatchObject({ suggestion: null, confidence: null, rationale: null });
    expect(bare.explanation.text).toBe(COPY.explanationUnavailable);
  });

  it("Approve and Reject are disabled only on an item already in that state", () => {
    expect(detailModel(item({}), "idle")).toMatchObject({ approveDisabled: false, rejectDisabled: false });
    expect(detailModel(item({ status: "approved" }), "idle")).toMatchObject({ approveDisabled: true, rejectDisabled: false, pill: "approved" });
    expect(detailModel(item({ status: "rejected" }), "idle")).toMatchObject({ approveDisabled: false, rejectDisabled: true, pill: "rejected" });
  });
});
