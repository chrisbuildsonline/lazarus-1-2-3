# Lotus 1-2-3 WK3 filter sources — download summary

All files saved in this directory. Downloaded 2026-11-18 from LibreOffice `core` (GitHub `master`) and GNOME Gnumeric (GitLab `master`).

## Files, URLs, and license lines

| File | URL | License line from header |
|------|-----|--------------------------|
| `filter.cxx` | https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/filter.cxx | Mozilla Public License, v. 2.0 (also incorporates Apache License, Version 2.0) |
| `lotimpop.cxx` | https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/lotimpop.cxx | Mozilla Public License, v. 2.0 (also incorporates Apache License, Version 2.0) |
| `lotread.cxx` | https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/lotread.cxx | Mozilla Public License, v. 2.0 (also incorporates Apache License, Version 2.0) |
| `op.cxx` | https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/op.cxx | Mozilla Public License, v. 2.0 (also incorporates Apache License, Version 2.0) |
| `tool.cxx` | https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/tool.cxx | Mozilla Public License, v. 2.0 (also incorporates Apache License, Version 2.0) |
| `lotform.cxx` | https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/lotform.cxx | Mozilla Public License, v. 2.0 (also incorporates Apache License, Version 2.0) |
| `lotimpop.hxx` | https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/inc/lotimpop.hxx | Mozilla Public License, v. 2.0 (also incorporates Apache License, Version 2.0) |
| `lotfntbf.hxx` | https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/inc/lotfntbf.hxx | Mozilla Public License, v. 2.0 (also incorporates Apache License, Version 2.0) |
| `op.h` | https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/inc/op.h | Mozilla Public License, v. 2.0 (also incorporates Apache License, Version 2.0) |
| `optab.cxx` | https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/lotus/optab.cxx | Mozilla Public License, v. 2.0 (also incorporates Apache License, Version 2.0) |
| `ftools.cxx` | https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/ftools/ftools.cxx | Mozilla Public License, v. 2.0 (also incorporates Apache License, Version 2.0) |
| `ftools.hxx` | https://raw.githubusercontent.com/LibreOffice/core/master/sc/source/filter/inc/ftools.hxx | Mozilla Public License, v. 2.0 (also incorporates Apache License, Version 2.0) |
| `lotus.c` | https://gitlab.gnome.org/GNOME/gnumeric/-/raw/master/plugins/lotus-123/lotus.c | No SPDX/MPL line in file header; project `COPYING` says GPL-2 or GPL-3 (see `COPYING.gnumeric`) |
| `lotus-types.h` | https://gitlab.gnome.org/GNOME/gnumeric/-/raw/master/plugins/lotus-123/lotus-types.h | No license line in header; same Gnumeric GPL-2-or-3 |
| `lotus.h` | https://gitlab.gnome.org/GNOME/gnumeric/-/raw/master/plugins/lotus-123/lotus.h | No license line in header; same Gnumeric GPL-2-or-3 |
| `COPYING.gnumeric` | https://gitlab.gnome.org/GNOME/gnumeric/-/raw/master/COPYING | “GPL version 2” / “GPL version 3” |

**Note:** Requested name `lotfntbl.hxx` does not exist on `master`; the real file is `lotfntbf.hxx` (font buffer).

## Code quotes for the four WK3 topics

### (1) Detect WK3 from BOF version word and record length

LibreOffice `filter.cxx` — BOF opcode, then record length + version; WK3 is version `0x1000`, subtype `0x0004`, length `26`:

```132:172:filter.cxx
static WKTYP ScanVersion(SvStream& aStream)
{
    // PREC:    pWKFile:   pointer to open file
    // POST:    return:     type of file
    sal_uInt16 nOpcode(0), nVersNr(0), nRecLen(0);

    // first byte has to be 0 because of BOF!
    aStream.ReadUInt16( nOpcode );
    if (nOpcode != LotusContext::nBOF)
        return eWK_UNKNOWN;

    aStream.ReadUInt16( nRecLen ).ReadUInt16( nVersNr );

    if (!aStream.good())
        return eWK_Error;

    switch( nVersNr )
    {
        case 0x0404:
            if( nRecLen == 2 )
                return eWK_1;
            else
                return eWK_UNKNOWN;

        case 0x0406:
            if( nRecLen == 2 )
                return eWK_2;
            else
                return eWK_UNKNOWN;

        case 0x1000:
            aStream.ReadUInt16( nVersNr );
            if (!aStream.good())
                return eWK_Error;
            if( nVersNr == 0x0004 && nRecLen == 26 )
            {
                // 4 bytes of 26 read => skip 22 (read instead of seek to make IsEof() work just in case)
                char aDummy[22];
                aStream.ReadBytes(aDummy, 22);
                return !aStream.good() ? eWK_Error : eWK3;
            }
            break;
```

