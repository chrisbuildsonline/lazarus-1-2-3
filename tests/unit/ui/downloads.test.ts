// The three downloads of a raised file and the Blob hand-off (requirements 52 to 55, 57).
import { readFileSync } from "node:fs";
import { describe, expect, expectTypeOf, it } from "vitest";
import { buildDownload, saveBlob, type AnchorLike, type DocLike, type UrlLike } from "../../../src/ui/io/downloads.ts";
import { downloadName } from "../../../src/ui/model/file-names.ts";
import type { RaisedFile } from "../../../src/workers/verify-protocol.ts";
import { raiseFixture } from "../helpers/raised.ts";
import { readXlsx } from "../helpers/xlsx-readback.ts";

type ManifestEntry = { path: string; sha256: string; counts: { cells: number } };
const manifest = JSON.parse(readFileSync("fixtures/manifest.json", "utf8")) as { fixtures: ManifestEntry[] };
const KSBASE = manifest.fixtures.find((f) => f.path === "fixtures/ksbase/KSBASE.WK1")!;

const XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const NO_HASH = "This browser cannot fingerprint the file here. Use https or localhost.";

let cached: RaisedFile | null = null;
const ksbase = async () => (cached ??= await raiseFixture(KSBASE.path));

async function built(kind: Parameters<typeof buildDownload>[0], raised: RaisedFile) {
  const r = await buildDownload(kind, raised, "0.0.0");
  if (!r.ok) throw new Error(r.reason);
  return r.download;
}

describe("buildDownload", () => {
  it("xlsx: the workbook reads back with every cell, and each formula's text and stored result", async () => {
    const raised = await ksbase();
    const d = await built("xlsx", raised);
    expect(d.name).toBe("KSBASE.xlsx");
    expect(d.mime).toBe(XLSX_MIME);
    const back = await readXlsx(d.data as Uint8Array);
    expect(back.cells.size).toBe(KSBASE.counts.cells);
    expect(back.cells.size).toBe(1250);
    for (const r of raised.verification.cells) {
      const got = back.cells.get(r.address)!;
      expect(got.formula, r.address).toBe(r.formula);
      if (r.formula !== null && r.cached?.t === "num") expect(got.result === r.cached.v || (r.cached.v === 0 && got.result === 0), r.address).toBe(true);
    }
    // O3 (manifest): formula with the stored result 0.25153768659966846.
    expect(back.cells.get("O3")!.result).toBe(0.25153768659966846);
  });

  it("report-json: source hash from the manifest, file name and totals", async () => {
    const raised = await ksbase();
    const d = await built("report-json", raised);
    expect(d.name).toBe("KSBASE.report.json");
    expect(d.mime).toBe("application/json;charset=utf-8");
    const report = JSON.parse(d.data as string);
    expect(report.source.sha256).toBe(KSBASE.sha256);
    expect(report.source.fileName).toBe("KSBASE.WK1");
    expect(report.source.byteLength).toBe(24291);
    expect(report.totals).toEqual(raised.verification.totals);
    expect(report.tool.version).toBe("0.0.0");
  });

  it("report-html: self-contained, with the file name and hash", async () => {
    const d = await built("report-html", await ksbase());
    expect(d.name).toBe("KSBASE.report.html");
    expect(d.mime).toBe("text/html;charset=utf-8");
    const page = d.data as string;
    expect(page.toLowerCase()).not.toContain("<script");
    expect(page).not.toMatch(/\s(src|href)=/i);
    expect(page).toContain("KSBASE.WK1");
    expect(page).toContain(KSBASE.sha256);
  });

  it("names come from downloadName", async () => {
    const raised = { ...(await ksbase()), name: "C:\\old\\a:b?.wk1" };
    for (const kind of ["xlsx", "report-html", "report-json"] as const) expect((await built(kind, raised)).name).toBe(downloadName(raised.name, kind));
  });

  it("without a hash both reports fail with a reason and the workbook still builds", async () => {
    const raised = { ...(await ksbase()), sha256: null };
    expect(await buildDownload("report-html", raised, "0.0.0")).toEqual({ ok: false, reason: NO_HASH });
    expect(await buildDownload("report-json", raised, "0.0.0")).toEqual({ ok: false, reason: NO_HASH });
    expect((await buildDownload("xlsx", raised, "0.0.0")).ok).toBe(true);
  });

  it("two builds give equal bytes", async () => {
    const raised = await ksbase();
    for (const kind of ["xlsx", "report-html", "report-json"] as const) expect((await built(kind, raised)).data, kind).toEqual((await built(kind, raised)).data);
  });

  it("source check: xlsx and report are loaded only through import()", () => {
    const src = readFileSync("src/ui/io/downloads.ts", "utf8");
    expect(src).toMatch(/import\(\s*"\.\.\/\.\.\/xlsx\/index\.ts"\s*\)/);
    expect(src).toMatch(/import\(\s*"\.\.\/\.\.\/report\/index\.ts"\s*\)/);
    expect(src).not.toMatch(/from\s*["'][^"']*\/(xlsx|report)\//);
  });
});

type FakeAnchor = AnchorLike & { clicks: number };

function fakes() {
  const log: string[] = [];
  const blobs: Blob[] = [];
  const children: FakeAnchor[] = [];
  const url: UrlLike = {
    createObjectURL: (b) => {
      blobs.push(b);
      log.push("create");
      return "blob:fake";
    },
    revokeObjectURL: (u) => log.push(`revoke ${u}`),
  };
  const doc: DocLike<FakeAnchor> = {
    createElement: () => {
      const a: FakeAnchor = {
        href: "",
        download: "",
        clicks: 0,
        click: () => {
          a.clicks++;
          log.push(`click ${a.href} ${a.download}`);
        },
        remove: () => void children.splice(children.indexOf(a), 1),
      };
      return a;
    },
    body: { append: (a) => void children.push(a) },
  };
  return { log, blobs, children, url, doc };
}

describe("saveBlob", () => {
  it("creates one object URL, clicks one anchor with the name, revokes after the click and leaves no anchor", async () => {
    const f = fakes();
    let anchor: FakeAnchor | null = null;
    const create = f.doc.createElement;
    f.doc.createElement = (tag) => (anchor = create(tag));
    saveBlob(f.doc, f.url, "KSBASE.report.json", "{}\n", "application/json;charset=utf-8");
    await new Promise((r) => setTimeout(r, 0));
    expect(f.log).toEqual(["create", "click blob:fake KSBASE.report.json", "revoke blob:fake"]);
    expect(f.blobs).toHaveLength(1);
    expect(f.blobs[0]).toBeInstanceOf(Blob);
    expect(f.blobs[0]!.type).toBe("application/json;charset=utf-8");
    expect(await f.blobs[0]!.text()).toBe("{}\n");
    expect(anchor!.clicks).toBe(1);
    expect(f.children).toEqual([]);
  });

  it("a real document and URL fit the fakes' types (checked by tsc)", () => {
    expectTypeOf<Document>().toExtend<DocLike<HTMLAnchorElement>>();
    expectTypeOf<typeof URL>().toExtend<UrlLike>();
  });
});
