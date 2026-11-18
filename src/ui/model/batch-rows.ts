// One row of the batch surface per entry (requirement 59).
import type { Status, Totals } from "../../verify/index.ts";
import type { RaisedFile } from "../../workers/verify-protocol.ts";
import { COPY } from "../copy.ts";
import { formatNumber } from "./format-value.ts";
import { headline, percentVerified } from "./totals.ts";

export type Phase = "queued" | "reading" | "checking" | "raised" | "failed" | "unsupported";

export type FileItem = {
  id: number;
  name: string;
  path: string;
  size: number;
  phase: Phase;
  /** Phase raised, or failed/unsupported with the worker's answer. */
  raised?: RaisedFile;
  failure?: { reason: string; lines: string[] };
};

export type BatchRow = { name: string; kind: "WK1" | "WKS" | "WK3" | "DBF" | "-"; line: string; pill: Status | "failed" | "raising" | "none" };

/** The worst status present: mismatched, then unverifiable, then matched. */
export function worstStatus(t: Totals): Status {
  return t.mismatched > 0 ? "mismatched" : t.unverifiable > 0 ? "unverifiable" : "matched";
}

const KIND = { wk1: "WK1", wks: "WKS", wk3: "WK3", dbf: "DBF", unknown: "-" } as const;

export function batchRow(item: FileItem): BatchRow {
  const kind = item.raised ? KIND[item.raised.verification.format] : "-";
  const row = (line: string, pill: BatchRow["pill"]): BatchRow => ({ name: item.name, kind, line, pill });
  switch (item.phase) {
    case "queued":
      return row(COPY.stages.queued, "raising");
    case "reading":
      return row(COPY.stages.read, "raising");
    case "checking":
      return row(COPY.stages.check, "raising");
    case "failed":
    case "unsupported":
      return row(COPY.couldNotRaise(item.failure?.reason ?? COPY.unsupportedTitle), "failed");
    case "raised": {
      const t = item.raised!.verification.totals;
      // No formulas: nothing was checked, so a neutral pill, never a green Matched.
      if (percentVerified(t).kind === "none") return row(COPY.noFormulas, "none");
      return row(COPY.verifiedLine(headline(t), t.mismatched > 0 ? formatNumber(t.mismatched) : null), worstStatus(t));
    }
  }
}