LibreOffice `lotimpop.cxx` — same file-code / subtype inside the BOF body:

```57:85:lotimpop.cxx
void ImportLotus::Bof()
{
    sal_uInt16  nFileCode, nFileSub, nSaveCnt;
    sal_uInt8   nMajorId, nMinorId, nFlags;

    Read( nFileCode );
    Read( nFileSub );
    LotusContext &rContext = aConv.getContext();
    Read( rContext.aActRange );
    Read( nSaveCnt );
    Read( nMajorId );
    Read( nMinorId );
    Skip( 1 );
    Read( nFlags );

    if (!pIn->good())
        return;

    if( nFileSub == 0x0004 )
    {
        if( nFileCode == 0x1000 )
        {// <= WK3
            rContext.eFirstType = rContext.eActType = Lotus123Typ::WK3;
        }
        else if( nFileCode == 0x1002 )
        {// WK4
            rContext.eFirstType = rContext.eActType = Lotus123Typ::WK4;
        }
    }
}
```

Gnumeric `lotus.c` + `lotus.h` detect BOF version but do not name WK3/`0x1000` as a dedicated enum; old formats use `0x0404`/`0x0405`/`0x0406`, newer use `0x1002`+:

```2609:2649:lotus.c
gboolean
lotus_read (LotusState *state)
{
	record_t r;
	r.input = state->input;

	if (!record_next (&r)) return FALSE;

	if (r.len < 2)
		return FALSE;

	state->version = GSF_LE_GET_GUINT16 (r.data);

	if (r.type == LOTUS_BOF) {
		state->is_works = FALSE;
#if LOTUS_DEBUG > 0
		g_printerr ("Version=%x, Lotus\n", state->version);
#endif
		switch (state->version) {
		case LOTUS_VERSION_ORIG_123:
		case LOTUS_VERSION_SYMPHONY:
		case LOTUS_VERSION_SYMPHONY2:
			return lotus_read_old (state, &r);

		default:
			g_warning ("Unexpected version %x", state->version);
			/* Fall through.  */
		case LOTUS_VERSION_123V4:
		case LOTUS_VERSION_123V6:
		case LOTUS_VERSION_123V7:
		case LOTUS_VERSION_123SS98:
			return lotus_read_new (state, &r);
		}
```

### (2) WK3 cell address: row, sheet, column (and widths)

Address order in LibreOffice — **row (u16), sheet (u8), column (u8)**:

```83:93:lotimpop.hxx
inline void ImportLotus::Read( ScAddress& rAddr )
{
    sal_uInt16 nRow;
    pIn->ReadUInt16( nRow );
    rAddr.SetRow( static_cast<SCROW>(nRow) );
    sal_uInt8 nByte;
    pIn->ReadUChar( nByte );
    rAddr.SetTab( static_cast<SCTAB>(nByte) );
    pIn->ReadUChar( nByte );
    rAddr.SetCol( static_cast<SCCOL>(nByte) );
}
```

Same layout in Gnumeric cell records (`row` / `sheet` / `col`):

```2132:2158:lotus.c
		case LOTUS_LABEL2: CHECK_RECORD_SIZE (>= 6) {
			/* one of '\', '''', '"', '^' */
			int row = GSF_LE_GET_GUINT16 (r->data);
			Sheet *sheet = lotus_get_sheet (state->wb, r->data[2]);
			int col = r->data[3];
/*			gchar format_prefix = *(r->data + ofs + 4);*/
			GnmValue *v = lotus_get_strval (r, 5, state->lmbcs_group);
			(void)insert_value (state, sheet, col, row, v);
			break;
		}
		// ...
		case LOTUS_SMALLNUM: CHECK_RECORD_SIZE (>= 6) {
			int row = GSF_LE_GET_GUINT16 (r->data);
			Sheet *sheet = lotus_get_sheet (state->wb, r->data[2]);
			int col = r->data[3];
			GnmValue *v = lotus_smallnum (GSF_LE_GET_GINT16 (r->data + 4));
			(void)insert_value (state, sheet, col, row, v);
			break;
		}
```

