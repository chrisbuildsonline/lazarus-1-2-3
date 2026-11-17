// The main-thread client of the raise worker (requirements 22, 24), driven by a fake worker.
import { describe, expect, expectTypeOf, it } from "vitest";
import { createRaiseClient, type WorkerLike } from "../../../src/ui/io/worker-client.ts";
import type { RaisedFile, RaiseRequest, RaiseResponse } from "../../../src/workers/verify-protocol.ts";

type Fake = WorkerLike & { posted: { message: RaiseRequest; transfer: Transferable[] }[]; terminated: number; answer(m: RaiseResponse): void };

function fakeWorker(): Fake {
  const w: Fake = {
    posted: [],
    terminated: 0,
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage(message, transfer) {
      w.posted.push({ message, transfer });
    },
    terminate() {
      w.terminated++;
    },
    answer(m) {
      w.onmessage?.({ data: m } as MessageEvent);
    },
  };
  return w;
}

const file = (name: string) => ({ name, bytes: new ArrayBuffer(4) });
const raisedFile = { name: "x" } as RaisedFile;
const tick = () => new Promise((r) => setTimeout(r, 0));

function setup() {
  const workers: Fake[] = [];
  const client = createRaiseClient(() => {
    const w = fakeWorker();
    workers.push(w);
    return w;
  });
  return { client, workers, worker: () => workers[0]! };
}

describe("createRaiseClient", () => {
  it("a real Worker fits WorkerLike (checked by tsc)", () => {
    expectTypeOf<Worker>().toExtend<WorkerLike>();
  });

  it("creates the worker on first use, runs requests one at a time in order with increasing ids", async () => {
    const { client, workers, worker } = setup();
    expect(workers).toHaveLength(0);
    const seen: RaiseResponse[][] = [[], []];
    const a = client.raise(file("a.wk1"), (m) => seen[0]!.push(m));
    const b = client.raise(file("b.wk1"), (m) => seen[1]!.push(m));
    expect(workers).toHaveLength(1);
    expect(worker().posted.map((p) => p.message.name)).toEqual(["a.wk1"]);
    const first = worker().posted[0]!.message;
    worker().answer({ type: "raised", id: first.id, file: raisedFile });
    await a;
    expect(worker().posted.map((p) => p.message.name)).toEqual(["a.wk1", "b.wk1"]);
    const second = worker().posted[1]!.message;
    expect(second.id).toBeGreaterThan(first.id);
    worker().answer({ type: "raised", id: second.id, file: raisedFile });
    await b;
    expect(seen[0]).toEqual([{ type: "raised", id: first.id, file: raisedFile }]);
    expect(seen[1]).toEqual([{ type: "raised", id: second.id, file: raisedFile }]);
    expect(workers).toHaveLength(1);
  });

  it("transfers the buffer and sends a raise request", () => {
    const { client, worker } = setup();
    const f = file("a.wk1");
    void client.raise(f, () => {});
    const { message, transfer } = worker().posted[0]!;
    expect(message).toEqual({ type: "raise", id: message.id, name: "a.wk1", bytes: f.bytes });
    expect(transfer).toEqual([f.bytes]);
    expect(transfer[0]).toBe(f.bytes);
  });

  it("forwards progress to the request's callback and ignores messages for other ids", async () => {
    const { client, worker } = setup();
    const seen: RaiseResponse[] = [];
    const done = client.raise(file("a.wk1"), (m) => seen.push(m));
    const id = worker().posted[0]!.message.id;
    worker().answer({ type: "progress", id: id + 100, step: "read" });
    worker().answer({ type: "progress", id, step: "read" });
    worker().answer({ type: "progress", id, step: "check" });
    worker().answer({ type: "error", id, message: "bad" });
    await done;
    expect(seen).toEqual([
      { type: "progress", id, step: "read" },
      { type: "progress", id, step: "check" },
      { type: "error", id, message: "bad" },
    ]);
  });

  for (const handler of ["onerror", "onmessageerror"] as const) {
    it(`${handler} answers the request in flight and every queued one with an error`, async () => {
      const { client, workers, worker } = setup();
      const seen: RaiseResponse[][] = [[], [], []];
      const all = ["a", "b", "c"].map((n, i) => client.raise(file(`${n}.wk1`), (m) => seen[i]!.push(m)));
      worker()[handler]!({ message: "script failed" } as ErrorEvent & MessageEvent);
      await Promise.all(all);
      for (const s of seen) {
        expect(s).toHaveLength(1);
        expect(s[0]!.type).toBe("error");
      }
      expect(worker().posted).toHaveLength(1);
      expect(worker().terminated).toBe(1);
      // The next request gets a new worker.
      void client.raise(file("d.wk1"), () => {});
      expect(workers).toHaveLength(2);
    });
  }

  it("names the engine when it could not start, and when it stopped after answering", async () => {
    const { client, worker } = setup();
    const seen: RaiseResponse[] = [];
    const a = client.raise(file("a.wk1"), (m) => seen.push(m));
    worker().onerror!({ message: "" } as ErrorEvent);
    await a;
    expect(seen[0]).toMatchObject({ type: "error", message: "The checking engine could not start." });

    const later = setup();
    const b = later.client.raise(file("b.wk1"), () => {});
    later.worker().answer({ type: "raised", id: later.worker().posted[0]!.message.id, file: raisedFile });
    await b;
    const after: RaiseResponse[] = [];
    const c = later.client.raise(file("c.wk1"), (m) => after.push(m));
    later.worker().onerror!({ message: "out of memory" } as ErrorEvent);
    await c;
    expect(after).toEqual([{ type: "error", id: later.worker().posted[1]!.message.id, message: "The checking engine stopped. (out of memory)" }]);
  });

  it("a makeWorker that throws gives an error and no unhandled rejection", async () => {
    const client = createRaiseClient(() => {
      throw new Error("Worker is not supported");
    });
    const seen: RaiseResponse[] = [];
    await expect(client.raise(file("a.wk1"), (m) => seen.push(m))).resolves.toBeUndefined();
    expect(seen).toEqual([{ type: "error", id: null, message: "The checking engine could not start. (Worker is not supported)" }]);
  });

  it("dispose terminates the worker, drops the queue and ignores late messages", async () => {
    const { client, worker } = setup();
    const seen: RaiseResponse[] = [];
    const a = client.raise(file("a.wk1"), (m) => seen.push(m));
    const b = client.raise(file("b.wk1"), (m) => seen.push(m));
    const id = worker().posted[0]!.message.id;
    client.dispose();
    expect(worker().terminated).toBe(1);
    worker().answer({ type: "raised", id, file: raisedFile });
    await Promise.all([a, b]);
    await tick();
    expect(seen).toEqual([]);
    expect(worker().posted).toHaveLength(1);
    await client.raise(file("c.wk1"), (m) => seen.push(m));
    expect(seen).toEqual([]);
  });
});
