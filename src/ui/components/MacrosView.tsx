// The Macros step (DESIGN.md 4.4, requirements 59 to 75): the queue as a listbox with a roving
// tabindex, the detail beside it from 1024px up, and below that a full-screen dialog. A, R and Z act
// only from the listbox's own keydown (WCAG 2.1.4). The model's text is rendered as React text only.
import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { counts, type Explainer, type Explanation, type MacroQueue } from "../../macro/index.ts";
import { COPY } from "../copy.ts";
import { useExplain } from "../hooks/useExplain.ts";
import { detailModel, keyToAction, queueRows, statusLine, type DetailModel, type ExplainState } from "../model/queue-view.ts";
import { QueuePill } from "./QueuePill.tsx";
import { StatusPill } from "./StatusPill.tsx";

export type Decide = (id: string, decision: "approve" | "reject") => void;

export type MacrosViewProps = {
  queue: MacroQueue;
  /** The item shown in the detail; the first item when null. */
  selectedId: string | null;
  explainState: ExplainState;
  noteLines: readonly string[];
  /** Below 1024px: the queue alone, the detail in a dialog. */
  narrow: boolean;
  open: boolean;
  format: string;
  lineCounts?: Readonly<Record<string, number>>;
  timeZone?: string;
  /** The step tabs, under the title on a phone. */
  steps?: ReactNode;
  titleRef?: (el: HTMLHeadingElement | null) => void;
  /** An option to focus after a decision or an undo; onFocused clears it. */
  focusId?: string | null;
  onFocused?: () => void;
  onSelect: (id: string) => void;
  onDecide: Decide;
  onUndo: () => void;
  onOpen: () => void;
  onClose: () => void;
};

const FOCUSABLE = 'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])';
const TITLE_ID = "macro-detail-title";

function DetailBody({ d }: { d: DetailModel }) {
  const e = d.explanation;
  return (
    <>
      <header className="macro-detail__head">
        <h2 id={TITLE_ID} className="macro-detail__title">
          {d.title}
        </h2>
        <QueuePill state={d.pill} />
      </header>
      <p className="macro-detail__meta">{d.meta}</p>
      <section className="macro-detail__section">
        <h3 className="macro-detail__label">{COPY.parsedLabel}</h3>
        {d.opcode ? (
          <p className="macro-fact">
            <span className="macro-fact__label">{COPY.bytesLabel}</span>
            <span className="mono">{d.opcode.bytes}</span>
          </p>
        ) : (
          <ol className="mono-block macro-steps">
            {d.steps.map((s, i) => (
              <li key={i} className="macro-step">
                <code className="macro-step__raw">{s.raw}</code>
                <span className="macro-step__label">{s.label}</span>
              </li>
            ))}
          </ol>
        )}
      </section>
      {d.opcode && (
        <section className="macro-detail__section">
          <p className="macro-detail__note">{d.opcode.note}</p>
          <h3 className="macro-detail__label">{COPY.affectedCells}</h3>
          <ul className="macro-cells">
            {d.opcode.cells.map((c) => (
              <li key={c.address} className="macro-cell">
                <span className="mono">{c.address}</span>
                <StatusPill status={c.status} />
              </li>
            ))}
          </ul>
        </section>
      )}
      <section className="macro-detail__section">
        <h3 className="macro-detail__label">
          {COPY.explanationLabel}
          {e.model && <span className="macro-explain__model">{e.model}</span>}
        </h3>
        {e.state === "loading" && (
          <p role="status" className="macro-explain__text is-muted">
            {e.text}
          </p>
        )}
        {e.state === "unavailable" && <p className="macro-explain__text is-muted">{e.text}</p>}
        {e.state === "done" && d.opcode && (
          <div className="macro-facts">
            {d.opcode.suggestion && (
              <p className="macro-fact">
                <span className="macro-fact__label">{COPY.suggestionLabel}</span>
                <span className="mono">{d.opcode.suggestion}</span>
              </p>
            )}
            {d.opcode.confidence && <p className="macro-fact">{d.opcode.confidence}</p>}
            {d.opcode.rationale && (
              <p className="macro-fact">
                <span className="macro-fact__label">{COPY.rationaleLabel}</span>
                <span>{d.opcode.rationale}</span>
              </p>
            )}
          </div>
        )}
        {e.state === "done" && !d.opcode && <p className="macro-explain__text">{e.text}</p>}
      </section>
    </>
  );
}

