// Excel worksheet names: at most 31 characters, none of : \ / ? * [ ], not blank, no apostrophe
// at either end, unique without regard to case. `taken` holds the lowercased names already used.
const FORBIDDEN = /[:\\/?*[\]]/g;
const MAX = 31;

export function excelSheetName(name: string, taken: Set<string>): { name: string; changed: boolean } {
  let base = name.replace(FORBIDDEN, "_").replace(/^'+|'+$/g, "").slice(0, MAX);
  if (base.trim() === "") base = "Sheet";
  let out = base;
  for (let n = 2; taken.has(out.toLowerCase()); n++) {
    const suffix = ` (${n})`;
    out = base.slice(0, MAX - suffix.length) + suffix;
  }
  taken.add(out.toLowerCase());
  return { name: out, changed: out !== name };
}
