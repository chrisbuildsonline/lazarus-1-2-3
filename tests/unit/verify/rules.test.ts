import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseRuleTable, ruleProblems, urlsIn } from "../helpers/rule-table.ts";

// Every rule of design.md cites a source from the tracked allowed list (docs/lotus-sources.md,
// copied from design/refs/lotus-semantics/refs.md and the WSFF2 line of design/refs/lotus/SOURCES.md,
// which are not in the repository). Rule ids are unique, and requirements.md names only real ids.

const GOOD = "https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf";
const allowed = new Set([GOOD]);

const table = (...rows: string[]) => ["| Id | Rule | Sources |", "|---|---|---|", ...rows].join("\n");

describe("parseRuleTable", () => {
  it("reads the id and the URLs of each S and U row and skips other rows", () => {
    const md = table(`| S01 | A label counts as 0. | MAN ${GOOD} ch.19 (19-2) |`, "| MAN | https://example.org/x |", "| U04 | 0 ^ 0. | No source. |");
    expect(parseRuleTable(md)).toEqual([
      { id: "S01", urls: [GOOD] },
      { id: "U04", urls: [] },
    ]);
  });

  it("stops a URL at a closing bracket, a pipe or a backtick", () => {
    expect(urlsIn(`(see ${GOOD}) and \`${GOOD}\` |`)).toEqual([GOOD, GOOD]);
  });
});

describe("ruleProblems", () => {
  it("accepts a good row", () => {
    expect(ruleProblems(parseRuleTable(table(`| S01 | rule | ${GOOD} |`)), allowed, "")).toEqual([]);
  });

  it("flags an S row with no URL", () => {
    expect(ruleProblems(parseRuleTable(table("| S02 | rule | the manual |")), allowed, "")).toEqual(["S02 cites no URL"]);
  });

  it("flags a row whose only URL is not on the allowed list", () => {
    const rows = parseRuleTable(table("| S03 | rule | https://example.org/page |"));
    expect(ruleProblems(rows, allowed, "")).toEqual(["S03 cites https://example.org/page, which is not on the allowed list"]);
  });

  it("flags a duplicate id", () => {
    const rows = parseRuleTable(table(`| S04 | rule | ${GOOD} |`, `| S04 | again | ${GOOD} |`));
    expect(ruleProblems(rows, allowed, "")).toEqual(["S04 is defined twice"]);
  });

  it("flags a requirement that names an unknown id", () => {
    const rows = parseRuleTable(table(`| S05 | rule | ${GOOD} |`));
    expect(ruleProblems(rows, allowed, "SUM SHALL add (rules S05, S99).")).toEqual(["requirements name S99, which design.md does not define"]);
  });

  it("lets a U row cite nothing, since a U row records that no source exists", () => {
    expect(ruleProblems(parseRuleTable(table("| U04 | 0 ^ 0. | No source. |")), allowed, "")).toEqual([]);
  });
});

describe("the real rule tables", () => {
  const sources = urlsIn(readFileSync("docs/lotus-sources.md", "utf8"));
  const rows = parseRuleTable(readFileSync(".kiro/specs/verification-engine/design.md", "utf8"));
  const requirements = readFileSync(".kiro/specs/verification-engine/requirements.md", "utf8");

  it("the allowed list holds the refs.md URLs and WSFF2", () => {
    expect(sources).toContain(GOOD);
    expect(sources).toContain("https://oss.sheetjs.com/notes/lotus/WSFF2.TXT");
    expect(sources).toContain("https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/lotform.cxx");
  });

  it("design.md defines S01 to S27 and U01 to U12", () => {
    const ids = (p: string, n: number) => Array.from({ length: n }, (_, i) => `${p}${String(i + 1).padStart(2, "0")}`);
    expect(rows.map((r) => r.id)).toEqual([...ids("S", 27), ...ids("U", 12)]);
  });

  it("every rule cites an allowed source, ids are unique, and requirements name only defined ids", () => {
    expect(ruleProblems(rows, new Set(sources), requirements)).toEqual([]);
  });
});