function Actions({ d, id, className, approveRef, onDecide }: { d: DetailModel; id: string; className: string; approveRef: RefObject<HTMLButtonElement | null>; onDecide: Decide }) {
  return (
    <div className={className}>
      <button ref={approveRef} type="button" className="btn-primary" aria-disabled={d.approveDisabled || undefined} onClick={d.approveDisabled ? undefined : () => onDecide(id, "approve")}>
        {COPY.approve}
      </button>
      <button type="button" className="btn-ghost" aria-disabled={d.rejectDisabled || undefined} onClick={d.rejectDisabled ? undefined : () => onDecide(id, "reject")}>
        {COPY.reject}
      </button>
    </div>
  );
}

export function MacrosView(p: MacrosViewProps) {
  const list = useRef<HTMLDivElement>(null);
  const approve = useRef<HTMLButtonElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const { queue, narrow } = p;
  const item = queue.items.find((i) => i.id === p.selectedId) ?? queue.items[0] ?? null;
  const rows = queueRows(queue, item?.id ?? null, p.timeZone);
  const d = item ? detailModel(item, p.explainState, p.lineCounts?.[item.id] ?? null) : null;
  const empty = queue.items.length === 0;
  const notRead = p.format === "wk3" || p.format === "dbf";
  const showDialog = narrow && p.open && item !== null && d !== null;

  const option = (id: string) => [...(list.current?.querySelectorAll<HTMLElement>('[role="option"]') ?? [])].find((el) => el.dataset.id === id) ?? null;

  useLayoutEffect(() => {
    if (!p.focusId) return;
    option(p.focusId)?.focus();
    p.onFocused?.();
  }, [p.focusId]);

  // The dialog takes focus on Approve when it opens and gives it back to the option when it closes.
  useEffect(() => {
    if (showDialog) approve.current?.focus();
    else if (wasOpen.current && item) option(item.id)?.focus();
    wasOpen.current = showDialog;
  }, [showDialog]);

  const onListKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const k = keyToAction(e);
    if (!k || !item) return;
    e.preventDefault();
    if (k.action === "move") {
      const at = queue.items.findIndex((i) => i.id === item.id);
      const last = queue.items.length - 1;
      const to = { prev: Math.max(0, at - 1), next: Math.min(last, at + 1), first: 0, last }[k.to];
      const id = queue.items[to]!.id;
      option(id)?.focus();
      p.onSelect(id);
    } else if (k.action === "open") {
      if (narrow) p.onOpen();
      else approve.current?.focus();
    } else if (k.action === "approve" || k.action === "reject") {
      p.onDecide(item.id, k.action);
    } else p.onUndo();
  };

  const onDialogKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      p.onClose();
      return;
    }
    if (e.key !== "Tab" || !dialog.current) return;
    const items = [...dialog.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && (document.activeElement === first || !dialog.current.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const c = counts(queue);
  return (
    <main className="macros">
      <div className="macros__head">
        <h1 ref={p.titleRef} className="title" tabIndex={-1}>
          {COPY.macrosTitle}
        </h1>
        {p.steps}
        <p className="macros__status">{statusLine(c)}</p>
        <p className="macros__ai">{COPY.aiLine}</p>
        {p.noteLines.length > 0 && (
          <ul className="macros__notes">
            {p.noteLines.map((n, i) => (
              <li key={i}>{n}</li>
            ))}
          </ul>
        )}
      </div>
      <div className="macros__body">
        <section className="surface macros__queue" aria-label={COPY.queueLabel}>
          {empty ? (
            <div className="macros__empty">
              <p>{COPY.macroEmpty}</p>
              {notRead && <p className="is-muted">{COPY.macroEmptyWk3}</p>}
            </div>
          ) : (
            <>
              <div ref={list} className="queue" role="listbox" aria-label={COPY.queueLabel} onKeyDown={onListKey}>
                {rows.map((r) => (
                  <div
                    key={r.id}
                    role="option"
                    data-id={r.id}
                    aria-selected={r.selected}
                    tabIndex={r.tabIndex}
                    className={r.selected ? "queue-row is-selected" : "queue-row"}
                    onClick={() => {
                      p.onSelect(r.id);
                      if (narrow) p.onOpen();
                    }}
                  >
                    <span className="queue-row__top">
                      <span className="queue-row__kind">{r.kind}</span>
                      {r.time && <span className="queue-row__time">{r.time}</span>}
                    </span>
                    <span className="queue-row__line">{r.line}</span>
                    <span className="queue-row__pill">
                      <QueuePill state={r.pill} />
                    </span>
                  </div>
                ))}
              </div>
              <p className="macros__hint">{COPY.queueHint}</p>
            </>
          )}
        </section>
        {!narrow && item && d && (
          <section className="surface macro-detail" aria-labelledby={TITLE_ID}>
            <DetailBody d={d} />
            <Actions d={d} id={item.id} className="macro-detail__actions" approveRef={approve} onDecide={p.onDecide} />
          </section>
        )}
      </div>
      {showDialog && (
        <>
          <div className="scrim" aria-hidden="true" onClick={p.onClose} />
          <div ref={dialog} className="macro-dialog" role="dialog" aria-modal="true" aria-labelledby={TITLE_ID} onKeyDown={onDialogKey}>
            <div className="macro-dialog__scroll">
              <button type="button" className="btn-ghost macro-dialog__back" onClick={p.onClose}>
                {COPY.backToList}
              </button>
              <DetailBody d={d} />
            </div>
            <Actions d={d} id={item.id} className="macro-dialog__foot" approveRef={approve} onDecide={p.onDecide} />
          </div>
        </>
      )}
    </main>
  );
}

/** The Macros step of one file: which item is shown, the dialog, and the explainer call. */
export function MacrosStep(props: {
  queue: MacroQueue;
  fileKey: string;
  explainer: Explainer;
  lastFocus: string | null;
  narrow: boolean;
  format: string;
  noteLines: readonly string[];
  lineCounts: Readonly<Record<string, number>>;
  steps?: ReactNode;
  titleRef?: (el: HTMLHeadingElement | null) => void;
  onDecide: Decide;
  onUndo: () => void;
  onExplained: (itemId: string, e: Explanation) => void;
  onFocusDone: () => void;
}) {
  const { queue, lastFocus } = props;
  const [shown, setShown] = useState<string | null>(queue.items[0]?.id ?? null);
  const [open, setOpen] = useState(false);
  const item = queue.items.find((i) => i.id === shown) ?? queue.items[0] ?? null;
  const explainState = useExplain(item, props.fileKey, props.explainer, props.onExplained);

  useLayoutEffect(() => {
    if (lastFocus === null) return;
    setShown(lastFocus);
    setOpen(false);
  }, [lastFocus]);

  return (
    <MacrosView
      queue={queue}
      selectedId={item?.id ?? null}
      explainState={explainState}
      noteLines={props.noteLines}
      narrow={props.narrow}
      open={open}
      format={props.format}
      lineCounts={props.lineCounts}
      steps={props.steps}
      titleRef={props.titleRef}
      focusId={lastFocus}
      onFocused={props.onFocusDone}
      onSelect={setShown}
      onDecide={props.onDecide}
      onUndo={props.onUndo}
      onOpen={() => setOpen(true)}
      onClose={() => setOpen(false)}
    />
  );
}
