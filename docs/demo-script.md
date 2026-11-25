# Demo script (under 3 minutes)

Every scene below is something the app does today on the files in `fixtures/`. Scenes 1 to 6 are run in that order by `e2e/demo-script.spec.ts`, which reads its expected numbers from `tests/differential/verify/golden.json` and `fixtures/manifest.json`. If the app and this script drift apart, that test fails.

Run the app with `bun run build && bun run preview`, or in Docker with `docker build -t lazarus . && docker run --rm -p 4173:4173 lazarus`, and open http://localhost:4173.

**0:00-0:15. Scene 1: the Summon view.** The page says "Raise a Lotus 1-2-3 file". Nothing is uploaded: the file is read in the browser.
> Lotus 1-2-3 files still sit in archives, estates and old file servers. Modern tools either won't open them or convert them without telling you whether the numbers survived.

**0:15-0:45. Scene 2: the sample.** Press "Summon the sample". `KSBASE.WK1`, a real WK1 file from the openpreserve format corpus (CC0), is raised in a Web Worker. The Sheet view shows 100.0% verified: 160 matched, 0 mismatched, 0 unverifiable, with the proof bar.
> Lazarus 1-2-3 reads the binary records, rebuilds each of the 160 formulas, recalculates the sheet with its own engine, and compares every result with the number the file stored. All 160 match.

**0:45-1:10. Scene 3: one formula cell.** Click O3. The cell drawer shows the Lotus formula next to the Excel formula, and the value the file remembers next to the value we raised. Both are `0.25153768659966846`, and the cell is Matched.
> No model guesses anything here. The formula comes from the bytes, and the number comes from deterministic code.

**1:10-1:40. Scene 4: the cell we can't prove.** Reload, then drop `fixtures/libreoffice-wks-functions/gnome647171-1.wks`, a real WKS file. It shows 3 matched, 0 mismatched, 1 unverifiable. Filter by Unverifiable and click A5: an `IF` formula that returns text ("Odd" or "Even"). The drawer gives the reason: the file keeps a text result in a record the parser does not read yet, so the cell can't be compared.
> We don't paint this cell green. It is marked unverifiable, with the reason, in the app and in the report. If a recalculated number ever disagreed with the stored one, the cell would be marked mismatched in the same way. On the six real files in our corpus, none does: 173 of 174 formulas match exactly and one is unverifiable.

**1:40-2:15. Scene 5: macros.** Reload, then drop `fixtures/macros/macros.wk1` (synthetic). The Macros tab shows 4 items waiting: two named macros, one unnamed block and one formula opcode the engine does not know. The first macro reads as steps, starting with "Go to A1", next to a hand-written explanation labelled "recorded fixture" (a local model on Ollama can stand in for it). Press Approve: "3 waiting · 1 approved". Back on the Sheet tab nothing has changed: A10 is still unverifiable and the totals are the same.
> Macros are never run. They become plain steps a person approves or rejects, and that decision goes into the report. Approving changes no cell and no number.

**2:15-2:35. Scene 6: downloads.** Press "Download XLSX" and "Download report (HTML)". The workbook keeps every formula with the value the file remembered. The report lists what was proven and what was not, with the file's SHA-256.
> You leave with a modern workbook and a record of what was proven.

**2:35-2:55. Kiro (outside the app).** The `.kiro` folder: 10 specs with all 254 tasks ticked, six steering files (including `ai-boundaries.md`: the model never touches a number), four hooks that run the differential, manifest, opcode and personal-data checks, and the lotus-oracle MCP server that verifies a file for Kiro. End card.
> Specs defined the formats, hooks re-ran the proofs on every change, and steering kept the model away from the arithmetic. Lazarus 1-2-3: dead files, living proof.
