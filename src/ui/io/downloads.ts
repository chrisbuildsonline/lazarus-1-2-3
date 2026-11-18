// The three downloads of a raised file (requirements 52 to 55, 57). The writer and the report are
// loaded by import() on the first download, so the Summon view never loads them. The functions are
// called unchanged: nothing here formats, rounds or replaces a value.
import { toReportItems, type MacroQueue } from "../../macro/index.ts";
import { sheetFromWire, type RaisedFile } from "../../workers/verify-protocol.ts";
import { COPY } from "../copy.ts";
import { downloadName, type DownloadKind } from "../model/file-names.ts";

export type Download = { name: string; data: Uint8Array | string; mime: string };
export type DownloadResult = { ok: true; download: Download } | { ok: false; reason: string };

const MIME: Record<DownloadKind, string> = {
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "report-html": "text/html;charset=utf-8",
  "report-json": "application/json;charset=utf-8",
};

const oneSheet = (raised: RaisedFile) => raised.format !== "wk3" && raised.format !== "dbf";

/** The queue goes into both reports as the person's decisions; the XLSX never reads it. */
export async function buildDownload(kind: DownloadKind, raised: RaisedFile, version: string, queue?: MacroQueue): Promise<DownloadResult> {
  const done = (data: Uint8Array | string): DownloadResult => ({ ok: true, download: { name: downloadName(raised.name, kind), data, mime: MIME[kind] } });
  if (kind === "xlsx") {
    const { writeXlsx } = await import("../../xlsx/index.ts");
    // The whole workbook (requirement 58); a WK1 or WKS file keeps the one-sheet input and its bytes.
    const sheets = raised.sheets.map((s) => ({ name: s.name, sheet: sheetFromWire(s.sheet), verification: s.verification }));
    return done((await writeXlsx(oneSheet(raised) ? sheets[0]! : { sheets })).bytes);
  }
  if (raised.sha256 === null) return { ok: false, reason: COPY.noFingerprint };
  const { buildReport, renderReportHtml, serializeReportJson } = await import("../../report/index.ts");
  const scalars = { fileName: raised.name, sha256: raised.sha256, byteLength: raised.byteLength, toolVersion: version, ...(queue ? { macros: toReportItems(queue) } : {}) };
  const fields = raised.table ? { fields: raised.table.fields.map((f) => f.name) } : {};
  const report = oneSheet(raised)
    ? buildReport({ ...scalars, verification: raised.sheets[0]!.verification })
    : buildReport({ ...scalars, format: raised.format, sheets: raised.sheets.map((s) => ({ name: s.name, verification: s.verification, values: s.sheet.cells.length, ...fields })) });
  return done(kind === "report-html" ? renderReportHtml(report) : serializeReportJson(report));
}

export type AnchorLike = { href: string; download: string; click(): void; remove(): void };
export type DocLike<A extends AnchorLike> = { createElement(tag: "a"): A; body: { append(node: A): void } };
export type UrlLike = { createObjectURL(blob: Blob): string; revokeObjectURL(url: string): void };

/** Hands the data to the browser as a Blob download, then revokes the object URL. */
export function saveBlob<A extends AnchorLike>(doc: DocLike<A>, url: UrlLike, name: string, data: BlobPart, mime: string): void {
  const href = url.createObjectURL(new Blob([data], { type: mime }));
  const a = doc.createElement("a");
  a.href = href;
  a.download = name;
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => url.revokeObjectURL(href), 0);
}