Column widths (LibreOffice WK3 opcode `0x0007`):

```98:125:lotimpop.cxx
void ImportLotus::Columnwidth( sal_uInt16 nRecLen )
{
    SAL_WARN_IF( nRecLen < 4, "sc.filter", "*ImportLotus::Columnwidth(): Record too short!" );

    sal_uInt16 nCnt = (nRecLen < 4) ? 0 : ( nRecLen - 4 ) / 2;

    sal_uInt8 nLTab(0), nWindow2(0);
    Read( nLTab );
    Read( nWindow2 );

    if( !rD.HasTable( static_cast<SCTAB> (nLTab) ) )
        rD.MakeTable( static_cast<SCTAB> (nLTab) );

    if( nWindow2 )
        return;

    Skip( 2 );

    while (nCnt && pIn->good())
    {
        sal_uInt8 nCol(0), nSpaces(0);
        Read( nCol );
        Read( nSpaces );
        // Attention: ambiguous Correction factor!
        rD.SetColWidth( static_cast<SCCOL> (nCol), static_cast<SCTAB> (nLTab), static_cast<sal_uInt16>( TWIPS_PER_CHAR * 1.28 * nSpaces ) );

        nCnt--;
    }
```

### (3) Decode WK3 records 0x16–0x19, 0x1B (+ other cell records)

Dispatch in LibreOffice `lotread.cxx`:

```141:173:lotread.cxx
                case 0x0016:                            // LABELCELL
                Labelcell();
                break;

                case 0x0017:                            // NUMBERCELL
                Numbercell();
                break;

                case 0x0018:                            // SMALLNUMCELL
                Smallnumcell();
                break;

                case 0x0019:                            // FORMULACELL
                Formulacell( nRecLen );
                break;

                case 0x001b:                            // extended attributes
                if (nRecLen > 2)
                {
                    sal_uInt16 nSubType(0);
                    Read( nSubType );
                    nRecLen -= 2;
                    switch( nSubType )
                    {
                        case 2007:                      // ROW PRESENTATION
                            RowPresentation( nRecLen );
                            break;

                        case 14000:                     // NAMED SHEET
                            NamedSheet();
                            break;
                    }
```

Implementations in `lotimpop.cxx`:

```218:309:lotimpop.cxx
void ImportLotus::Labelcell()
{
    ScAddress   aA;
    OUString    aLabel;
    char        cAlign;

    Read( aA );
    Read( cAlign );
    Read( aLabel );
    // ... SetString ...
}

void ImportLotus::Numbercell()
{
    ScAddress   aAddr;
    double      fVal;

    Read( aAddr );
    Read( fVal );   // 10-byte via ScfTools::ReadLongDouble
    // ... SetValue ...
}

void ImportLotus::Smallnumcell()
{
    ScAddress   aAddr;
    sal_Int16       nVal;

    Read( aAddr );
    Read( nVal );
    // ... SetValue(aAddr, SnumToDouble(nVal)) ...
}

void ImportLotus::Formulacell( sal_uInt16 n )
{
    ScAddress           aAddr;

    Read( aAddr );
    Skip( 10 );   // skip 10-byte cached result

    n -= std::min<sal_uInt16>(n, 14);

    std::unique_ptr<ScTokenArray> pErg;
    sal_Int32 nRest = n;

    aConv.Reset( aAddr );
    aConv.SetWK3();
    aConv.Convert( pErg, nRest );
    // ... SetFormulaCell ...
}
```

Named sheet (via `0x001b` / subtype 14000):

```353:371:lotimpop.cxx
void ImportLotus::NamedSheet()
{
    sal_uInt16 nTmpTab(0);
    Read(nTmpTab);
    OUString aName;
    Read(aName);

    SCTAB nLTab(SanitizeTab(static_cast<SCTAB>(nTmpTab)));
    // ...
    if (rD.HasTable(nLTab))
        rD.RenameTab(nLTab, aName);
    else
        rD.InsertTab(nLTab, aName);
}
```

