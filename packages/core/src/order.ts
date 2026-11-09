/**
 * The order rule ids and fact ids are sorted in wherever a hash depends on
 * it (the Merkle root).
 *
 * It is a fixed, pure function: no Intl, no locale. It gives the same order
 * that `String.prototype.localeCompare` gave under an English locale, which
 * every released Merkle root was computed with, so those roots are unchanged;
 * and it gives that order under every locale and in runtimes without ICU,
 * where localeCompare does not.
 *
 * Two strings compare, in order, by:
 *  1. their characters left to right, each by its rank in PRIMARY, with an
 *     uppercase ASCII letter ranked as its lowercase; any other character
 *     ranks after all of PRIMARY, by UTF-16 code unit;
 *  2. length (a prefix sorts first);
 *  3. case, at the first position where they differ: lowercase first.
 */
const PRIMARY = " _-,;:!?.'\"()[]{}@*/\\&#%`^+<=>|~$0123456789abcdefghijklmnopqrstuvwxyz";

const RANK: number[] = [];
for (let code = 0; code < 128; code++) {
  const lower = code >= 65 && code <= 90 ? code + 32 : code;
  const at = PRIMARY.indexOf(String.fromCharCode(lower));
  RANK[code] = at >= 0 ? at : 1000 + code;
}
const rank = (code: number): number => (code < 128 ? RANK[code] : 1000 + code);

export function compareIds(a: string, b: string): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const d = rank(a.charCodeAt(i)) - rank(b.charCodeAt(i));
    if (d !== 0) return d;
  }
  if (a.length !== b.length) return a.length - b.length;
  for (let i = 0; i < n; i++) {
    const x = a.charCodeAt(i);
    if (x !== b.charCodeAt(i)) return x >= 65 && x <= 90 ? 1 : -1;
  }
  return 0;
}
