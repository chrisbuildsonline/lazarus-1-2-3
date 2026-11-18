# Lotus 1-2-3 Release 3 (.wk3) search report

Goal: find freely redistributable `.wk3` files with BOF version `0x1000` (first 6 bytes `00 00 1a 00 00 10`). Max 3 downloads, each under 2 MB. All artifacts saved in this directory.

## Downloaded files (3)

| Exact filename | Size | First 6 bytes (hex) | Source URL | License |
|---|---|---|---|---|
| `PEYTREND.WK3` | 18635 | `00 00 1a 00 00 10` | https://raw.githubusercontent.com/openpreserve/format-corpus/master/office/spreadsheet/wk3/PEYTREND.WK3 | **CC0 1.0** (folder `readme.md`: “Creative Commons CC0: Public Domain Dedication… Johan van der Knijff has waived all copyright…”). Repo README: “All items are CC0 licenced unless otherwise stated.” |
| `fas03crt.wk3` | 102671 | `00 00 1a 00 00 10` | https://www2.census.gov/govs/fas/fas03crt.wk3 | **U.S. Government work / not copyrightable under 17 U.S.C. § 105** (Census Bureau official statistical product on census.gov). See `us-copyright-section-105-excerpt.txt`, `usa-gov-copyright-excerpt.txt`. |
| `g8btab.wk3` | 52938 | `00 00 1a 00 00 10` | https://www.ngdc.noaa.gov/mgg/geology/data/g02887/g8btab.wk3 | **U.S. Government work / 17 U.S.C. § 105** (NOAA NGDC geology dataset). |

`file(1)` reports each as “Lotus 1-2-3 WorKsheet, version 3”.

SHA-256:

- `PEYTREND.WK3` — `9741c1393cf98ff660d7faf50f12143608c5a5d662280163bdd1d82c03b7c6a0`
- `fas03crt.wk3` — `d25dc29d77f4c1f2ea5fc7f4d1996c931f3887a6e46fc9e730c505b33f9d7f07`
- `g8btab.wk3` — `7b491d95f8d37ad6ae65e2181db343eaf694e95feaf1b228403b8f0efd5c3923`

## Places searched

### 1. openpreserve/format-corpus — **HIT (downloaded)**

- URL: https://github.com/openpreserve/format-corpus/tree/master/office/spreadsheet/wk3
- Found: `PEYTREND.WK3` + `readme.md` (CC0).
- Saved locally: `format-corpus-wk3-readme.md`, `format-corpus-README.md`, `format-corpus-wk3-license.md`, `format-corpus-repo-license.md`, `format-corpus-wk3-github.html`, `cc0-1.0-legalcode.txt`.

### 2. LibreOffice core `sc/qa/unit/data` — **negative for .wk3**

- Listed via GitHub API: https://api.github.com/repos/LibreOffice/core/contents/sc/qa/unit/data
- Present dirs include `123`, `wks`, `qpro`, `xls`, etc. **No `wk3` directory.**
- `sc/qa/unit/data/123/`: only `.123` files (`ofz9704.123`, `tdf148749.123`, `universal-content.123`).
- `sc/qa/unit/data/wks/{pass,fail,indeterminate}/`: only `.wks` fuzz/test files (e.g. `gnome647171-1.wks`). **No `.wk3`.**
- Saved: `libreoffice-sc-qa-data-api.json`, `libreoffice-123-api.json`, `libreoffice-wks-api.json`, `libreoffice-wk3-search.html`.

### 3. Gnumeric (gitlab.gnome.org) `samples/` / `test/` — **negative for .wk3**

- API listing of `samples` (recursive): extensions seen include `.gnumeric`, `.xls`, `.xlsx`, `.png`, `.as`, `.oleo`, `.dif` — **no `.wk3`.**
- Docs list Lotus import as `.wk1` / `.wks` only: https://gnome.pages.gitlab.gnome.org/gnumeric/manual/sect-file-formats.html
- License of project is GPLv3, but no wk3 sample was present to take.
- Saved: `gnumeric-samples-api.json`.

### 4. SheetJS `test_files` — **not obtainable**

- https://github.com/SheetJS/test_files — GitHub API: repository access blocked (`private_information`).
- https://oss.sheetjs.com/test_files/ — listing saved; no usable `.wk3` link extracted in this pass.
- Docs mention generated `write_L3.wk3` in tests; raw URLs 404 / unavailable without the blocked repo.
- Saved: `sheetjs-test-files.html`, `sheetjs-gitea.html`.

### 5. Apache Tika test-documents — **HIT (not downloaded; identical to PEYTREND)**

- Path (tag 2.9.2): `tika-parsers/tika-parsers-standard/tika-parsers-standard-package/src/test/resources/test-documents/testLotus123.wk3`
- URL: https://raw.githubusercontent.com/apache/tika/2.9.2/tika-parsers/tika-parsers-standard/tika-parsers-standard-package/src/test/resources/test-documents/testLotus123.wk3
- Header `00 00 1a 00 00 10`; size 18635; **SHA-256 identical to `PEYTREND.WK3`.**
- Project license: Apache License 2.0 (`tika-LICENSE.txt`). PR #209 notes the `.wk3` as from a personal collection; byte-identical CC0 corpus copy preferred for clarity.
- Saved: `tika-LICENSE.txt`, `apache-license-2.0.txt`, `tika-pr-209.html`.

### 6. Apache POI `test-data` — **negative for .wk3**

- `test-data/spreadsheet` listed (835 entries): no Lotus `.wk3` samples (only unrelated names containing `123` / fuzz xlsx).
- Saved: `poi-spreadsheet-api.json`, `poi-wk3-search.html`.

### 7. U.S. government (.gov) — **HIT (downloaded)**

- **Census Bureau FAS:** https://www2.census.gov/govs/fas/
  - `fas03crt.wk3` (downloaded), `fas04crt.wk3` (verified present; **byte-identical** to `fas03crt.wk3`, SHA-256 same; not kept as a second of the 3-file budget).
- **NOAA NGDC:** https://www.ngdc.noaa.gov/mgg/geology/data/g02887/
  - `g8btab.wk3` (downloaded); also listed: `g8tab.wk3`, `m21tab.wk3`, `m3.wk3` (not downloaded).
- License basis saved: `us-copyright-section-105-excerpt.txt`, `copyright-title17-chap1.html`, `usa-gov-copyright.html`, `usa-gov-copyright-excerpt.txt`, `census-fas-index.html`, `census-fas-index.txt`, `noaa-g02887-index.html`.

### 8. archive.org — **no clear freely licensed standalone .wk3**

- Advanced search JSON for “lotus wk3”: 3 hits — Lotus Smart Suite installers / a GitHub mirror (`123elf`), not clearly licensed redistributable lone `.wk3` worksheets.
- Saved: `archive-org-wk3-search.json`.

### 9. Other incidental mentions

- https://sembiance.com/fileFormatSamples/document/lotus123/ lists `PEYTREND.WK3` / `example.wk3` but **no clear license** stated on the index → not used as the redistribution basis (format-corpus CC0 copy preferred).

## Local artifacts (this directory)

**Worksheets:** `PEYTREND.WK3`, `fas03crt.wk3`, `g8btab.wk3`

**License / page copies:** format-corpus readmes, `cc0-1.0-legalcode.txt`, Census/NOAA/USA.gov/copyright.gov captures, Tika/Apache license texts, API JSON listings, search HTML dumps, this report.
