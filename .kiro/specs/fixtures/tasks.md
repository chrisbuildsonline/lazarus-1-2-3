# Tasks: fixtures and integration point

Red first: write each test before the code that makes it pass. Run `bun run test` and `bun run typecheck` after each task. No network at test time.

## PII scanner

- [x] 1. Red: `tests/unit/fixtures/pii.test.ts` with scanner samples. Positives: an email, `(555) 123-4567`, `555-123-4567`, `123-45-6789`, `4111 1111 1111 1111`. Negatives: `1234567890123` (fails Luhn), a version string `1.2.3`, a date `2026-11-14`, a plain 6-digit number. (Req 19, 20)
- [x] 2. Green: `tests/unit/helpers/pii-scan.ts` (`scanBytes(bytes) -> {kind, text}[]`, Luhn check, allowlist type). (Req 19, 21)

## WK1 writer and manifest guard

- [x] 3. Red: `tests/unit/helpers/wk1-scan.ts` is a test helper, so first write `tests/unit/fixtures/wk1-scan.test.ts` with a hand-written byte array (BOF, one INTEGER, one NUMBER, one LABEL, one FORMULA, EOF) and expected counts. Then write the helper (record walker returning counts and cells, bounds-checked, no throw on truncation). (Req 17)
- [x] 4. Red: `tests/unit/fixtures/manifest.test.ts` against an empty manifest `{ "version": 1, "fixtures": [] }`. It fails on the minimum count, origin mix, license and unlisted-file checks. Then add the checks listed in design.md (exists, sha256, LICENSE.txt keys, unlisted files, counts, expected values). (Req 10, 15, 16, 17)
- [x] 5. Red: `tests/unit/fixtures/gen-fixtures.test.ts` for the writer: BOF/EOF framing, DIMENSIONS, INTEGER, NUMBER, LABEL with `'`, `"`, `^`, FORMULA with cached double, little-endian layout, and `buildAll()` deterministic across two calls. Green: `scripts/lib/wk1-writer.ts`. (Req 5, 6, 7, 18)

## Synthetic corpus

- [x] 6. Write `scripts/lib/fixture-specs.ts` for `basic-values` and `labels`, plus `scripts/gen-fixtures.ts` that writes files, `LICENSE.txt` and the manifest entries (merge, sorted). Run `bun scripts/gen-fixtures.ts`. Manifest and PII tests now cover 2 synthetic files. (Req 5, 9, 12, 13)
- [x] 7. Add `formulas` to the specs. Use only RPN opcodes confirmed by a source note in a code comment. Regenerate. (Req 6, 8, 11)
- [x] 8. Add `dates` (serials 1, 59, 60, 61, a leap day, plus a FORMULA with a date cached value) and `mixed`. Regenerate. Confirm a second run leaves `git status` unchanged. (Req 5, 8, 18)

## Real corpus (human review)

- [x] 9. Find candidate real WK1/WKS/DBF files in public archives. For each, record the URL and the exact license wording found. Drop any file without a clear redistribution grant. Check for personal data by eye as well as by scan. Stop and ask if fewer than 1 qualifies. (Req 2, 4)
- [x] 10. Commit each accepted file in `fixtures/<name>/` with `LICENSE.txt` (source URL, author, license, `Redistribution: allowed`). Compute sha256, counts and 1 to 3 cached values from the file bytes (helper run locally, not committed unless small) and add the manifest entries. Run the full suite: the PII test decides on the real bytes, and any hit is either removed or allowlisted with a reason. (Req 1, 2, 3, 10, 11, 14, 21)
- [ ] 11. Use the real WK1/WKS file to confirm the BOF version to format mapping. If lotus-format.md has it reversed, correct the note and record the evidence in the PR description or commit message. (Design: Synthetic WK1 files, notes)

## CLI

- [x] 12. Red: `tests/unit/cli/lazarus.test.ts` for `detectFormat` using bytes from the generator and a hand-built minimal DBF header: wk1, wks, dbf, unknown, empty file, and extension mismatch with `note`. Green: `src/cli/inventory.ts` (`detectFormat`). (Req 25, 26)
- [ ] 13. Red: tests for `walk` and `inventoryFile` in a temp folder (nested dirs, sorted order, size, sha256 matches `node:crypto`), and `formatLine`. Green: implement them. (Req 22, 23)
- [ ] 14. Red: tests that spawn `bun src/cli/lazarus.ts` on a temp folder: text output lines, `--json` stdout parses as the array with exactly the 4 keys, stderr carries the inventory-only notice, missing path exits 2, no argument exits 2 with usage, an `unknown` file still exits 0. Green: `src/cli/lazarus.ts` and the `lazarus` script in `package.json`. (Req 22 to 29)
- [ ] 15. Run `bun run lazarus fixtures` and `--json` on the real corpus. Check every manifest sha256 appears with the matching format. Add a test for this cross-check (CLI output versus manifest). (Acceptance)
- [ ] 16. Add the `src/cli` line to structure.md and a `lazarus` line to the README script list and tech.md command list. (Design: Layout)

## Gate

- [ ] 17. Run `bun run typecheck` and `bun run test`, both exit 0. Run `bun scripts/gen-fixtures.ts` once more and check `git status` shows no change to fixtures. (Acceptance)
