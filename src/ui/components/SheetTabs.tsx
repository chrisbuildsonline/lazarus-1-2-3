// The sheets of a multi-sheet workbook as tabs (requirement 55). Same roving-tabindex pattern as
// Filters.tsx: the selected tab is the one tab stop; Left, Right, Home and End move the choice.
// Nothing is rendered for a one-sheet workbook.
import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { COPY } from "../copy.ts";

export function SheetTabs({ names, selected, onSelect }: { names: readonly string[]; selected: number; onSelect: (index: number) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const keyed = useRef(false);

  useLayoutEffect(() => {
    if (!keyed.current) return;
    keyed.current = false;
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, [selected]);

  if (names.length < 2) return null;

  const onKeyDown = (e: KeyboardEvent) => {
    const moves: Record<string, number> = { ArrowRight: selected + 1, ArrowLeft: selected - 1, Home: 0, End: names.length - 1 };
    const next = moves[e.key];
    if (next === undefined) return;
    e.preventDefault();
    keyed.current = true;
    onSelect((next + names.length) % names.length);
  };

  return (
    <div ref={list} className="tabs sheet-tabs" role="tablist" aria-label={COPY.sheetTabs} onKeyDown={onKeyDown}>
      {names.map((name, i) => (
        <button key={i} type="button" role="tab" className={i === selected ? "tab sheet-tab is-active" : "tab sheet-tab"} aria-selected={i === selected} tabIndex={i === selected ? 0 : -1} onClick={() => onSelect(i)}>
          {name}
        </button>
      ))}
    </div>
  );
}
