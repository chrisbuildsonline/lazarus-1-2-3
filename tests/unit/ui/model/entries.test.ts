// Entry filtering, ordering, de-duplication and limits (requirements 10 to 12).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { acceptEntry, LIMITS, planBatch, skippedCounts, type FoundFile } from "../../../../src/ui/model/entries.ts";

const f = (path: string, size = 100): FoundFile<null> => ({ path, name: path.split("/").pop()!, size, file: null });

describe("acceptEntry", () => {
  it("accepts .wk1 and .wks in any case", () => {
    for (const name of ["A.WK1", "b.wks", "c.Wk1", "d.WKS", "e.wk3", "f.WK3", "g.dbf", "h.Dbf"]) expect(acceptEntry(name), name).toBe(true);
  });

  it("skips other extensions, a later suffix and a name with no dot", () => {
    for (const name of ["a.wk2", "a.txt", "a.wk1.bak", "a.dbf.bak", "wk1", "LICENSE", "a.wk"]) expect(acceptEntry(name), name).toBe(false);
  });
});

describe("planBatch", () => {
  it("filters by extension and counts the rest as skipped", () => {
    const plan = planBatch([f("a.wk1"), f("b.txt"), f("c.WKS"), f("d.wk3"), f("e.dbf"), f("f.wk2")]);
    expect(plan.accepted.map((e) => e.path)).toEqual(["a.wk1", "c.WKS", "d.wk3", "e.dbf"]);
    expect(plan.skipped).toEqual([
      { path: "b.txt", why: "extension" },
      { path: "f.wk2", why: "extension" },
    ]);
  });

  it("sorts by path in code-unit order and drops a second entry with the same path", () => {
    const plan = planBatch([f("b/z.wk1"), f("B/a.wk1"), f("a.wk1"), f("b/z.wk1"), f("a.wk1")]);
    // "B" (0x42) sorts before "a" (0x61) and "b" (0x62).
    expect(plan.accepted.map((e) => e.path)).toEqual(["B/a.wk1", "a.wk1", "b/z.wk1"]);
    expect(plan.skipped).toEqual([]);
  });

  it("skips a file over 32 MiB as too-large", () => {
    expect(LIMITS.maxBytes).toBe(32 * 1024 * 1024);
    const plan = planBatch([f("a.wk1", LIMITS.maxBytes), f("b.wk1", LIMITS.maxBytes + 1)]);
    expect(plan.accepted.map((e) => e.path)).toEqual(["a.wk1"]);
    expect(plan.skipped).toEqual([{ path: "b.wk1", why: "too-large" }]);
  });

  it("keeps 500 of 501 files and skips the last one by path as over-limit", () => {
    expect(LIMITS.maxEntries).toBe(500);
    const files = Array.from({ length: 501 }, (_, i) => f(`f${String(i).padStart(3, "0")}.wk1`));
    const plan = planBatch(files.reverse());
    expect(plan.accepted).toHaveLength(500);
    expect(plan.accepted[0]!.path).toBe("f000.wk1");
    expect(plan.skipped).toEqual([{ path: "f500.wk1", why: "over-limit" }]);
  });

  it("counts skipped entries per reason", () => {
    const plan = planBatch([f("a.txt"), f("b.txt"), f("c.wk1", LIMITS.maxBytes + 1)]);
    expect(skippedCounts([...plan.skipped, { path: "x", why: "unreadable" }])).toEqual({ extension: 2, "too-large": 1, unreadable: 1, "over-limit": 0 });
  });

  it("property: the result is the same for every order of the input", () => {
    const entry = fc.record({ dir: fc.constantFrom("", "a/", "B/", "a/b/"), stem: fc.string({ minLength: 1, maxLength: 4 }), ext: fc.constantFrom(".wk1", ".WKS", ".txt", ".wk3"), big: fc.boolean() });
    fc.assert(
      fc.property(fc.uniqueArray(entry, { maxLength: 40, selector: (e) => e.dir + e.stem + e.ext }), fc.integer(), (entries, seed) => {
        const files = entries.map((e) => f(e.dir + e.stem + e.ext, e.big ? LIMITS.maxBytes + 1 : 10));
        const shuffled = [...files, ...files.slice(0, 3)].map((x, i) => ({ x, k: Math.sin(seed + i) })).sort((a, b) => a.k - b.k).map((p) => p.x);
        expect(planBatch(shuffled)).toEqual(planBatch(files));
      }),
    );
  });
});
