// The top bar on the canvas (DESIGN.md section 4, requirement 3): the wordmark at left (not a
// heading), the view name on phone, and on the Sheet view the one primary pill at right.
import type { ReactNode } from "react";
import { COPY } from "../copy.ts";

export function TopBar({ view, primary }: { view: string; primary?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="wordmark">{COPY.wordmark}</span>
        <span className="topbar__view">{view}</span>
      </div>
      {primary}
    </header>
  );
}
