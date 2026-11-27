// The app's state machine between Summon and Sheet (requirements 1, 15, 22, 24, 60, 61).
import { describe, expect, it } from "vitest";
import { appReducer, initialState, type AppAction, type AppState } from "../../../../src/ui/model/app-state.ts";
import { cellResult, handBuilt, raiseBytes, raiseFixture } from "../../helpers/raised.ts";

const entry = (path: string) => ({ name: path.split("/").pop()!, path, size: 100 });
// BOF 0x0406, then a NUMBER record header that claims 13 body bytes with 3 left (classify-file test).
const BROKEN = new Uint8Array([0, 0, 2, 0, 6, 4, 0x0e, 0, 13, 0, 1, 2, 3]);
const NOISE = new Uint8Array(200).map((_, i) => (i * 197 + 13) % 251);

const run = (actions: AppAction[], from: AppState = initialState) => actions.reduce(appReducer, from);
const summon = (paths: string[], batchId = 1, skipped: AppState["skipped"] = []): AppAction => ({ type: "summoned", batchId, entries: paths.map(entry), skipped });

describe("appReducer", () => {
  it("summoned with one entry stays on summon with the item queued", () => {
    const s = run([summon(["KSBASE.WK1"])]);
    expect(s.view).toBe("summon");
    expect(s.batchId).toBe(1);
    expect(s.items).toEqual([{ id: 0, name: "KSBASE.WK1", path: "KSBASE.WK1", size: 100, phase: "queued" }]);
    expect(s.panel).toBeNull();
  });

  it("summoned with only skipped entries shows the unsupported panel", () => {
    const s = run([summon([], 1, [{ path: "notes.txt", why: "extension" }])]);
    expect(s.view).toBe("summon");
    expect(s.panel).toEqual({ kind: "unsupported", lines: [] });
    expect(s.skipped).toEqual([{ path: "notes.txt", why: "extension" }]);
  });

  it("a single file over 32 MiB names the size limit, not the extension", () => {
    const s = run([summon([], 1, [{ path: "BIG.WK1", why: "too-large" }])]);
    expect(s.view).toBe("summon");
    expect(s.panel).toEqual({ kind: "skipped", lines: ["1 file skipped: larger than 32 MiB."] });
  });

  it("only skipped entries of several kinds: one line per reason, as in the batch", () => {
    const s = run([summon([], 1, [{ path: "a.txt", why: "extension" }, { path: "BIG.WK1", why: "too-large" }, { path: "b.txt", why: "extension" }])]);
    expect(s.panel).toEqual({ kind: "skipped", lines: ["2 files skipped: not a Lotus or dBase file.", "1 file skipped: larger than 32 MiB."] });
  });

  it("progress moves one item through reading and checking", () => {
    const start = run([summon(["a.wk1", "b.wk1"])]);
    const reading = appReducer(start, { type: "progress", batchId: 1, id: 0, step: "start" });
    expect(reading.items.map((i) => i.phase)).toEqual(["reading", "queued"]);
    const checking = appReducer(reading, { type: "progress", batchId: 1, id: 0, step: "read" });
    expect(checking.items.map((i) => i.phase)).toEqual(["checking", "queued"]);
    expect(appReducer(checking, { type: "progress", batchId: 1, id: 0, step: "check" }).items[0]!.phase).toBe("checking");
  });

  it("raised of the first item shows the sheet and selects it", async () => {
    const file = await raiseFixture("fixtures/ksbase/KSBASE.WK1");
    const s = run([summon(["KSBASE.WK1"]), { type: "raised", batchId: 1, id: 0, file }]);
    expect(s.view).toBe("sheet");
    expect(s.selectedId).toBe(0);
    expect(s.items[0]).toMatchObject({ phase: "raised", raised: file });
  });

  it("a later raised item does not take the selection, and a person's choice wins", async () => {
    const file = await raiseFixture("fixtures/ksbase/KSBASE.WK1");
    const auto = run([summon(["a.wk1", "b.wk1"]), { type: "raised", batchId: 1, id: 0, file }, { type: "raised", batchId: 1, id: 1, file }]);
    expect(auto.selectedId).toBe(0);
    const picked = run([summon(["a.wk1", "b.wk1"]), { type: "selectFile", id: 1 }, { type: "raised", batchId: 1, id: 0, file }]);
    expect(picked.selectedId).toBe(1);
    expect(picked.userPicked).toBe(true);
    expect(picked.view).toBe("sheet");
  });

  it("selectFile sets userPicked and closes the drawer", async () => {
    const file = await raiseFixture("fixtures/ksbase/KSBASE.WK1");
    const s = run([summon(["a.wk1", "b.wk1"]), { type: "raised", batchId: 1, id: 0, file }, { type: "openCell", address: "O3" }, { type: "selectFile", id: 1 }]);
    expect(s).toMatchObject({ selectedId: 1, userPicked: true, cell: null });
  });

  it("a late action with an old batchId changes nothing", async () => {
    const file = await raiseFixture("fixtures/ksbase/KSBASE.WK1");
    const s = run([summon(["old.wk1"], 1), summon(["new.wk1"], 2)]);
    for (const late of [
      { type: "raised", batchId: 1, id: 0, file },
      { type: "progress", batchId: 1, id: 0, step: "read" },
      { type: "fileFailed", batchId: 1, id: 0, message: "x" },
      { type: "workerFailed", batchId: 1, message: "x" },
    ] as AppAction[])
      expect(appReducer(s, late)).toBe(s);
  });

  it("an unsupported file as the only result keeps summon with a panel", async () => {
    const file = await raiseBytes(NOISE, "noise.wk1");
    const s = run([summon(["noise.wk1"]), { type: "raised", batchId: 1, id: 0, file }]);
    expect(s.view).toBe("summon");
    expect(s.panel).toEqual({ kind: "unsupported", lines: [] });
    expect(s.items[0]!.phase).toBe("unsupported");
  });

  it("a failed file as the only result keeps summon with the diagnostics", async () => {
    const file = await raiseBytes(BROKEN, "broken.wk1");
    const s = run([summon(["broken.wk1"]), { type: "raised", batchId: 1, id: 0, file }]);
    expect(s.view).toBe("summon");
    expect(s.panel).toEqual({ kind: "failed", lines: ["offset 0x0006  record 0x000e at 6 says 13 body bytes but 3 remain"] });
    expect(s.items[0]).toMatchObject({ phase: "failed", failure: { reason: "record 0x000e at 6 says 13 body bytes but 3 remain" } });
    expect(s.selectedId).toBeNull();
  });

  it("a batch with one failed and one raised item shows the sheet and keeps the failed row", async () => {
    const broken = await raiseBytes(BROKEN, "a.wk1");
    const good = await raiseFixture("fixtures/ksbase/KSBASE.WK1");
    const s = run([summon(["a.wk1", "b.wk1"]), { type: "raised", batchId: 1, id: 0, file: broken }, { type: "raised", batchId: 1, id: 1, file: good }]);
    expect(s.view).toBe("sheet");
    expect(s.selectedId).toBe(1);
    expect(s.panel).toBeNull();
    expect(s.items.map((i) => i.phase)).toEqual(["failed", "raised"]);
  });

  it("an error answer for one file fails that file only", () => {
    const s = run([summon(["a.wk1", "b.wk1"]), { type: "fileFailed", batchId: 1, id: 0, message: "Raising failed unexpectedly: boom" }]);
    expect(s.items.map((i) => i.phase)).toEqual(["failed", "queued"]);
    expect(s.items[0]!.failure).toEqual({ reason: "Raising failed unexpectedly: boom", lines: ["Raising failed unexpectedly: boom"] });
  });

  it("openCell and closeCell", () => {
    const opened = appReducer(initialState, { type: "openCell", address: "B3" });
    expect(opened.cell).toEqual({ address: "B3" });
    expect(appReducer(opened, { type: "closeCell" }).cell).toBeNull();
  });

  it("setFilter closes the drawer when its cell is filtered out", () => {
    const file = handBuilt([], [cellResult(0, 0, "A1", "matched", 1), cellResult(1, 0, "B1", "mismatched", 6)]);
    const base = run([summon(["hand.wk1"]), { type: "raised", batchId: 1, id: 0, file }, { type: "openCell", address: "B1" }]);
    expect(appReducer(base, { type: "setFilter", filter: "mismatched" })).toMatchObject({ filter: "mismatched", cell: { address: "B1" } });
    expect(appReducer(base, { type: "setFilter", filter: "all" }).cell).toEqual({ address: "B1" });
    expect(appReducer(base, { type: "setFilter", filter: "matched" })).toMatchObject({ filter: "matched", cell: null });
  });

  it("workerFailed sets the worker panel and fails every unfinished item", async () => {
    const file = await raiseFixture("fixtures/ksbase/KSBASE.WK1");
    const s = run([
      summon(["a.wk1", "b.wk1", "c.wk1"]),
      { type: "raised", batchId: 1, id: 0, file },
      { type: "progress", batchId: 1, id: 1, step: "start" },
      { type: "workerFailed", batchId: 1, message: "The checking engine could not start." },
    ]);
    expect(s.panel).toEqual({ kind: "worker", lines: ["The checking engine could not start."] });
    expect(s.items.map((i) => i.phase)).toEqual(["raised", "failed", "failed"]);
    expect(s.items[2]!.failure).toEqual({ reason: "The checking engine could not start.", lines: ["The checking engine could not start."] });
  });

  it("toasts are added with increasing ids and dismissed by id", () => {
    const s = run([
      { type: "toast", kind: "info", text: "Download started: KSBASE.xlsx" },
      { type: "toast", kind: "error", text: "The workbook could not be built." },
    ]);
    expect(s.toasts).toEqual([
      { id: 1, kind: "info", text: "Download started: KSBASE.xlsx" },
      { id: 2, kind: "error", text: "The workbook could not be built." },
    ]);
    expect(appReducer(s, { type: "dismissToast", id: 1 }).toasts.map((t) => t.id)).toEqual([2]);
  });

  it("starts on the Sheet step with no queues", () => {
    expect(initialState.step).toBe("sheet");
    expect(initialState.queues).toEqual({});
    expect(initialState.lastFocus).toBeNull();
  });

  it("raised builds the file's queue with the given time, or null without one", async () => {
    const file = await raiseFixture("fixtures/macros/macros.wk1");
    const at = "2026-11-18T14:03:00.000Z";
    const s = run([summon(["macros.wk1", "b.wk1"]), { type: "raised", batchId: 1, id: 0, file, at }, { type: "raised", batchId: 1, id: 1, file }]);
    expect(s.queues[0]!.items).toHaveLength(4);
    expect(s.queues[0]!.items.every((i) => i.status === "pending" && i.queuedAt === at)).toBe(true);
    expect(s.queues[1]!.items.every((i) => i.queuedAt === null)).toBe(true);
  });

  it("a failed file gets no queue", async () => {
    const broken = await raiseBytes(BROKEN, "a.wk1");
    expect(run([summon(["a.wk1"]), { type: "raised", batchId: 1, id: 0, file: broken }]).queues).toEqual({});
  });

  it("decide and undo act on the selected file's queue and set the focus target", async () => {
    const file = await raiseFixture("fixtures/macros/macros.wk1");
    const base = run([summon(["macros.wk1"]), { type: "raised", batchId: 1, id: 0, file }, { type: "setStep", step: "macros" }]);
    expect(base.step).toBe("macros");
    const ids = base.queues[0]!.items.map((i) => i.id);
    const a = appReducer(base, { type: "decide", id: ids[0]!, decision: "approve", at: "T1" });
    expect(a.queues[0]!.items[0]).toMatchObject({ status: "approved", decidedAt: "T1" });
    expect(a.lastFocus).toBe(ids[1]);
    const r = appReducer(a, { type: "decide", id: ids[1]!, decision: "reject", at: "T2" });
    expect(r.queues[0]!.items[1]).toMatchObject({ status: "rejected", decidedAt: "T2" });
    expect(r.lastFocus).toBe(ids[2]);
    const u = appReducer(r, { type: "undo" });
    expect(u.queues[0]!.items[1]).toMatchObject({ status: "pending", decidedAt: null });
    expect(u.lastFocus).toBe(ids[1]);
    expect(appReducer(u, { type: "focusDone" }).lastFocus).toBeNull();
    // Undo with no history changes nothing.
    expect(appReducer(base, { type: "undo" })).toBe(base);
    // Decide on an unknown id changes nothing.
    expect(appReducer(base, { type: "decide", id: "nope", decision: "approve", at: "T" })).toBe(base);
  });

  it("a decision with no other item waiting keeps focus on the decided item", async () => {
    const file = await raiseFixture("fixtures/macros/macros.wk1");
    let s = run([summon(["macros.wk1"]), { type: "raised", batchId: 1, id: 0, file }]);
    const ids = s.queues[0]!.items.map((i) => i.id);
    for (const id of ids.slice(1)) s = appReducer(s, { type: "decide", id, decision: "approve", at: "T" });
    s = appReducer(s, { type: "decide", id: ids[0]!, decision: "reject", at: "T" });
    expect(s.lastFocus).toBe(ids[0]);
  });

  it("explained sets the asking file's explanation; a stale file or batch changes nothing", async () => {
    const file = await raiseFixture("fixtures/macros/macros.wk1");
    const base = run([summon(["macros.wk1"]), { type: "raised", batchId: 1, id: 0, file }]);
    const itemId = base.queues[0]!.items[0]!.id;
    const explanation = { suggestion: "Goes to A1.", rationale: null, confidence: null, model: "recorded fixture" };
    const s = appReducer(base, { type: "explained", batchId: 1, fileId: 0, itemId, explanation });
    expect(s.queues[0]!.items[0]).toMatchObject({ suggestion: "Goes to A1.", model: "recorded fixture", status: "pending" });
    expect(appReducer(base, { type: "explained", batchId: 1, fileId: 7, itemId, explanation })).toBe(base);
    expect(appReducer(base, { type: "explained", batchId: 0, fileId: 0, itemId, explanation })).toBe(base);
  });

  it("selectFile returns to the Sheet step; summoned resets the queues", async () => {
    const file = await raiseFixture("fixtures/macros/macros.wk1");
    const s = run([summon(["macros.wk1", "b.wk1"]), { type: "raised", batchId: 1, id: 0, file }, { type: "setStep", step: "macros" }]);
    expect(appReducer(s, { type: "selectFile", id: 1 }).step).toBe("sheet");
    const again = appReducer(s, summon(["c.wk1"], 2));
    expect(again.queues).toEqual({});
    expect(again.step).toBe("sheet");
    expect(again.lastFocus).toBeNull();
  });

  it("reset returns to the initial state", async () => {
    const file = await raiseFixture("fixtures/ksbase/KSBASE.WK1");
    const s = run([summon(["KSBASE.WK1"]), { type: "raised", batchId: 1, id: 0, file }, { type: "openCell", address: "O3" }, { type: "reset" }]);
    expect(s).toEqual(initialState);
  });

  it("a summon can open on a filter and a cell: the mismatch sample lands on V44, filtered to Mismatched", async () => {
    const file = await raiseFixture("fixtures/noaa-ala-wai-m21/m21tab.wk3");
    const open: AppAction = { type: "summoned", batchId: 1, entries: [entry("m21tab.wk3")], skipped: [], open: { filter: "mismatched", cell: "V44" } };
    const s = run([open, { type: "raised", batchId: 1, id: 0, file }]);
    expect(s.view).toBe("sheet");
    expect(s.filter).toBe("mismatched");
    expect(s.cell).toEqual({ address: "V44" });
    // A later plain summon starts from All with no cell.
    const t = run([summon(["KSBASE.WK1"], 2)], s);
    expect(t.filter).toBe("all");
    expect(t.cell).toBeNull();
  });
});
