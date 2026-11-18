// renderReportHtml: one self-contained HTML page for a provenance report (requirements 39 to 44).
// Every report string goes through t(), which escapes it; attributes hold only fixed template text.
// No script, no external resource, no motion. Colours and sizes come from TOKENS only.
import type { InputRow, Status, Value } from "../verify/index.ts";
import { escapeHtml } from "./escape.ts";
import { TOKENS } from "./tokens.ts";
import type { ProvenanceReport, ReportRow, UnknownOpcodeEntry, UnsupportedFeatureEntry } from "./types.ts";

const t = (x: string): string => escapeHtml(x);

const showValue = (v: Value | null): string =>
  t(v === null ? "none" : v.t === "num" ? String(v.v) : v.t === "str" ? `"${v.v}"` : v.t === "err" ? "ERR" : "NA");

const PILL: Record<Status, string> = {
  matched: '<span class="pill pill-matched">Matched</span>',
  mismatched: '<span class="pill pill-mismatched">Mismatched</span>',
  unverifiable: '<span class="pill pill-unverifiable">Unverifiable</span>',
};

const CSS = `
:root { ${Object.entries(TOKENS).map(([k, v]) => `--${k}: ${v};`).join(" ")} }
* { box-sizing: border-box; }
body { margin: 0; background: var(--canvas); color: var(--text); font: var(--text-body); font-variant-numeric: tabular-nums; }
main { max-width: 1360px; margin: 0 auto; padding: var(--space-10) var(--space-8) var(--space-14); display: grid; grid-template-columns: minmax(0, 1fr); gap: var(--space-6); }
section, header { background: var(--surface); border-radius: var(--radius-lg); box-shadow: var(--shadow-surface); padding: var(--space-8); }
.brand { display: inline-block; background: var(--primary); color: var(--on-primary); font: var(--text-small); border-radius: var(--radius-pill); padding: var(--space-1) var(--space-3); }
h1 { font: var(--text-title); letter-spacing: var(--tracking-display); margin: var(--space-4) 0 var(--space-5); overflow-wrap: anywhere; }
h2 { font: var(--text-h2); margin: 0 0 var(--space-4); }
.label { font: var(--text-label); letter-spacing: var(--tracking-label); color: var(--text-muted); text-transform: uppercase; }
.facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: var(--space-4) var(--space-6); }
.facts div > span:last-child { display: block; margin-top: var(--space-1); }
.facts .hash { grid-column: 1 / -1; }
code { font: var(--text-mono); background: var(--surface-sunken); border-radius: var(--radius-sm); padding: 2px var(--space-2); overflow-wrap: anywhere; }
.summary { display: grid; grid-template-columns: auto 1fr; gap: var(--space-8); align-items: center; }
.big { font: var(--text-display); letter-spacing: var(--tracking-display); }
.big span { font: var(--text-h2); color: var(--text-muted); margin-left: var(--space-2); letter-spacing: 0; }
.counts { display: flex; flex-wrap: wrap; gap: var(--space-3); margin: 0 0 var(--space-4); }
.pill { display: inline-block; font: var(--text-small); border-radius: var(--radius-pill); padding: var(--space-1) var(--space-3); white-space: nowrap; }
.pill-matched { background: var(--status-matched-bg); color: var(--status-matched-fg); }
.pill-mismatched { background: var(--status-mismatched-bg); color: var(--status-mismatched-fg); }
.pill-unverifiable { background: var(--status-unverifiable-bg); color: var(--status-unverifiable-fg); }
.counts .pill { font: var(--text-body-strong); padding: var(--space-2) var(--space-4); }
.kept { display: inline-block; background: var(--accent-soft); color: var(--accent-ink); border-radius: var(--radius-md); padding: var(--space-2) var(--space-4); margin: 0; }
.features { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-6); }
ul { margin: 0; padding: 0; list-style: none; }
.features li { padding: var(--space-3) 0; border-top: 1px solid var(--hairline); }
.muted { color: var(--text-muted); }
.scroll { overflow-x: auto; }
table { width: 100%; border-collapse: collapse; }
th { text-align: left; font: var(--text-label); letter-spacing: var(--tracking-label); color: var(--text-muted); text-transform: uppercase; padding: var(--space-3); border-bottom: 1px solid var(--hairline); }
td { padding: var(--space-3); border-bottom: 1px solid var(--hairline); vertical-align: top; }
td.num { text-align: right; white-space: nowrap; }
td.reason { min-width: 260px; color: var(--text-muted); }
.inputs { margin-top: var(--space-2); }
.inputs li { font: var(--text-small); }
@media (max-width: 640px) {
  main { padding: var(--space-4) var(--space-3) var(--space-10); gap: var(--space-4); }
  section, header { padding: var(--space-4); }
  .facts { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-4); }
  .summary, .features { grid-template-columns: minmax(0, 1fr); gap: var(--space-4); }
  .big { font: var(--text-display-sm); }
  .pill { white-space: normal; }
  #cells thead { display: none; }
  #cells table, #cells tbody { display: block; }
  #cells tr { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); grid-template-areas: "cell status" "lotus lotus" "excel excel" "stored recalc" "reason reason"; gap: var(--space-2) var(--space-4); padding: var(--space-4) 0; border-bottom: 1px solid var(--hairline); }
  #cells td { display: block; padding: 0; border: 0; min-width: 0; }
  #cells td.num { text-align: left; white-space: normal; overflow-wrap: anywhere; }
  #cells td.c-cell { grid-area: cell; } #cells td.c-status { grid-area: status; justify-self: end; }
  #cells td.c-lotus { grid-area: lotus; } #cells td.c-excel { grid-area: excel; }
  #cells td.c-stored { grid-area: stored; } #cells td.c-recalc { grid-area: recalc; }
  #cells td.reason { grid-area: reason; min-width: 0; font: var(--text-small); }
  #cells td.c-lotus::before, #cells td.c-excel::before, #cells td.c-stored::before, #cells td.c-recalc::before { display: block; margin-bottom: var(--space-1); font: var(--text-label); letter-spacing: var(--tracking-label); color: var(--text-muted); text-transform: uppercase; }
  #cells td.c-lotus::before { content: "Lotus"; } #cells td.c-excel::before { content: "Excel"; }
  #cells td.c-stored::before { content: "Stored"; } #cells td.c-recalc::before { content: "Recalculated"; }
}
`;

