# Requirements: fixtures and integration point

Goal: a small, licensed, PII-free corpus of Lotus and dBase files with a machine-readable manifest, tests that guard it, and a `lazarus` CLI that inventories files. Later features (parser, formula, verify) run against this corpus and this CLI.

## EARS requirements

### Corpus

1. The repository SHALL contain at least 5 fixture files under `fixtures/`, at least 1 real and at least 1 synthetic.
2. Each real fixture SHALL be a WK1, WKS or DBF file from a public archive whose license allows redistribution.
3. Each fixture SHALL sit in its own directory `fixtures/<name>/` with a `LICENSE.txt` stating source URL, author (or "unknown"), license name, and whether redistribution is allowed.
4. IF a real file has no license that allows redistribution, THEN the project SHALL NOT commit it.
5. WHEN `bun scripts/gen-fixtures.ts` is run, the generator SHALL write the synthetic WK1 files without network access, clocks or randomness, so that two runs produce byte-identical output.
6. The generator SHALL build files from these WK1 records: BOF, EOF, DIMENSIONS, INTEGER, NUMBER, LABEL, FORMULA.
7. The synthetic set SHALL include LABEL cells for each of the three prefixes `'`, `"` and `^`.
8. The synthetic set SHALL include FORMULA records with cached values and at least one file with date serial cells, including serial 60.
9. Each synthetic fixture directory SHALL carry a `LICENSE.txt` naming the generator as source and a license that allows redistribution.

### Manifest

10. The file `fixtures/manifest.json` SHALL list every fixture file with: `path`, `format` (`wk1`, `wks` or `dbf`), `origin` (`real` or `synthetic`), `sourceUrl`, `license`, `sha256`, and `counts` (`cells`, `formulas`, `labels`, `numbers`).
11. Each manifest entry SHALL list `expectedValues` for at least 1 selected cell, giving the address and the cached value as stored in the file.
12. WHEN the generator runs, it SHALL write the synthetic entries of `manifest.json` itself, so counts and cached values come from the same spec as the bytes.
13. For a synthetic entry, `sourceUrl` SHALL be `null`.
14. IF a count or cached value in the manifest for a real file was not derived from the file bytes, THEN it SHALL NOT be committed.

### Tests (Vitest, under `tests/unit`, no network)

15. WHEN `bun run test` is run, the manifest test SHALL fail IF any listed file is missing, IF its sha256 differs from the manifest, IF its directory has no `LICENSE.txt`, IF the manifest lists fewer than 5 fixtures, or IF it has no real entry or no synthetic entry.
16. The manifest test SHALL fail IF any file under `fixtures/` with extension `.wk1`, `.wks` or `.dbf` is not listed in the manifest.
17. The manifest test SHALL fail IF a WK1/WKS file's record counts differ from the manifest `counts`, using a record walker inside the test helpers that does not import `src/parser`.
18. The generator test SHALL fail IF running the generator twice, or running it against the committed files, produces different bytes.
19. WHEN the PII scan test runs, it SHALL scan the bytes of every fixture file and fail IF it finds an email address, a phone number, an SSN-like number (`ddd-dd-dddd`) or a card-like number (13 to 19 digits that pass the Luhn check).
20. The PII scanner SHALL be tested against known positive and known negative sample strings, so the scan itself cannot silently match nothing.
21. IF a match is a reviewed false positive, THEN it SHALL be listed in an allowlist with the file path, the matched text and a reason.

### CLI

22. WHEN `bun run lazarus <path>` is run with a file path, the CLI SHALL print one line with path, format, size in bytes and sha256.
23. WHEN `bun run lazarus <path>` is run with a folder path, the CLI SHALL walk it recursively in sorted order and print one such line per file.
24. WHEN `--json` is given, the CLI SHALL print one JSON array of objects `{ path, format, size, sha256 }` and nothing else on stdout.
25. The CLI SHALL detect the format from the extension and the first bytes (BOF record for WK1/WKS, version byte for DBF), and SHALL report `unknown` for a file that matches neither.
26. IF the extension and the bytes disagree, THEN the CLI SHALL report the format from the bytes and add a `note` field (text mode: a trailing `(extension says X)`).
27. WHEN the CLI starts, it SHALL print to stderr that it only inventories files and does not parse them yet.
28. IF the path does not exist, THEN the CLI SHALL print an error to stderr and exit 2. IF no path is given, THEN it SHALL print usage to stderr and exit 2. Otherwise it SHALL exit 0, including when some files are `unknown`.
29. The CLI SHALL NOT make network calls, SHALL NOT write files, and SHALL NOT import React or the DOM.

## Acceptance

`bun run typecheck` and `bun run test` exit 0. `bun run lazarus fixtures` lists every corpus file with its format and sha256, and `bun run lazarus fixtures --json | bun -e 'JSON.parse(await Bun.stdin.text())'` exits 0.

## Out of scope

Parsing cells into the model, formula decoding, WK3, charts, any network fetch at test time (real files are downloaded once by a human and committed), a fixture-download script, CI configuration.
