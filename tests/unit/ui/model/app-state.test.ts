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

  it("reset returns to the initial state", async () => {
    const file = await raiseFixture("fixtures/ksbase/KSBASE.WK1");
    const s = run([summon(["KSBASE.WK1"]), { type: "raised", batchId: 1, id: 0, file }, { type: "openCell", address: "O3" }, { type: "reset" }]);
    expect(s).toEqual(initialState);
  });
});
