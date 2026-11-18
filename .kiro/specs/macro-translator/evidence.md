# Evidence: macro translator (task 1)

Written 2026-11-18. No production code. Status words: **two sources**, **one source**, **not found**.

## Read this first

- `web_search` and `web_fetch` worked, but `web_fetch` returns only the first 8,000 characters of a page and ignores `search_terms` on archive.org full-text files. I could read the front matter and tables of contents of the Lotus 1-2-3 Release 3.1 Reference and Quick Reference, plus about 8,000 characters of the Quick Reference body. I could not reach their macro and menu-tree pages.
- The Release 2 / 2.01 / 2.2 manuals are not readable online: archive.org item `lotus123release200lotu` (Release 2.2 Reference) is "Access-restricted-item: true". No bitsavers scan of a Release 2 manual turned up. **No Release 2 manual page was read.**
- Every online source below is Release 3.1 (1990), Release 4 for Windows (1994, IBM mirror) or the 123elf Unix port wiki. They are later releases. A fact from them is not a Release 2 fact. Each row names the release.
- The shell tool was refused in this session (non-interactive approval), so **the byte check of NAME records in the real fixtures (task 1a) was not done**. It stays open.
- Consequence for the spec (task 1 rule: "the tests and labels shrink to what was sourced"): see "What the later tasks may use" at the end.

Sources used (S-codes):

| Code | Source | URL |
|---|---|---|
| L | Local: Lotus file format note, NAME record, lines 301-350 | `design/refs/lotus/WSFF2-mettalogic.TXT` |
| LO | LibreOffice `OP_NamedRange`, `sc/source/filter/lotus/op.cxx` (line number not obtained) | https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/op.cxx |
| Q31 | Lotus 1-2-3 Release 3.1 Quick Reference (1990), archive.org full text | https://archive.org/stream/lotus-1-2-3-release-3.1-reference/Lotus%201-2-3%20Release%203.1%20-%20Quick%20Reference_djvu.txt |
| R31 | Lotus 1-2-3 Release 3.1 Reference (1990), contents pages only | https://archive.org/stream/lotus-1-2-3-release-3.1-reference/Lotus%201-2-3%20Release%203.1%20-%20Reference_djvu.txt |
| R4 | IBM mirror of 123 Release 4 for Windows docs: 10935 (Creating macro commands), 10939 (Running a macro), 10518 (macro command list) | https://public.dhe.ibm.com/software/lotus/desktop/LotusDoc/10935.txt (also 10939.txt, 10518.txt) |
| FAQ | 123elf (Unix port of 1-2-3 Release 3.4a) wiki FAQ | https://github.com/taviso/123elf/wiki/FAQ |
| MX | MrExcel thread, search snippet only | https://www.mrexcel.com/board/threads/lotus-1-2-3-macro.996/ |

## (a) NAME record, opcode 0x0B

| Fact | Source | Status |
|---|---|---|
| Opcode 11 (0x0B), body 24 bytes | L ("11 (OBh) 24 bytes") | one source |
| Bytes 0-15: NUL-terminated ASCII name, unused bytes zero | L | one source (LO reads 16 bytes and forces byte 16 to NUL, so it agrees on the 16-byte field) |
| Bytes 16-17 start column, 18-19 start row, 20-21 end column, 22-23 end row, u16 little-endian | L; LO `OP_NamedRange` reads `nColSt, nRowSt, nColEnd, nRowEnd` in that order after 16 name bytes | **two sources** |
| One record per range name | L | one source |
| Example REVENUES = A1..B4 as `00 00 00 00 01 00 03 00` | L | one source |
| LO: a name starting with a digit gets an "A" prepended | LO | one source, a reader rule, not a format rule |
| Symphony has a different record (extra type byte after the four u16) | LO `OP_SymphNamedRange` | one source |
| Opcode 0x0B is the one `OP_NamedRange` is bound to | LO dispatch table not read | not found |
| Gnumeric `plugins/lotus-123` NAME handling | `lotus.c` fetched but cut at 8,000 characters; its header cites the same mettalogic page, so it would not be independent | not found |
| Layout matches NAME records in the real fixtures | shell unavailable | **not checked** |

## (b) Macro names and where a macro ends

