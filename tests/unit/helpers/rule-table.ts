// Test-only: reads the S and U rule tables of a design.md and checks their citations.

export type RuleRow = { id: string; urls: string[] };

const RULE_ID = /^[SU]\d{2}$/;

/** Every http(s) URL in the text, cut at whitespace, a pipe, a bracket, a quote or a backtick. */
export function urlsIn(text: string): string[] {
  return [...text.matchAll(/https?:\/\/[^\s|()<>"'`]+/g)].map((m) => m[0].replace(/[.,;:]+$/, ""));
}

const firstCell = (line: string) => (line.split("|")[1] ?? "").trim();

/**
 * The rows whose first cell is a rule id such as S01 or U12, in file order, from tables whose
 * header's first cell is "Id" (the rule tables; other tables may mention ids in their first cell).
 */
export function parseRuleTable(markdown: string): RuleRow[] {
  const rows: RuleRow[] = [];
  let inTable = false;
  let ruleTable = false;
  for (const line of markdown.split("\n")) {
    if (!line.startsWith("|")) {
      inTable = false;
      continue;
    }
    if (!inTable) {
      inTable = true;
      ruleTable = firstCell(line) === "Id";
      continue;
    }
    const id = firstCell(line);
    if (ruleTable && RULE_ID.test(id)) rows.push({ id, urls: urlsIn(line) });
  }
  return rows;
}

/**
 * Problems with the rows: an S row with no URL, a URL not on the allowed list, an id defined
 * twice, and an S or U id named in the requirements text that no row defines. A U row may cite
 * nothing, because it records a case no source defines.
 */
export function ruleProblems(rows: RuleRow[], allowed: ReadonlySet<string>, requirements: string): string[] {
  const problems: string[] = [];
  const seen = new Set<string>();
  for (const row of rows) {
    if (seen.has(row.id)) problems.push(`${row.id} is defined twice`);
    seen.add(row.id);
    if (row.id.startsWith("S") && row.urls.length === 0) problems.push(`${row.id} cites no URL`);
    for (const url of row.urls) if (!allowed.has(url)) problems.push(`${row.id} cites ${url}, which is not on the allowed list`);
  }
  const named = new Set([...requirements.matchAll(/\b[SU]\d{2}\b/g)].map((m) => m[0]));
  for (const id of named) if (!seen.has(id)) problems.push(`requirements name ${id}, which design.md does not define`);
  return problems;
}
