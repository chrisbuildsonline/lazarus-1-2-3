// Reading dropped files and folders (requirements 8, 9), with fake entries in place of the browser's.
import { describe, expect, expectTypeOf, it } from "vitest";
import { collectDropped, collectFromEntries, type DataTransferLike, type EntryLike } from "../../../src/ui/io/drop.ts";

type FakeFile = { name: string; size: number; webkitRelativePath?: string };
type Entry = EntryLike<FakeFile>;

const later = (f: () => void) => queueMicrotask(f);
const base = (fullPath: string) => fullPath.split("/").pop()!;

function fileEntry(fullPath: string, size = 10, fail = false): Entry {
  return {
    isFile: true,
    isDirectory: false,
    name: base(fullPath),
    fullPath,
    file: (ok, err) => later(() => (fail ? err(new Error("NotReadableError")) : ok({ name: base(fullPath), size }))),
  };
}

function dirEntry(fullPath: string, children: Entry[], counter = { calls: 0 }, chunk = 100): Entry {
  return {
    isFile: false,
    isDirectory: true,
    name: base(fullPath),
    fullPath,
    createReader: () => {
      let next = 0;
      return {
        readEntries: (ok) => {
          counter.calls++;
          const part = children.slice(next, next + chunk);
          next += chunk;
          later(() => ok(part));
        },
      };
    },
  };
}

const paths = (r: { found: { path: string }[] }) => r.found.map((f) => f.path).sort();

describe("collectFromEntries", () => {
  it("a single file", async () => {
    const r = await collectFromEntries([fileEntry("/KSBASE.WK1", 24291)]);
    expect(r.found).toEqual([{ path: "KSBASE.WK1", name: "KSBASE.WK1", size: 24291, file: { name: "KSBASE.WK1", size: 24291 } }]);
    expect(r.skipped).toEqual([]);
  });

  it("a folder with 3 files gives paths relative to the drop, without a leading slash", async () => {
    const r = await collectFromEntries([dirEntry("/ledgers", [fileEntry("/ledgers/a.wk1"), fileEntry("/ledgers/b.wks"), fileEntry("/ledgers/notes.txt")])]);
    expect(paths(r)).toEqual(["ledgers/a.wk1", "ledgers/b.wks", "ledgers/notes.txt"]);
    for (const f of r.found) expect(f.path.startsWith("/")).toBe(false);
  });

  it("reads a folder until the reader returns an empty list (100, 100, 7, then [])", async () => {
    const counter = { calls: 0 };
    const children = Array.from({ length: 207 }, (_, i) => fileEntry(`/big/f${String(i).padStart(3, "0")}.wk1`));
    const r = await collectFromEntries([dirEntry("/big", children, counter)]);
    expect(r.found).toHaveLength(207);
    expect(counter.calls).toBe(4);
  });

  it("walks folders 1,000 levels deep without a stack overflow", async () => {
    let path = "";
    const names = Array.from({ length: 1000 }, (_, i) => `d${i}`);
    const fullPaths = names.map((n) => (path += `/${n}`));
    let entry: Entry = fileEntry(`${fullPaths[999]}/deep.wk1`);
    for (let i = 999; i >= 0; i--) entry = dirEntry(fullPaths[i]!, [entry]);
    const r = await collectFromEntries([entry]);
    expect(r.found).toHaveLength(1);
    expect(r.found[0]!.path).toBe(`${names.join("/")}/deep.wk1`);
  });

  it("an entry whose file() fails is skipped as unreadable and the others still come out", async () => {
    const r = await collectFromEntries([dirEntry("/x", [fileEntry("/x/a.wk1"), fileEntry("/x/bad.wk1", 10, true), fileEntry("/x/c.wk1")])]);
    expect(paths(r)).toEqual(["x/a.wk1", "x/c.wk1"]);
    expect(r.skipped).toEqual([{ path: "x/bad.wk1", why: "unreadable" }]);
  });

  it("a folder whose reader fails is skipped as unreadable", async () => {
    const broken: Entry = { isFile: false, isDirectory: true, name: "locked", fullPath: "/locked", createReader: () => ({ readEntries: (_ok, err) => later(() => err(new Error("denied"))) }) };
    const r = await collectFromEntries([broken, fileEntry("/a.wk1")]);
    expect(paths(r)).toEqual(["a.wk1"]);
    expect(r.skipped).toEqual([{ path: "locked", why: "unreadable" }]);
  });
});

describe("collectDropped", () => {
  it("calls webkitGetAsEntry for every item before its first await", async () => {
    const log: string[] = [];
    let valid = true;
    // The browser empties the items after the event: from the next tick on they give nothing.
    void Promise.resolve().then(() => {
      log.push("tick");
      valid = false;
    });
    const items = ["/a.wk1", "/b.wk1", "/c.wk1"].map((p) => ({
      kind: "file",
      webkitGetAsEntry: () => {
        log.push(`entry ${p}`);
        return valid ? fileEntry(p) : null;
      },
    }));
    const r = await collectDropped<FakeFile>({ items, files: [] });
    expect(log).toEqual(["entry /a.wk1", "entry /b.wk1", "entry /c.wk1", "tick"]);
    expect(paths(r)).toEqual(["a.wk1", "b.wk1", "c.wk1"]);
  });

  it("skips items that are not files", async () => {
    const items = [{ kind: "string", webkitGetAsEntry: () => fileEntry("/no.wk1") }, { kind: "file", webkitGetAsEntry: () => fileEntry("/yes.wk1") }];
    expect(paths(await collectDropped<FakeFile>({ items, files: [] }))).toEqual(["yes.wk1"]);
  });

  it("uses files when webkitGetAsEntry is missing", async () => {
    const files: FakeFile[] = [
      { name: "a.wk1", size: 3, webkitRelativePath: "" },
      { name: "b.wk1", size: 4, webkitRelativePath: "books/b.wk1" },
    ];
    const r = await collectDropped<FakeFile>({ items: [{ kind: "file" }, { kind: "file" }], files });
    expect(r.found).toEqual([
      { path: "a.wk1", name: "a.wk1", size: 3, file: files[0] },
      { path: "books/b.wk1", name: "b.wk1", size: 4, file: files[1] },
    ]);
    expect(r.skipped).toEqual([]);
  });

  it("a real DataTransfer fits DataTransferLike (checked by tsc)", () => {
    expectTypeOf<DataTransfer>().toExtend<DataTransferLike<File>>();
  });
});
