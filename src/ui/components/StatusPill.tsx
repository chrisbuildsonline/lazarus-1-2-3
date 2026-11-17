// A short tinted pill with a shape glyph, so status is never colour alone (DESIGN.md section 3).
import type { Status } from "../../verify/index.ts";
import { COPY } from "../copy.ts";

const GLYPH: Record<Status, string> = { matched: "glyph--dot", mismatched: "glyph--bar", unverifiable: "glyph--ring" };

export function StatusPill({ status }: { status: Status }) {
  return (
    <span className={`pill pill--${status}`}>
      <span className={`pill__glyph ${GLYPH[status]}`} aria-hidden="true" />
      {COPY.status[status]}
    </span>
  );
}
