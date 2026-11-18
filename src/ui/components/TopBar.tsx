// The top bar on the canvas (DESIGN.md section 4, requirement 3): the wordmark at left (not a
// heading), the view name on phone, the step tabs at centre-left once a file is raised (requirement
// 59, not on a phone, where they sit under the title), and the view's one primary pill at right.
import type { ReactNode } from "react";
import { COPY } from "../copy.ts";

export function TopBar({ view, primary, steps }: { view: string; primary?: ReactNode; steps?: ReactNode }) {
  return (
    <header className="topbar">
      <div className="topbar__brand">
        <span className="wordmark">{COPY.wordmark}</span>
        <span className="topbar__view">{view}</span>
        {steps}
      </div>
      {primary}
    </header>
  );
}