| Fact | Source | Status |
|---|---|---|
| A macro name is a backslash plus one letter (example `\a`; run with Ctrl plus the letter) | R4 10939 "To run a backslash macro" (Release 4) | one source |
| Sample macros are named `\G`, `\S`, `\D`, `\R`, `\C`, `\M`; the chapter has "Naming a Macro", p. 4-8 | R31 contents (Release 3.1) | one source (the same convention as R4, so the two agree) |
| Release 2 / 2.01 / 2.2 wording | no readable Release 2 manual | not found |
| `\0` is the autoexecute macro | no readable page. FAQ links an "AutoExec macros" page (not read) | not found |
| A macro reads down the column and stops at a blank or non-label cell | R4 10935 says only that macro commands have a keyword and arguments | not found |
| FAQ: in 123elf a macro named `\1` is the "Signal Macro" (runs on SIGUSR2) | FAQ | one source, Unix port only, not a Release 2 rule |

## (c) Release 2 menu tree

Release 3.1 Reference contents (R31) list the command groups below. They show the names exist in 3.1. They say nothing about prompts or whether the menu stays open, and 3.1 is not Release 2.

| Item | Evidence | Status |
|---|---|---|
| Root menus: Worksheet, Range, Copy, Move, File, Print, Graph, Data, System, Quit | Q31 menu-tree list names Data, File, Graph, Print, Range, Worksheet trees; R31 contents have /Copy, /Move, /Quit, /System headings. Letters W R C M F P G D S Q not read | one source (3.1), keys not found |
| /W Worksheet: Global (Format, Label-Prefix, Column-Width, Recalculation, Protection, Default, Zero), Insert (Column, Row), Erase (No, Yes) | R31 contents list "Worksheet Commands" only (sub-entries cut off). FAQ names `/Worksheet Column Set-Width` | not found (Release 3.x spells Set-Width) |
| /R Range: Format, Label, Erase, Name, Justify, Protect, Unprotect, Input, Value, Transpose, Search | R31 contents: Erase, Format, Input, Justify, Label, Name, Prot, Search, Trans, Unprot, Value | one source (3.1): all eleven present |
| /RN Name: Create, Delete, Labels, Reset, Table | FAQ names `/Range Name Create` | one source for Create; the rest not found |
| /F File: Retrieve, Save, Combine, Xtract, Erase, List, Import, Directory | R31 contents: Admin, Combine, Dir, Era... (cut off). FAQ names `/File Combine`, `/File Import Numbers` | one source for Combine and Import; the rest not found |
| /P Print: Printer, File; /PP: Range, Line, Page, Options, Clear, Align, Go, Quit | R31 contents have "Print Commands" only | not found |
| /D Data: Fill, Table, Sort, Query, Distribution, Matrix, Regression, Parse | R31 contents: Distribution, External, Fill, Matrix, Parse, Query, Regression, Sort, Table (3.1 adds External) | one source (3.1): all eight present. FAQ also names `/Data Parse Format Create` |
| Each leaf: prompts for a tilde-ended argument? How many? | Menu trees at Q31 pp. 35-40 not reachable | not found |
| Each leaf: menu stays open afterwards? | not reachable | not found |
| `/X` commands exist as old-style forms of macro commands: `/XC` {subroutine}, `/XG` {BRANCH}, `/XI` {IF}, `/XL` {GETLABEL}, `/XM` {MENUBRANCH}, `/XN` {GETNUMBER}, `/XQ` {QUIT}, `/XR` {RETURN} | Q31 "The /X Commands" table, p. 19 (the OCR shows `/X\` for the IF row and `/XI` is my reading of it) | one source |

## (d) Brace keys and macro commands

Q31 p. 1-2 gives the function keys: ABS (F4), CALC (F9), EDIT (F2), GOTO (F5), GRAPH (F10), NAME (F3), QUERY (F7), TABLE (F8), WINDOW (F6). That sources the key, not the brace spelling. Q31 section "Macro Names for Special Keys" (p. 15) was not reached.

| Item | Source | Status |
|---|---|---|
| {GOTO} then a cell and `~`, as in `{GOTO}A:A1~` | FAQ (3.4a port) | one source |
| {BRANCH location} redirects the macro to a cell | R4 10935 (`{BRANCH A21}`); Q31 p. 19 `/XG` row | **two sources** (Release 4, 3.1) |
| {MENUBRANCH location} shows a macro menu stored at location | Q31 p. 19 `/XM` row; R4 10518 | **two sources** |
| {QUIT} ends the macro | Q31 p. 19 `/XQ` row | one source |
| {RETURN} returns from a subroutine, or ends one {FOR} iteration | Q31 pp. 18-19 | one source |
| {IF condition} runs the rest of the cell only if true | Q31 p. 19 `/XI` row; R4 10935 mentions {IF} | **two sources** (meaning from Q31 only) |
| {GETLABEL prompt,location}, {GETNUMBER prompt,location} | Q31 p. 19 (`/XL`, `/XN` rows). R4 spells them {GET-LABEL}, {GET-NUMBER} (10518) | one source for the names used here; R4 spelling differs |
| {WAIT time-number} suspends the macro until the time | Q31 p. 18; R4 10518 | **two sources** |
| {BEEP} sounds the bell | R4 10518 | one source |
| {FOR} exists (subroutine called by {FOR}) | Q31 p. 18; arguments not read | one source, name only |
| {WINDOWSOFF}, {WINDOWSON} (not in the requested list) | Q31 p. 18 | one source |
| {CE}, {R}, {L} as short key names | FAQ (`{CE}`); MX snippet (`{R}`, `{L}`) | one source each, 3.4a port and a forum post |
| {DOWN} {UP} {LEFT} {RIGHT} {HOME} {END} {PGUP} {PGDN} {ESC} {BS} {DEL} {EDIT} {CALC} {NAME} {ABS} {WINDOW} {QUERY} {TABLE} {GRAPH} {?} | key exists in Q31 p. 1-4 for HOME, END, PGUP, PGDN, ESC, EDIT, CALC, NAME, ABS, WINDOW, QUERY, TABLE, GRAPH. Brace spelling not read | not found |
| {LET}, {BLANK} | not seen in any page read | not found |

## (e) Is a `/` after typed text literal?

| Fact | Source | Status |
|---|---|---|
| In a macro cell, `/` after typed text is a literal character | none read. R4 10935 and FAQ do not say | not found |
| In Release 2, `/` in READY mode opens the menu, and in LABEL or VALUE mode it is typed | not found (Q31 p. 3 lists modes but not this rule) | not found |

## What the later tasks may use

- NAME record (task 2): layout as in (a). Two sources agree. Real-fixture byte check still to do.
- Macro names (tasks 2, 3): backslash plus one letter only. `\0` autoexec and the "stops at blank cell" rule are not sourced. Detect by name only. Do not claim autoexec or an end rule in labels or tests.
- Menu table (task 4): not sourced for Release 2. The table keeps no leaf with a prompt count or a stays-open flag. The requirement 29 tests that name leaf paths, key letters, prompt counts and stays-open flags cannot be written from these sources. Until a Release 2 manual is read, `/` steps stay `unknown-key`, one per letter, as the task 3 stub does.
- Brace names (task 3): the command steps for {BRANCH}, {MENUBRANCH}, {IF}, {WAIT} may carry a source. {GOTO} is one source. All other names from the requirement 20 list are generic `command` steps.
- Literal slash (requirement 25): not sourced. Treat as an open question for the owner.
- To unblock: a readable Release 2 / 2.01 / 2.2 Reference or Quick Reference, or a way to read archive.org full text beyond 8,000 characters (menu trees are in Q31 pp. 35-40 and the macro chapter in R31 chapter 4).

## Measured counts (task 14)

- `fixtures/macros/macros.wk1` has 2 NAME records (`\0` over F1, `\P` over H1).
- It has 3 detected macros: `\0` with 3 lines and 3 steps, `\P` with 1 line and 11 steps (every menu letter is an unknown-key step), and the unnamed block at J1 with 2 lines and 3 steps.
- It has 0 macro notes. Its queue holds 4 pending items: 3 macros and opcode 0x61 on A10.
- `KSBASE.WK1` has 9 NAME records (DATE, DEPTH, LSF, OBSERV, R_, SOIL, TEXT, X, Y) and no macro.
- basic-values, 92stlde, dates, formulas, functions, labels and mixed (WK1), and gnome647171-1 and testLotus123 (WKS), have 0 NAME records and no macro.
- Every queue for a real fixture is empty.
- Measured by running readNames, the raise worker handler and buildQueue on each file.
