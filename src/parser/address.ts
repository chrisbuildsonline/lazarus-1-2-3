// A1 addresses for 0-based column and row numbers. The column name is bijective base 26
// (A..Z, AA..ZZ, AAA..). No clamping to the WK1 grid: that check belongs to the parser.

const MAX_U16 = 65535;

export function a1(col: number, row: number): string {
  let name = "";
  for (let c = col + 1; c > 0; c = Math.floor((c - 1) / 26)) {
    name = String.fromCharCode(65 + ((c - 1) % 26)) + name;
  }
  return `${name}${row + 1}`;
}

export function parseA1(address: string): { col: number; row: number } | null {
  const match = /^([A-Za-z]+)([1-9][0-9]*)$/.exec(address);
  if (!match) return null;
  const letters = match[1]!.toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i++) {
    col = col * 26 + (letters.charCodeAt(i) - 64);
    if (col - 1 > MAX_U16) return null;
  }
  const row = Number(match[2]) - 1;
  if (row > MAX_U16) return null;
  return { col: col - 1, row };
}
