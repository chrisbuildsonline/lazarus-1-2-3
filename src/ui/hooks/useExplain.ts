// Asks the explainer about the shown queue item (design.md "Macros view", requirement 72): only for
// the item shown, only when it has no explanation, at most once per item and file, and aborted when
// the item or the file changes. explainStep is the pure core; the hook only wires it to React.
import { useEffect, useRef, useState } from "react";
import { explainRequest, type Explainer, type Explanation, type QueueItem } from "../../macro/index.ts";
import type { ExplainState } from "../model/queue-view.ts";

/** Asked questions by `fileKey:itemId`: still loading, or answered with nothing. */
export type Asked = Map<string, "loading" | "unavailable">;

export function explainStep(args: {
  item: QueueItem | null;
  fileKey: string;
  asked: Asked;
  explainer: Explainer;
  signal: AbortSignal;
  setState: (s: ExplainState) => void;
  onExplained: (itemId: string, e: Explanation) => void;
}): void {
  const { item, fileKey, asked, explainer, signal, setState, onExplained } = args;
  if (item === null) return setState("idle");
  if (item.suggestion !== null) return setState("done");
  const key = `${fileKey}:${item.id}`;
  const before = asked.get(key);
  if (before) return setState(before);
  asked.set(key, "loading");
  setState("loading");
  const settle = (e: Explanation | null) => {
    // An aborted question was never answered, so it may be asked again when the item comes back.
    if (signal.aborted) return void asked.delete(key);
    if (e) {
      asked.delete(key);
      onExplained(item.id, e);
    } else {
      asked.set(key, "unavailable");
      setState("unavailable");
    }
  };
  explainer.explain(explainRequest(item), signal).then(settle, () => settle(null));
}

export function useExplain(item: QueueItem | null, fileKey: string, explainer: Explainer, onExplained: (itemId: string, e: Explanation) => void): ExplainState {
  const [state, setState] = useState<ExplainState>("idle");
  const asked = useRef<Asked>(new Map());
  const answered = useRef(onExplained);
  answered.current = onExplained;
  const id = item?.id ?? null;
  const has = item?.suggestion != null;
  const latest = useRef(item);
  latest.current = item;

  useEffect(() => {
    const c = new AbortController();
    explainStep({ item: latest.current, fileKey, asked: asked.current, explainer, signal: c.signal, setState, onExplained: (i, e) => answered.current(i, e) });
    return () => c.abort();
  }, [id, has, fileKey, explainer]);

  return has ? "done" : state;
}
