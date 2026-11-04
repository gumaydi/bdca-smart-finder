/**
 * Utility functions for formatting strings and names.
 */

function toTitleCaseWord(w: string): string {
  // Known degrees, roman numerals, or specific abbreviations remain uppercase
  if (/^(S1|S2|S3|D1|D2|D3|D4|DI|DII|DIII|DIV|IV|III|II|I)$/i.test(w)) {
    return w.toUpperCase();
  }
  return w.charAt(0).toUpperCase() + w.slice(1).toLowerCase();
}

/**
 * Normalizes study program names by removing the "Program Studi" prefix
 * and converting ALL CAPS names to Title Case while preserving degree
 * designations (S1, S2, DIII, D IV, etc.).
 */
export function normalizeProdiName(prodi: string | null | undefined): string {
  if (!prodi) return '';

  // 1. Remove 'Program Studi' or 'PROGRAM STUDI' prefix and any separator punctuation
  let clean = prodi.replace(/^program\s+studi\s*[:\-–]?\s*/i, '').trim();

  // 2. If it is all uppercase, convert words to Title Case while preserving degrees
  const lettersOnly = clean.replace(/[^a-zA-Z]/g, '');
  const isAllCaps = lettersOnly.length > 0 && lettersOnly === lettersOnly.toUpperCase();

  if (isAllCaps) {
    clean = clean.replace(/[a-zA-Z0-9]+/g, (match) => {
      return toTitleCaseWord(match);
    });
  }

  return clean;
}