Gnumeric type names (`lotus-types.h`) and handlers (`lotus.c`):

```53:58:lotus-types.h
#define LOTUS_LABEL2                 0x16
#define LOTUS_EXTENDED_FLOAT         0x17    /* wk4...  */
#define LOTUS_SMALLNUM               0x18    /* wk3,wk4 */
#define LOTUS_FORMULA3               0x19    /* wk3,wk4 */
#define LOTUS_FORMULASTRING          0x1a    /* wk3,wk4 */
#define LOTUS_STYLE                  0x1b
```

Also WK3-era cell ops `0x14` ERRCELL, `0x15` NACELL, `0x1a` FORMULASTRING; sheet name appears as STYLE subtype `0x36b0` or later `LOTUS_SHEET_NAME` `0x204` (see `lotus.c` around the LABEL2/SMALLNUM/FORMULA3 cases quoted above).

### (4) Convert 16-bit small number and 10-byte long double

LibreOffice `SnumToDouble` in `tool.cxx`:

```104:127:tool.cxx
double SnumToDouble( sal_Int16 nVal )
{
    const double pFacts[ 8 ] = {
        5000.0,
        500.0,
        0.05,
        0.005,
        0.0005,
        0.00005,
        0.0625,
        0.015625 };

    double      fVal;

    if( nVal & 0x0001 )
    {
        fVal = pFacts[ ( nVal >> 1 ) & 0x0007 ];
        fVal *= static_cast<sal_Int16>( nVal >> 4 );
    }
    else
        fVal = static_cast<sal_Int16>( nVal >> 1 );

    return fVal;
}
```

Gnumeric equivalent `lotus_smallnum`:

```908:922:lotus.c
GnmValue *
lotus_smallnum (signed int d)
{
	if (d & 1) {
		static int factors[8] = {
			5000, 500, -20, -200, -2000, -20000, -16, -64
		};
		int f = factors[(d >> 1) & 7];
		int mant = (d >> 4);
		return (f > 0)
			? value_new_int (f * mant)
			: value_new_float ((gnm_float)mant / -f);
	} else
		return value_new_int (d >> 1);
}
```

10-byte Intel long double — LibreOffice `ScfTools::ReadLongDouble` in `ftools.cxx` (used by `ImportLotus::Read(double&)`):

```42:108:ftools.cxx
void ScfTools::ReadLongDouble(SvStream& rStrm, double& fResult)
{
    // ... mapping comment for 10-Byte Intel ...
    long double lfDouble;
    long double lfFactor = 256.0;
    sal_uInt8 pDouble10[ 10 ];

    bool bOk = 10 == rStrm.ReadBytes(pDouble10, 10);
    if (!bOk)
        return;

    lfDouble  = static_cast< long double >( pDouble10[ 7 ] );
    // ... accumulate bytes 6..0 with *256 ...
    if( lfDouble != 0.0 )
    {
        sal_Int32 nExp;
        nExp = pDouble10[ 9 ] & 0x7F;
        nExp <<= 8;
        nExp += pDouble10[ 8 ];
        nExp -= 16446;

        lfDouble *= pow( 2.0, static_cast< double >( nExp ) );
    }

    if( pDouble10[ 9 ] & 0x80 )
        lfDouble *= static_cast< long double >( -1.0 );

    fResult = static_cast<double>(lfDouble);
}
```

Gnumeric 10-byte “treal” / extended float:

```924:964:lotus.c
static GnmValue *
lotus_extfloat (guint64 mant, guint16 signexp)
{
	int exp = (signexp & 0x7fff) - 16383;
	int sign = (signexp & 0x8000) ? -1 : 1;
	return value_new_float (sign * gnm_ldexp (mant, exp - 63));
}

GnmValue *
lotus_load_treal (gconstpointer p)
{
	const guint8 *pc = p;

	if (pc[9] == 0xff && pc[8] == 0xff) {
		switch (pc[7]) {
		case 0x00: return value_new_empty ();
		case 0xc0: return value_new_error_VALUE (NULL);
		case 0xd0: return value_new_error_NA (NULL);
		case 0xe0: return value_new_string (""); // Supplied in FORMULASTRING
		}
	}

	return lotus_extfloat (GSF_LE_GET_GUINT64 (p),
			       GSF_LE_GET_GUINT16 (pc + 8));
}
```
