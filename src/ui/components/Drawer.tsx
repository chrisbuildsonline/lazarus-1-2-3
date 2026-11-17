// The cell drawer (DESIGN.md 4.3, requirements 43 to 51). Desktop and tablet: a floating, non-modal
// complementary panel. Phone: a full-screen modal sheet with a scrim, focus moved in and trapped.
import { useEffect, useRef, type KeyboardEvent } from "react";
import { COPY } from "../copy.ts";
import type { DrawerModel } from "../model/drawer-model.ts";
import { StatusPill } from "./StatusPill.tsx";

export type DrawerProps = {
  model: DrawerModel;
  mode: "desktop" | "phone";
  onClose: () => void;
  onCopyExcel?: (text: string) => void;
};

const MISSING = new Set<string>([COPY.missingCached, COPY.missingRecalculated]);
const FOCUSABLE = 'button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])';

function Value({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span className="stat__label">{label}</span>
      <span className={MISSING.has(value) ? "stat__value is-missing" : "stat__value"}>{value}</span>
    </div>
  );
}

function Formula({ label, text }: { label: string; text: string }) {
  return (
    <div className="drawer__formula">
      <span className="drawer__label">{label}</span>
      <pre className="mono-block">{text}</pre>
    </div>
  );
}

export function Drawer({ model, mode, onClose, onCopyExcel }: DrawerProps) {
  // A div ref also fits the aside (HTMLDivElement is an HTMLElement).
  const root = useRef<HTMLDivElement>(null);
  const close = useRef<HTMLButtonElement>(null);
  const phone = mode === "phone";

  useEffect(() => {
    if (phone) close.current?.focus();
  }, [phone]);

  const onKeyDown = (e: KeyboardEvent<HTMLElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
      return;
    }
    if (!phone || e.key !== "Tab" || !root.current) return;
    const items = [...root.current.querySelectorAll<HTMLElement>(FOCUSABLE)];
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const body = (
    <>
      <header className="drawer__head">
        <div className="drawer__id">
          <span className="drawer__label">{COPY.cell}</span>
          <div className="drawer__title">
            <h2 className="drawer__address">{model.address}</h2>
            <StatusPill status={model.status} />
          </div>
        </div>
        <button ref={close} type="button" className="btn-icon" aria-label={COPY.closeCell} onClick={onClose}>
          <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      </header>
      <p className="drawer__sentence">{model.sentence}</p>
      <div className="drawer__values">
        <Value label={COPY.remembered} value={model.remembered} />
        <Value label={COPY.raised} value={model.raised} />
      </div>
      {model.difference && <p className="drawer__difference">{model.difference}</p>}
      <div className="drawer__formulas">
        <Formula label={COPY.lotus} text={model.lotus} />
        <Formula label={COPY.excel} text={model.excel} />
      </div>
      {model.inputs.length > 0 && (
        <section className="drawer__section">
          <h3 className="drawer__label">{COPY.inputs}</h3>
          <dl className="drawer__inputs">
            {model.inputs.map((i) => (
              <div key={i.address} className="drawer__input">
                <dt>{i.address}</dt>
                <dd>{i.value}</dd>
              </div>
            ))}
          </dl>
          {model.inputsOmitted > 0 && <p className="drawer__more">{COPY.andMore(model.inputsOmitted)}</p>}
        </section>
      )}
      <section className="drawer__section">
        <h3 className="drawer__label">{COPY.diagnostics}</h3>
        <ul className="drawer__diagnostics">
          {model.diagnostics.map((d) => (
            <li key={d}>{d}</li>
          ))}
        </ul>
      </section>
      {model.excel !== COPY.formulaUnreadable && (
        <button type="button" className="btn-text drawer__copy" onClick={() => onCopyExcel?.(model.excel)}>
          {COPY.copyExcel}
        </button>
      )}
    </>
  );

  if (!phone) {
    return (
      <aside ref={root} className="drawer drawer--panel" role="complementary" aria-label={COPY.cellName(model.address)} onKeyDown={onKeyDown}>
        {body}
      </aside>
    );
  }
  return (
    <>
      <div className="scrim" aria-hidden="true" onClick={onClose} />
      <div
        ref={root}
        className="drawer drawer--sheet"
        role="dialog"
        aria-modal="true"
        aria-label={COPY.cellName(model.address)}
        onKeyDown={onKeyDown}
      >
        <div className="drawer__scroll">{body}</div>
        <div className="drawer__back">
          <button type="button" className="btn-ghost" onClick={onClose}>
            {COPY.backToList}
          </button>
        </div>
      </div>
    </>
  );
}
