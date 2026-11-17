// The batch surface (DESIGN.md section 3 "Batch row", requirements 58 to 61): a listbox with a roving
// tabindex. Up and Down move, Enter or Space chooses; the chosen row is the selected file.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { COPY } from "../copy.ts";
import { batchRow, type FileItem } from "../model/batch-rows.ts";
import { skippedCounts, type SkipReason, type Skipped } from "../model/entries.ts";
import { StatusPill } from "./StatusPill.tsx";

export type BatchListProps = {
  items: readonly FileItem[];
  skipped: readonly Skipped[];
  selectedId: number | null;
  onSelect: (id: number) => void;
};

const REASONS: readonly SkipReason[] = ["extension", "too-large", "unreadable", "over-limit"];

function Side({ pill }: { pill: ReturnType<typeof batchRow>["pill"] }) {
  if (pill === "raising") {
    return (
      <span className="ghost-bar">
        <span className="visually-hidden">{COPY.raising}</span>
      </span>
    );
  }
  if (pill === "failed") {
    return (
      <span className="pill pill--danger">
        <span className="pill__glyph glyph--cross" aria-hidden="true" />
        {COPY.failed}
      </span>
    );
  }
  return <StatusPill status={pill} />;
}

export function BatchList({ items, skipped, selectedId, onSelect }: BatchListProps) {
  const titleId = useId();
  const list = useRef<HTMLUListElement>(null);
  const selectedIndex = Math.max(0, items.findIndex((i) => i.id === selectedId));
  const [active, setActive] = useState(selectedIndex);
  const keyed = useRef(false);

  useEffect(() => setActive(selectedIndex), [selectedIndex]);
  useEffect(() => {
    if (!keyed.current) return;
    keyed.current = false;
    list.current?.querySelectorAll<HTMLElement>('[role="option"]')[active]?.focus();
  }, [active]);

  const onKeyDown = (e: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowDown: active + 1, ArrowUp: active - 1, Home: 0, End: items.length - 1 };
    const next = moves[e.key];
    if (next !== undefined) {
      e.preventDefault();
      keyed.current = true;
      setActive(Math.max(0, Math.min(items.length - 1, next)));
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      const item = items[active];
      if (item) onSelect(item.id);
    }
  };

  const counts = skippedCounts(skipped);
  return (
    <section className="surface batch" aria-labelledby={titleId}>
      <h2 className="batch__title" id={titleId}>
        {COPY.files(items.length)}
      </h2>
      <ul ref={list} className="batch__list" role="listbox" aria-labelledby={titleId} onKeyDown={onKeyDown}>
        {items.map((item, i) => {
          const row = batchRow(item);
          const selected = item.id === selectedId;
          return (
            <li
              key={item.id}
              className={selected ? "batch-row is-selected" : "batch-row"}
              role="option"
              aria-selected={selected}
              aria-busy={row.pill === "raising" || undefined}
              tabIndex={i === active ? 0 : -1}
              onClick={() => {
                setActive(i);
                onSelect(item.id);
              }}
            >
              <span className="batch-row__main">
                <span className="batch-row__top">
                  <span className="batch-row__name">{row.name}</span>
                  {row.kind !== "-" && <span className="batch-row__kind">{row.kind}</span>}
                </span>
                <span className="batch-row__line">{row.line}</span>
              </span>
              <span className="batch-row__side">
                <Side pill={row.pill} />
              </span>
            </li>
          );
        })}
      </ul>
      {REASONS.filter((r) => counts[r] > 0).map((r) => (
        <p key={r} className="batch__skipped">
          {COPY.skippedLine(counts[r], COPY.skipWhy[r])}
        </p>
      ))}
    </section>
  );
}
