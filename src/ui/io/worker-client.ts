// The main thread's side of the raise worker (requirements 22, 24): one request at a time in order,
// every request answered, and a worker failure turned into an error answer instead of a hang.
import type { RaiseRequest, RaiseResponse } from "../../workers/verify-protocol.ts";
import { COPY } from "../copy.ts";

/** The part of a Worker the client uses, so a Node test can pass a fake. */
export type WorkerLike = {
  postMessage(message: RaiseRequest, transfer: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: MessageEvent) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  onmessageerror: ((event: MessageEvent) => void) | null;
};

export type RaiseClient = {
  /** Resolves when the request is answered (raised or error), or at once after dispose. */
  raise(file: { name: string; bytes: ArrayBuffer }, on: (m: RaiseResponse) => void): Promise<void>;
  dispose(): void;
};

type Job = { id: number; file: { name: string; bytes: ArrayBuffer }; on: (m: RaiseResponse) => void; done: () => void };

const withDetail = (message: string, detail: unknown) => (detail ? `${message} (${String(detail)})` : message);

export function createRaiseClient(makeWorker: () => WorkerLike): RaiseClient {
  let worker: WorkerLike | null = null;
  let current: Job | null = null;
  let queue: Job[] = [];
  let nextId = 0;
  let answered = false;
  let disposed = false;

  const finish = (job: Job, m: RaiseResponse) => {
    job.on(m);
    job.done();
  };

  /** Answers the job in flight and every queued one with an error, and drops the worker. */
  const failAll = (message: string) => {
    worker?.terminate();
    worker = null;
    const jobs = current ? [current, ...queue] : queue;
    current = null;
    queue = [];
    // A job that was never posted has no request id yet.
    for (const job of jobs) finish(job, { type: "error", id: job.id < 0 ? null : job.id, message });
  };

  const start = (): WorkerLike | null => {
    try {
      const w = makeWorker();
      answered = false;
      w.onmessage = (e) => {
        const m = e.data as RaiseResponse;
        if (disposed || w !== worker || !current || (m.id !== current.id && !(m.type === "error" && m.id === null))) return;
        answered = true;
        if (m.type === "progress") return current.on(m);
        const job = current;
        current = null;
        finish(job, m);
        pump();
      };
      w.onerror = (e) => {
        if (w === worker && !disposed) failAll(withDetail(answered ? COPY.engineStopped : COPY.engineCouldNotStart, e.message));
      };
      w.onmessageerror = () => {
        if (w === worker && !disposed) failAll(COPY.engineUnreadable);
      };
      return w;
    } catch (e) {
      failAll(withDetail(COPY.engineCouldNotStart, e instanceof Error ? e.message : e));
      return null;
    }
  };

  function pump() {
    if (disposed || current || queue.length === 0) return;
    worker ??= start();
    if (!worker) return;
    current = queue.shift()!;
    current.id = ++nextId;
    worker.postMessage({ type: "raise", id: current.id, name: current.file.name, bytes: current.file.bytes }, [current.file.bytes]);
  }

  return {
    raise(file, on) {
      if (disposed) return Promise.resolve();
      return new Promise<void>((done) => {
        queue.push({ id: -1, file, on, done });
        pump();
      });
    },
    dispose() {
      disposed = true;
      worker?.terminate();
      worker = null;
      for (const job of current ? [current, ...queue] : queue) job.done();
      current = null;
      queue = [];
    },
  };
}
