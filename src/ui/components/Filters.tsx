// Status filters as pill tabs with counts (DESIGN.md section 3, requirement 39). Roving tabindex: the
// chosen tab is the one tab stop, and the arrow keys, Home and End move the choice.
import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { COPY } from "../copy.ts";
import { formatNumber } from "../model/format-value.ts";
import type { Filter } from "../model/status-groups.ts";

const ORDER: readonly Filter[] = ["all", "matched", "mismatched", "unverifiable"];
const NAME = (f: Filter) => (f === "all" ? COPY.filterAll : COPY.status[f]);

export function Filters({ counts, value, onChange, controls }: { counts: Record<Filter, number>; value: Filter; onChange: (f: Filter) => void; controls?: string }) {
  const list = useRef<HTMLDivElement>(null);
  const keyed = useRef(false);

  useLayoutEffect(() => {
    if (!keyed.current) return;
    keyed.current = false;
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, [value]);

  const onKeyDown = (e: KeyboardEvent) => {
    const i = ORDER.indexOf(value);
    const moves: Record<string, number> = { ArrowRight: i + 1, ArrowLeft: i - 1, Home: 0, End: ORDER.length - 1 };
    const next = moves[e.key];
    if (next === undefined) return;
    e.preventDefault();
    keyed.current = true;
    onChange(ORDER[(next + ORDER.length) % ORDER.length]!);
  };

  return (
    <div ref={list} className="tabs filters" role="tablist" aria-label={COPY.filterLabel} onKeyDown={onKeyDown}>
      {ORDER.map((f) => (
        <button
          key={f}
          type="button"
          role="tab"
          className={f === value ? "tab is-active" : "tab"}
          aria-selected={f === value}
          aria-controls={controls}
          tabIndex={f === value ? 0 : -1}
          onClick={() => onChange(f)}
        >
          {NAME(f)} <span className="tab__count">{formatNumber(counts[f])}</span>
        </button>
      ))}
    </div>
  );
}
