// Every user-facing string of the browser app (requirement 62). Plain words, no exclamation marks.
export const COPY = {
  missingCached: "Not stored in the file",
  missingRecalculated: "Could not be calculated",
  noFormulas: "No formulas",
  andMore: (n: number) => `and ${n} more`,
} as const;
