// The step tabs, Sheet then Macros (requirement 59, DESIGN.md section 3 pill tabs). The Report step is
// not built, so it has no tab. Roving tabindex: Left, Right, Home and End move the choice.
import { useLayoutEffect, useRef, type KeyboardEvent } from "react";
import { COPY } from "../copy.ts";

export type Step = "sheet" | "macros";
export const STEP_PANEL = "step-panel";
export const stepTabId = (s: Step) => `step-tab-${s}`;
const STEPS: readonly Step[] = ["sheet", "macros"];

export function StepTabs({ step, waiting, under, onStep }: { step: Step; waiting: number; under: boolean; onStep: (s: Step) => void }) {
  const list = useRef<HTMLDivElement>(null);
  const keyed = useRef(false);

  useLayoutEffect(() => {
    if (!keyed.current) return;
    keyed.current = false;
    list.current?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus();
  }, [step]);

  const onKeyDown = (e: KeyboardEvent) => {
    const at = STEPS.indexOf(step);
    const moves: Record<string, number> = { ArrowRight: at + 1, ArrowLeft: at - 1, Home: 0, End: STEPS.length - 1 };
    const next = moves[e.key];
    if (next === undefined) return;
    e.preventDefault();
    keyed.current = true;
    onStep(STEPS[(next + STEPS.length) % STEPS.length]!);
  };

  return (
    <div ref={list} className={under ? "tabs step-tabs step-tabs--under" : "tabs step-tabs"} role="tablist" aria-label={COPY.stepTabs} onKeyDown={onKeyDown}>
      {STEPS.map((s) => (
        <button
          key={s}
          id={stepTabId(s)}
          type="button"
          role="tab"
          className={s === step ? "tab is-active" : "tab"}
          aria-selected={s === step}
          aria-controls={STEP_PANEL}
          tabIndex={s === step ? 0 : -1}
          onClick={() => onStep(s)}
        >
          {s === "sheet" ? COPY.tabSheet : COPY.macrosTitle}
          {/* The space keeps the accessible name "Macros 4", as COPY.tabMacros has it. */}
          {s === "macros" && waiting > 0 && (
            <>
              {" "}
              <span className="tab__count">{waiting}</span>
            </>
          )}
        </button>
      ))}
    </div>
  );
}
