// Decimal rounding for @ROUND (rule S09) on the 15-significant-digit decimal form of x, so the
// error of x * 10^n cannot push a value across a halfway point. The 15 digits are an engineering
// choice, not a Lotus rule (design.md, open question 3).

const DIGITS = 15;

/** x rounded to n decimal places (n an integer; negative n rounds to tens, hundreds, ...). */
export function roundDecimal(x: number, n: number): { value: number } | { tie: true } {
  if (!Number.isFinite(x)) return { value: x };
  // Step 1: d.dddddddddddddde±X holds exactly 15 significant digits; e digits sit before the point.
  const [mantissa, exponent] = Math.abs(x).toExponential(DIGITS - 1).split("e");
  const digits = mantissa!.replace(".", "");
  const e = Number(exponent) + 1;
  // Step 2: where the cut falls, counted in digits from the left.
  const cut = e + n;
  if (cut >= DIGITS) return { value: x + 0 };
  if (cut < 0) return { value: 0 };
  const dropped = digits.slice(cut);
  // Step 3: exactly halfway in the 15-digit form. No Lotus source gives the halfway rule (U03).
  if (/^50*$/.test(dropped)) return { tie: true };
  // Step 4: round up on a first dropped digit of 5 or more, then read the decimal back as the nearest double.
  let kept = BigInt(digits.slice(0, cut) || "0");
  if (dropped[0]! >= "5") kept += 1n;
  const magnitude = Number(`${kept}e${-n}`);
  return { value: x < 0 && magnitude !== 0 ? -magnitude : magnitude };
}
