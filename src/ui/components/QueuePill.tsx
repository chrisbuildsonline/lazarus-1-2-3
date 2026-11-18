// The approval pill, kept apart from the proof pill (DESIGN.md section 3, requirement 65): Waiting on
// the accent tint, Approved with a check, Rejected with a cross; the text is always there.
import { COPY } from "../copy.ts";
import type { QueuePillState } from "../model/queue-view.ts";

const GLYPH: Record<QueuePillState, string> = { waiting: "glyph--dash", approved: "glyph--check", rejected: "glyph--cross" };
const CLASS: Record<QueuePillState, string> = { waiting: "pill pill--queue-waiting", approved: "pill pill--queue-approved", rejected: "pill pill--queue-rejected" };
const TEXT: Record<QueuePillState, string> = { waiting: COPY.pillWaiting, approved: COPY.pillApproved, rejected: COPY.pillRejected };

export function QueuePill({ state }: { state: QueuePillState }) {
  return (
    <span className={CLASS[state]}>
      <span className={`pill__glyph ${GLYPH[state]}`} aria-hidden="true" />
      {TEXT[state]}
    </span>
  );
}
