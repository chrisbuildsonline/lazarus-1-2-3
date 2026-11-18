---
inclusion: always
---

# Product: Lazarus 1-2-3

Kiroween 2026 entry, Resurrection category. Submissions close 2026-12-04.

Lazarus 1-2-3 raises dead Lotus 1-2-3 worksheets (WKS, WK1, WK3) and dBase tables (DBF). It parses the binary records in the browser, rebuilds every formula as a modern Excel formula, and writes a clean XLSX. It then recalculates the sheet with a small deterministic engine and compares each formula result with the value cached in the original file.

## Users

Estate executors, archivists, paralegals and lab staff who hold old files and need to know whether the numbers can be trusted. They are not spreadsheet engineers. Write UI text for them.

## The proof-first promise

Every formula cell ends in exactly one state:

- **matched**: our recalculated value equals the cached value (within the documented tolerance).
- **mismatched**: both values exist and differ. Show both, the formula, and the inputs.
- **unverifiable**: we cannot prove it (unknown opcode, unsupported @function, volatile function such as @NOW or @RAND, missing cache, external reference).

Rules that follow from this:

- Never present a conversion as "correct" without per-cell evidence. Report counts for all three states.
- Never silently drop, guess or coerce a cell. Unknown things become `unverifiable` with a reason.
- The cached value from the original file is the oracle. We do not edit it to make cells match.
- The provenance report lists what was proven, what was not, and why. It ships with the XLSX.

## In scope

- WKS/WK1 and WK3 parsing and DBF tables. DBF values are shown and written as read (a table has no formulas). WK3 formulas keep their stored result and are unverifiable until a WK3 formula decoder exists.
- Formula rebuild (RPN to Excel syntax) and a deterministic recalculation engine.
- XLSX output, provenance report (in-app and downloadable).
- Macros (brace keystroke language, slash commands) translated into a plain-English step list that a human approves. Macros are never executed.
- Local-only operation: files never leave the machine.
- lotus-oracle MCP server for developer tooling.

## Out of scope

- Editing spreadsheets, or running macros.
- Charts, graphs, print settings, and WK3 3D sheets until the WK1 path is proven.
- Accounts, servers, uploads, telemetry, paid APIs.
- Claiming equivalence for volatile or unknown functions.

## Fixtures

Use only files we may redistribute. Each fixture directory carries a LICENSE note (see structure.md).