function facts(r: ProvenanceReport): string {
  const tol = `relative ${r.tolerance.relative}, absolute ${r.tolerance.absolute}`;
  const fact = (label: string, value: string, cls = "") => `<div${cls}><span class="label">${label}</span><span>${value}</span></div>`;
  return `<div class="facts">${fact("SHA-256", `<code>${t(r.source.sha256)}</code>`, ' class="hash"')}${fact("Format", t(r.source.format.toUpperCase()))}${fact("Size", t(`${r.source.byteLength} bytes`))}${fact("Tool", t(`${r.tool.name} ${r.tool.version}`))}${fact("Tolerance", t(tol))}</div>`;
}

function summary(r: ProvenanceReport): string {
  const { formulas, matched, mismatched, unverifiable } = r.totals;
  const big = formulas === 0 ? '<p class="big">No formulas</p>' : `<p class="big">${t(String(Math.floor((matched * 100) / formulas)))}%<span>verified</span></p>`;
  const counts = `<div class="counts"><span class="pill pill-matched">Matched ${t(String(matched))}</span><span class="pill pill-mismatched">Mismatched ${t(String(mismatched))}</span><span class="pill pill-unverifiable">Unverifiable ${t(String(unverifiable))}</span></div>`;
  return `<section id="summary" class="summary"><div><span class="label">Formulas checked</span>${big}</div><div>${counts}<p class="muted">${t(`${matched} of ${formulas} formulas recalculate to the value the file stored.`)}</p><p class="kept">Stored values were not changed.</p></div></section>`;
}

