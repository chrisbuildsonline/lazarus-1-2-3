// Display text for values (requirements 36, 45). Never rounds: the digits are String(n)'s
// shortest round-trip form, with thousands separators added to the integer part only.
import type { Value } from "../../verify/index.ts";
import { COPY } from "../copy.ts";

export function formatNumber(n: number): string {
  if (Object.is(n, -0)) return "0";
  const text = String(n);
  if (Math.abs(n) >= 1e15 || text.includes("e")) return text;
  const [whole, fraction] = text.split(".") as [string, string | undefined];
  const sign = whole.startsWith("-") ? "-" : "";
  const digits = sign ? whole.slice(1) : whole;
  const grouped = digits.replace(/\B(?=(\d{3})+$)/g, ",");
  return `${sign}${grouped}${fraction === undefined ? "" : `.${fraction}`}`;
}

export function missingValueText(missing: "cached" | "recalculated"): string {
  return missing === "cached" ? COPY.missingCached : COPY.missingRecalculated;
}

export function formatValue(v: Value | null, missing: "cached" | "recalculated"): string {
  if (v === null) return missingValueText(missing);
  switch (v.t) {
    case "num":
      return formatNumber(v.v);
    case "err":
      return "ERR";
    case "na":
      return "NA";
    case "str":
      return `"${v.v}"`;
  }
}
