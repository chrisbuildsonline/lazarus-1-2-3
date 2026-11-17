// The reducer plus the worker client (design.md "Client"). Each summon disposes the old client and
// makes a new one, so an older batch can neither delay nor mix into the new one (requirement 24).
import { useCallback, useEffect, useReducer, useRef } from "react";
import { COPY } from "../copy.ts";
import { createRaiseClient, type RaiseClient } from "../io/worker-client.ts";
import { appReducer, initialState } from "../model/app-state.ts";
import { planBatch, type FoundFile, type Skipped } from "../model/entries.ts";

/** Anything that can hand over its bytes: a File from a drop or a picker, or the sample. */
export type Readable = { arrayBuffer(): Promise<ArrayBuffer> };

const ENGINE = [COPY.engineCouldNotStart, COPY.engineStopped, COPY.engineUnreadable];
const makeWorker = () => new Worker(new URL("../../workers/raise.worker.ts", import.meta.url), { type: "module" });

export function useRaise() {
  const [state, dispatch] = useReducer(appReducer, initialState);
  const client = useRef<RaiseClient | null>(null);
  const batches = useRef(0);

  useEffect(() => () => client.current?.dispose(), []);

  const summon = useCallback(async (found: readonly FoundFile<Readable>[], skippedBefore: readonly Skipped[] = []) => {
    client.current?.dispose();
    const mine = createRaiseClient(makeWorker);
    client.current = mine;
    const batchId = ++batches.current;
    const { accepted, skipped } = planBatch(found);
    dispatch({ type: "summoned", batchId, entries: accepted.map(({ name, path, size }) => ({ name, path, size })), skipped: [...skippedBefore, ...skipped] });

    // One file at a time, read just before it is sent, so a big batch holds one buffer at most.
    for (const [id, entry] of accepted.entries()) {
      if (client.current !== mine) return;
      let bytes: ArrayBuffer;
      try {
        bytes = await entry.file.arrayBuffer();
      } catch (e) {
        dispatch({ type: "fileFailed", batchId, id, message: e instanceof Error ? e.message : String(e) });
        continue;
      }
      if (client.current !== mine) return;
      dispatch({ type: "progress", batchId, id, step: "start" });
      await mine.raise({ name: entry.name, bytes }, (m) => {
        if (m.type === "progress") dispatch({ type: "progress", batchId, id, step: m.step });
        else if (m.type === "raised") dispatch({ type: "raised", batchId, id, file: m.file });
        else if (ENGINE.some((text) => m.message.startsWith(text))) dispatch({ type: "workerFailed", batchId, message: m.message });
        else dispatch({ type: "fileFailed", batchId, id, message: m.message });
      });
    }
  }, []);

  return { state, dispatch, summon };
}