const feature = (f: UnsupportedFeatureEntry) =>
  `<li><code>${t(f.name === null ? f.code : `@${f.name}`)}</code> ${t(`${f.code}${f.rule ? ` ${f.rule}` : ""}, ${f.count} ${f.count === 1 ? "cell" : "cells"}: ${f.addresses.join(", ")}${f.count > f.addresses.length ? " ..." : ""}`)}</li>`;
const opcode = (o: UnknownOpcodeEntry) => `<li><code>${t(o.opcode ?? "unknown")}</code> ${t(`${o.count} ${o.count === 1 ? "cell" : "cells"}: ${o.addresses.join(", ")}`)}</li>`;
const list = (items: string[]) => (items.length === 0 ? '<p class="muted">None</p>' : `<ul>${items.join("")}</ul>`);

/** One line per sheet, for a report built from sheets: name, format, counts and the wording. */
function sheetList(r: ProvenanceReport): string {
  if (!r.sheets) return "";
  const item = (s: NonNullable<ProvenanceReport["sheets"]>[number]) => {
    const counts = `${s.format.toUpperCase()}, ${s.totals.formulas} formulas, ${s.totals.matched} matched, ${s.totals.mismatched} mismatched, ${s.totals.unverifiable} unverifiable`;
    const fields = s.fields?.length ? `<p class="muted">${t(`Fields: ${s.fields.join(", ")}`)}</p>` : "";
    return `<li><code>${t(s.name)}</code> ${t(counts)}${s.wording ? `<p>${t(s.wording)}</p>` : ""}${fields}</li>`;
  };
  return `<section id="sheets" class="features"><div><h2>Sheets</h2><ul>${r.sheets.map(item).join("")}</ul></div></section>`;
}

function features(r: ProvenanceReport): string {
  return `<section id="features" class="features"><div><h2>Unsupported features</h2>${list(r.unsupportedFeatures.map(feature))}</div><div><h2>Unknown opcodes</h2>${list(r.unknownOpcodes.map(opcode))}</div></section>`;
}

const inputRow = (i: InputRow) => `<li><code>${t(i.address)}</code> ${t(`${i.kind}, now `)}${showValue(i.value)}${t(", stored ")}${showValue(i.cached)}</li>`;

function row(r: ReportRow): string {
  const formula = (f: string | null) => (f === null ? '<span class="muted">none</span>' : `<code>${t(f)}</code>`);
  const inputs = r.inputs?.length ? `<ul class="inputs">${r.inputs.map(inputRow).join("")}${r.inputsOmitted ? `<li>${t(`and ${r.inputsOmitted} more`)}</li>` : ""}</ul>` : "";
  return `<tr><td class="c-cell"><code>${t(r.address)}</code></td><td class="c-lotus">${formula(r.lotusFormula)}</td><td class="c-excel">${formula(r.excelFormula)}</td><td class="num c-stored">${showValue(r.cached)}</td><td class="num c-recalc">${showValue(r.recalculated)}</td><td class="c-status">${PILL[r.status]}</td><td class="reason">${t(r.reason.message)}${inputs}</td></tr>`;
}

export function renderReportHtml(r: ProvenanceReport): string {
  const out: string[] = [
    '<!doctype html>\n<html lang="en"><head><meta charset="utf-8">',
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">`,
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${t(`${r.source.fileName}: provenance report`)}</title><style>${CSS}</style></head><body><main>`,
    `<header><span class="brand">Lazarus 1-2-3</span><h1>${t(r.source.fileName)}</h1>${facts(r)}</header>`,
    summary(r),
    sheetList(r),
    features(r),
    '<section id="cells"><h2>Every formula</h2><div class="scroll"><table><thead><tr><th>Cell</th><th>Lotus formula</th><th>Excel formula</th><th>Stored</th><th>Recalculated</th><th>Status</th><th>Reason</th></tr></thead><tbody>',
  ];
  for (const x of r.rows) out.push(row(x));
  out.push("</tbody></table></div></section></main></body></html>\n");
  return out.join("");
}
