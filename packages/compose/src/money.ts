/** Whole-dollar money helpers shared by the state composers. */

export type Cents = bigint;

/** dollars (agent JSON number) → cents */
export const c = (d: unknown): Cents => BigInt(Math.round(((d as number) ?? 0) * 100));

/** whole-dollar, half-up, sign-aware */
export const rd = (x: Cents): Cents => {
  const neg = x < 0n;
  const a = neg ? -x : x;
  const r = ((a + 50n) / 100n) * 100n;
  return neg ? -r : r;
};

export const max0 = (x: Cents): Cents => (x > 0n ? x : 0n);

export const min2 = (a: Cents, b: Cents): Cents => (a < b ? a : b);

export const fmtD = (x: Cents): string => {
  const neg = x < 0n;
  const a = neg ? -x : x;
  return `${neg ? "-" : ""}$${(a / 100n).toLocaleString()}`;
};
