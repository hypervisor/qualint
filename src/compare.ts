/** Ordering helpers shared across layers, kept here so no module needs a cycle to reach them. */

/** Lexicographic string order, stable and locale-independent. */
export function compareStrings(a: string, b: string): number {
  if (a === b) {
    return 0;
  }
  return a < b ? -1 : 1;
}

/** Source-position order: line first, then column. */
export function comparePositions(a: { line: number; column: number }, b: { line: number; column: number }): number {
  return a.line - b.line || a.column - b.column;
}
