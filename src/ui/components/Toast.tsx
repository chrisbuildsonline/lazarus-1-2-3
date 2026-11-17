// Toasts (DESIGN.md section 3, requirement 56). Info is a status that leaves after 4 s, paused while
// hovered or focused; an error is an alert that stays until Dismiss.
import { useEffect, useState } from "react";
import { COPY } from "../copy.ts";
import type { Toast } from "../model/app-state.ts";

const INFO_MS = 4000;

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: (id: number) => void }) {
  const [paused, setPaused] = useState(false);
  useEffect(() => {
    if (toast.kind !== "info" || paused) return;
    const timer = setTimeout(() => onDismiss(toast.id), INFO_MS);
    return () => clearTimeout(timer);
  }, [toast.kind, toast.id, paused, onDismiss]);

  if (toast.kind === "error") {
    return (
      <div className="toast toast--error" role="alert">
        <span className="toast__text">{toast.text}</span>
        <button type="button" className="btn-ghost" onClick={() => onDismiss(toast.id)}>
          {COPY.dismiss}
        </button>
      </div>
    );
  }
  return (
    <div className="toast" role="status" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}>
      <span className="toast__text">{toast.text}</span>
    </div>
  );
}

export function Toasts({ toasts, onDismiss }: { toasts: readonly Toast[]; onDismiss: (id: number) => void }) {
  return (
    <div className="toasts" role="region" aria-label={COPY.notifications}>
      {toasts.map((t) => (
        <ToastItem key={t.id} toast={t} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
