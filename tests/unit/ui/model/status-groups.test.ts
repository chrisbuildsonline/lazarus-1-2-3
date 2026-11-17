// The phone status list and the filters: groups, counts and filtered rows (requirements 39 to 41).
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { a1 } from "../../../../src/parser/index.ts";
import { filterRows, groupByStatus, statusCounts } from "../../../../src/ui/model/status-groups.ts";
import type { CellResult, Status } from "../../../../src/verify/index.ts";
import { totals } from "../../../../src/verify/report.ts";
import { cellResult } from "../../helpers/raised.ts";

const STATUSES: Status[] = ["matched", "mismatched", "unverifiable"];
const ALL = new Set<Status>(STATUSES);
const NONE = new Set<Status>();

// Verify order is row-major.
const cells: CellResult[] = [
  cellResult(0, 0, "A1", "matched", 1),
  cellResult(1, 0, "B1", "unverifiable", 1),
  cellResult(2, 0, "C1", "mismatched", 6),
  cellResult(0, 1, "A2", "matched", 1),
  cellResult(1, 2, "B3", "mismatched", 18330),
];

const addresses = (rows: CellResult[]) => rows.map((r) => r.address);

describe("groupByStatus", () => {
  it("orders the groups mismatched, unverifiable, matched", () => {
    expect(groupByStatus(cells, ALL).map((g) => g.status)).toEqual(["mismatched", "unverifiable", "matched"]);
  });

  it("leaves out empty groups", () => {
    const onlyMatched = cells.filter((c) => c.status === "matched");
    expect(groupByStatus(onlyMatched, ALL).map((g) => g.status)).toEqual(["matched"]);
    expect(groupByStatus([], ALL)).toEqual([]);
  });

  it("collapses matched unless expanded or filtered, and keeps its count", () => {
    const collapsed = groupByStatus(cells, NONE).find((g) => g.status === "matched")!;
    expect(collapsed).toEqual({ status: "matched", count: 2, expanded: false, rows: [] });
    const open = groupByStatus(cells, new Set<Status>(["matched"])).find((g) => g.status === "matched")!;
    expect(open.expanded).toBe(true);
    expect(addresses(open.rows)).toEqual(["A1", "A2"]);
    expect(groupByStatus(cells, NONE, "matched")).toEqual([{ status: "matched", count: 2, expanded: true, rows: [cells[0], cells[3]] }]);
  });

  it("shows the other groups expanded and keeps verify order inside a group", () => {
    const groups = groupByStatus(cells, NONE);
    expect(groups[0]).toEqual({ status: "mismatched", count: 2, expanded: true, rows: [cells[2], cells[4]] });
    expect(addresses(groups[1]!.rows)).toEqual(["B1"]);
  });

  it("with a filter shows only that group", () => {
    expect(groupByStatus(cells, NONE, "unverifiable").map((g) => g.status)).toEqual(["unverifiable"]);
    expect(groupByStatus(cells.filter((c) => c.status !== "mismatched"), NONE, "mismatched")).toEqual([]);
  });

  it("property: the groups' rows, sorted by (row, col), are the input", () => {
    const sheet = fc
      .uniqueArray(fc.tuple(fc.nat(20), fc.nat(50), fc.constantFrom(...STATUSES)), { selector: ([c, r]) => `${c}:${r}`, maxLength: 80 })
      .map((xs) => xs.sort((a, b) => a[1] - b[1] || a[0] - b[0]).map(([c, r, s]) => cellResult(c, r, a1(c, r), s, 1)));
    fc.assert(
      fc.property(sheet, (input) => {
        const rows = groupByStatus(input, ALL).flatMap((g) => g.rows);
        expect(rows.sort((a, b) => a.row - b.row || a.col - b.col)).toEqual(input);
      }),
    );
  });
});

describe("statusCounts", () => {
  it("equals the totals of the same cells", () => {
    const t = totals(cells);
    expect(statusCounts(cells)).toEqual({ all: t.formulas, matched: t.matched, mismatched: t.mismatched, unverifiable: t.unverifiable });
    expect(statusCounts(cells)).toEqual({ all: 5, matched: 2, mismatched: 2, unverifiable: 1 });
  });
});

describe("filterRows", () => {
  it("keeps the cells of one status in verify order", () => {
    expect(filterRows(cells, "mismatched")).toEqual({ rows: [cells[2], cells[4]], empty: null });
    expect(filterRows(cells, "all")).toEqual({ rows: cells, empty: null });
  });

  it("names the status when no cell has it", () => {
    const none = cells.filter((c) => c.status !== "mismatched");
    expect(filterRows(none, "mismatched")).toEqual({ rows: [], empty: "No mismatched cells on this sheet." });
    expect(filterRows([], "unverifiable").empty).toBe("No unverifiable cells on this sheet.");
  });
});
