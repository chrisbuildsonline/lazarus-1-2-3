# Demo script (under 3 minutes)

Every scene below is something the app does today on the files in `fixtures/`. Scenes 1 to 7 are run in that order by `e2e/demo-script.spec.ts`, which reads its expected numbers from `tests/differential/verify/golden.json`, `fixtures/manifest.json` and the verification engine run on the fixture itself. If the app and this script drift apart, that test fails.

Run the app with `bun run build && bun run preview`, or in Docker with `docker build -t lazarus . && docker run --rm -p 4173:4173 lazarus`, and open http://localhost:4173.

**0:00-0:12. Scene 1: the Summon view.** The page says "Raise a Lotus 1-2-3 file". Nothing is uploaded: the file is read in the browser.
> Lotus 1-2-3 files still sit in archives, estates and old file servers. Modern tools either won't open them or convert them without telling you whether the numbers survived.

**0:12-0:37. Scene 2: the sample.** Press "Summon the sample". `KSBASE.WK1`, a real WK1 file from the openpreserve format corpus (CC0), is raised in a Web Worker. The Sheet view shows 100.0% verified: 160 matched, 0 mismatched, 0 unverifiable, with the proof bar.
> Lazarus 1-2-3 reads the binary records, rebuilds each of the 160 formulas, recalculates the sheet with its own engine, and compares every result with the number the file stored. All 160 match.

**0:37-0:57. Scene 3: one formula cell.** Click O3. The cell drawer shows the Lotus formula next to the Excel formula, and the value the file remembers next to the value we raised. Both are `0.25153768659966846`, and the cell is Matched.
> No model guesses anything here. The formula comes from the bytes, and the number comes from deterministic code.

**0:57-1:20. Scene 4: the cell we can't prove.** Reload, then drop `fixtures/libreoffice-wks-functions/gnome647171-1.wks`, a real WKS file. It shows 3 matched, 0 mismatched, 1 unverifiable. Filter by Unverifiable and click A5: an `IF` formula that returns text ("Odd" or "Even"). The drawer gives the reason: the file keeps a text result in a record the parser does not read yet, so the cell can't be compared.
> We don't paint this cell green. It is marked unverifiable, with the reason, in the app and in the report.

**1:20-1:45. Scene 5: the cell that disagrees.** Reload and press "Open a real mismatch", the chip under the sample pill. `fixtures/noaa-ala-wai-m21/m21tab.wk3`, a real Lotus 1-2-3 Release 3 worksheet of a sediment core from the Ala Wai Canal (NOAA, 1991, public domain), opens filtered to Mismatched: 7 matched, 1 mismatched. V44 is red in the grid, and its drawer is already open beside it. Remembered: `0.012281069011234387`. Raised: `ERR`. Under "Why": recalculated now, the formula `L44/C44` gives ERR because the file no longer holds C44; the input chip C44 reads "empty".
> On the eight real files in our corpus, 855 of 857 formulas match, one is unverifiable, and this one disagrees. We show it in red with its cause. The file stored this result when C44 still held a number, about 14.33. Someone cleared C44 later and never recalculated, so 1-2-3 itself would give ERR today. That is a finding about the file, not an error we hide.

**1:45-2:15. Scene 6: macros.** Reload, then drop `fixtures/macros/macros.wk1` (synthetic). The Macros tab shows 4 items waiting: two named macros, one unnamed block and one formula opcode the engine does not know. The first macro reads as steps, starting with "Go to A1", next to a hand-written explanation labelled "recorded fixture" (a local model on Ollama can stand in for it). Press Approve: "3 waiting · 1 approved". Back on the Sheet tab nothing has changed: A10 is still unverifiable and the totals are the same.
> Macros are never run. They become plain steps a person approves or rejects, and that decision goes into the report. Approving changes no cell and no number.

**2:15-2:32. Scene 7: downloads.** Press "Download XLSX" and "Download report (HTML)". The workbook keeps every formula with the value the file remembered. The report lists what was proven and what was not, with the file's SHA-256.
> You leave with a modern workbook and a record of what was proven.

**2:32-2:55. Kiro (outside the app).** The `.kiro` folder: 10 specs with all 254 tasks ticked, six steering files (including `ai-boundaries.md`: the model never touches a number), four hooks that run the differential, manifest, opcode and personal-data checks, and the lotus-oracle MCP server that verifies a file for Kiro. End card.
> Specs defined the formats, hooks re-ran the proofs on every change, and steering kept the model away from the arithmetic. Lazarus 1-2-3: dead files, living proof.
