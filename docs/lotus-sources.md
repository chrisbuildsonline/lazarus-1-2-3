# Lotus semantics sources

The allowed sources for the rule tables in `.kiro/specs/verification-engine/design.md`. Every URL in `design/refs/lotus-semantics/refs.md` is listed, plus the WSFF2 file-format note from `design/refs/lotus/SOURCES.md`. Those folders hold the local copies and are not in the repository, so this file is the tracked list that `tests/unit/verify/rules.test.ts` reads. One URL per line.

## LibreOffice Lotus filter (MPL-2.0)

- https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/lotform.cxx : Calc's Lotus formula import, the opcode table and argument reordering (PMT, CHOOSE, lookups).
- https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/op.cxx : Lotus filter record handlers.
- https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/tool.cxx : Lotus filter helpers.

## LibreOffice Calc help (contrast only, never the source of a Lotus rule)

- https://help.libreoffice.org/latest/en-US/text/scalc/01/04060119.html?DbPAR=CALC : Calc PMT and NPV.
- https://help.libreoffice.org/latest/en-US/text/scalc/01/04060103.html?DbPAR=CALC : Calc PV.
- https://help.libreoffice.org/latest/en-US/text/scalc/01/04060118.html?DbPAR=CALC : Calc FV.
- https://help.libreoffice.org/latest/en-US/text/scalc/01/func_date.html : Calc DATE.
- https://help.libreoffice.org/latest/en-US/text/scalc/01/04060109.html?DbPAR=CALC : Calc VLOOKUP, HLOOKUP and CHOOSE (counted from 1).
- https://help.libreoffice.org/latest/en-US/text/scalc/01/04060106.html?DbPAR=CALC : Calc ROUND (halves away from zero).
- https://raw.githubusercontent.com/LibreOffice/help/master/source/text/scalc/01/ : upstream help sources for the pages above.
- https://raw.githubusercontent.com/LibreOffice/help/master/source/text/scalc/01/func_date.xhp : upstream help source for DATE.

## Lotus 1-2-3 references

- http://messui.polygonal-moogle.com/training/123_qr.pdf : 1-2-3 quick reference card, Release 2 function signatures.
- https://bitsavers.org/pdf/victor/victor9000/Lotus_123.pdf : the 1983 Lotus 1-2-3 manual (Victor 9000); chapter 19 is the @function reference.
- http://parsifal.membrane.com/work/ref0001.htm : Lotus date serial numbers and @DATE years since 1900.
- https://learn.microsoft.com/en-us/troubleshoot/microsoft-365-apps/excel/wrongly-assumes-1900-is-leap-year : Lotus treated 1900 as a leap year.
- https://www.robweir.com/blog/2006/10/leap-back.html : serial 59 is 1900-02-28, 60 the fictitious 1900-02-29, 61 is 1900-03-01.
- https://www.oasis-open.org/committees/office/repository/miscellane1380/lotus123v9ssfn70enpdf@1153517929.5948 : Lotus 1-2-3 Millennium (v9) @function reference.
- https://pdfcoffee.com/lotus-1-2-3-v23-functions-and-macros-guide-pdf-free.html : Lotus 1-2-3 Release 2.3 Functions and Macros Guide.
- https://vinodkothari.com/wp-content/uploads/2026/09/Appendix-2.pdf : short overview of the financial functions.

## Lotus file format (public domain)

- https://oss.sheetjs.com/notes/lotus/WSFF2.TXT : Lotus Worksheet File Format, NUMBER record special values (NA, ERR, STRING) and the FORMULA tables.
