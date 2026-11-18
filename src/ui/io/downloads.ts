// The three downloads of a raised file (requirements 52 to 55, 57). The writer and the report are
// loaded by import() on the first download, so the Summon view never loads them. The functions are
// called unchanged: nothing here formats, rounds or replaces a value.
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

export async function buildDownload(kind: DownloadKind, raised: RaisedFile, version: string): Promise<DownloadResult> {
  const done = (data: Uint8Array | string): DownloadResult => ({ ok: true, download: { name: downloadName(raised.name, kind), data, mime: MIME[kind] } });
  if (kind === "xlsx") {
    const { writeXlsx } = await import("../../xlsx/index.ts");
    const first = raised.sheets[0]!;
    return done((await writeXlsx({ sheet: sheetFromWire(first.sheet), verification: first.verification })).bytes);
  }
  if (raised.sha256 === null) return { ok: false, reason: COPY.noFingerprint };
  const { buildReport, renderReportHtml, serializeReportJson } = await import("../../report/index.ts");
  const report = buildReport({ fileName: raised.name, sha256: raised.sha256, byteLength: raised.byteLength, toolVersion: version, verification: raised.sheets[0]!.verification });
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
