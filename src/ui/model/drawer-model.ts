// What the cell drawer shows for one formula cell (requirements 43 to 46). The status is always
// CellResult.status; the difference is computed only to be shown (no number in the UI decides matched).
import type { CellResult, InputRow, Status, Value } from "../../verify/index.ts";
import { COPY } from "../copy.ts";
import { formatNumber, formatValue } from "./format-value.ts";

export type DrawerModel = {
  address: string;
  status: Status;
  sentence: string;
  remembered: string;
  raised: string;
  difference: string | null;
  lotus: string;
  excel: string;
  inputs: { address: string; kind: string; value: string; cached: string }[];
  inputsOmitted: number;
  diagnostics: string[];
};

const hex = (n: number) => `0x${n.toString(16).toUpperCase().padStart(2, "0")}`;

/** An empty or label input has no value to show; any other missing value gets the missing-value copy. */
const inputText = (i: InputRow, v: Value | null, missing: "cached" | "recalculated") => (v === null && (i.kind === "empty" || i.kind === "label") ? "" : formatValue(v, missing));

export function drawerModel(r: CellResult, tol: { relative: number; absolute: number }): DrawerModel {
  const { cached, recalculated, reason } = r;
  const difference = cached?.t === "num" && recalculated?.t === "num" ? COPY.differsBy(formatNumber(recalculated.v - cached.v), tol.relative, tol.absolute) : null;
  const diagnostics = [reason.rule ? `${reason.code} (rule ${reason.rule})` : reason.code];
  if (r.status !== "unverifiable") diagnostics.push(reason.message);
  if (r.candidateOpcodes.length > 0) diagnostics.push(`${r.candidateOpcodes.map(hex).join(", ")}: ${COPY.unconfirmedOpcode}`);
  return {
    address: r.address,
    status: r.status,
    sentence: r.status === "unverifiable" ? reason.message : COPY.sentence[r.status],
    remembered: formatValue(cached, "cached"),
    raised: formatValue(recalculated, "recalculated"),
    difference,
    lotus: r.lotusFormula ?? COPY.formulaUnreadable,
    excel: r.formula ?? COPY.formulaUnreadable,
    inputs: (r.inputs ?? []).map((i) => ({ address: i.address, kind: i.kind, value: inputText(i, i.value, "recalculated"), cached: inputText(i, i.cached, "cached") })),
    inputsOmitted: r.inputsOmitted ?? 0,
    diagnostics,
  };
}
