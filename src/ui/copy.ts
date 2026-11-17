// Every user-facing string of the browser app (requirement 62). Plain words, no exclamation marks.
export const COPY = {
  missingCached: "Not stored in the file",
  missingRecalculated: "Could not be calculated",
  noFormulas: "No formulas",
  andMore: (n: number) => `and ${n} more`,
  status: { matched: "Matched", mismatched: "Mismatched", unverifiable: "Unverifiable" },
  emptyCell: "empty",
  noStoredValue: "no stored value",
  noCellsWithStatus: (status: string) => `No ${status} cells on this sheet.`,
} as const;
