// Argument parsing for the lazarus CLI (requirements 47, 48, 52). Pure: no node:* imports.
// `--json` and `--verify` may appear anywhere and repeat, as before. `--xlsx` and `--report` take
// the next token as their value, once each; the `--flag=value` spelling is refused to keep one form.

export type ReportFormat = "json" | "html";

export type ParsedArgs = {
  kind: "ok";
  path: string;
  json: boolean;
  verify: boolean;
  xlsx: string | null;
  report: { path: string; format: ReportFormat } | null;
};

export type UsageError = { kind: "usage"; message: string };

export const USAGE = "usage: bun run lazarus <path> [--json] [--verify] [--xlsx <out.xlsx>] [--report <out.json|out.html>]";

const usage = (message: string): UsageError => ({ kind: "usage", message });

export function parseArgs(argv: readonly string[]): ParsedArgs | UsageError {
  const paths: string[] = [];
  let json = false;
  let verify = false;
  let xlsx: string | null = null;
  let report: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (arg === "--json") json = true;
    else if (arg === "--verify") verify = true;
    else if (arg === "--xlsx" || arg === "--report") {
      const value = argv[i + 1];
      if (value === undefined || value.startsWith("--")) return usage(`${arg} needs a value`);
      if ((arg === "--xlsx" ? xlsx : report) !== null) return usage(`${arg} may be given once`);
      if (arg === "--xlsx") xlsx = value;
      else report = value;
      i++;
    } else if (arg.startsWith("--")) return usage(`unknown option ${arg}`);
    else paths.push(arg);
  }

  if (paths.length === 0) return usage("a path is required");
  if (paths.length > 1) return usage("give exactly one path");
  if (xlsx !== null && !/\.xlsx$/i.test(xlsx)) return usage(`--xlsx must end in .xlsx: ${xlsx}`);
  let reportOut: ParsedArgs["report"] = null;
  if (report !== null) {
    const ext = /\.(json|html)$/i.exec(report);
    if (!ext) return usage(`--report must end in .json or .html: ${report}`);
    reportOut = { path: report, format: ext[1]!.toLowerCase() as ReportFormat };
  }
  return { kind: "ok", path: paths[0]!, json, verify, xlsx, report: reportOut };
}
