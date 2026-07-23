/**
 * Exact money arithmetic. No IEEE floats anywhere in tax math.
 *
 * - Amounts are integer cents (`bigint`).
 * - Rates are exact rationals (`{ num, den }`), e.g. 12% = { num: 12n, den: 100n }.
 * - Every division carries an explicit rounding mode; nothing rounds implicitly.
 */

export type Cents = bigint;

export interface Rate {
  num: bigint;
  den: bigint;
}

export type Rounding = "half-up" | "half-even" | "floor" | "ceil";

/**
 * Integer division `n / d` with an explicit rounding mode.
 * `half-up` rounds ties away from zero (the convention for money).
 * `half-even` is banker's rounding.
 */
export function divRound(n: bigint, d: bigint, mode: Rounding): bigint {
  if (d === 0n) throw new RangeError("division by zero");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  const q = n / d; // truncates toward zero
  const r = n % d; // sign follows n
  if (r === 0n) return q;
  const neg = n < 0n;
  const twiceAbsRem = (r < 0n ? -r : r) * 2n;
  switch (mode) {
    case "floor":
      return neg ? q - 1n : q;
    case "ceil":
      return neg ? q : q + 1n;
    case "half-up":
      if (twiceAbsRem >= d) return neg ? q - 1n : q + 1n;
      return q;
    case "half-even":
      if (twiceAbsRem > d) return neg ? q - 1n : q + 1n;
      if (twiceAbsRem < d) return q;
      // exactly half: round to even
      return q % 2n === 0n ? q : neg ? q - 1n : q + 1n;
  }
}

/** cents × rate with explicit rounding of the single division. */
export function mulRate(cents: Cents, rate: Rate, mode: Rounding): Cents {
  if (rate.den === 0n) throw new RangeError("rate with zero denominator");
  return divRound(cents * rate.num, rate.den, mode);
}

export function max0(cents: Cents): Cents {
  return cents < 0n ? 0n : cents;
}

/** Round cents to whole dollars (returns cents, a multiple of 100). */
export function roundToDollar(cents: Cents, mode: Rounding): Cents {
  return divRound(cents, 100n, mode) * 100n;
}

/**
 * Number of `unit`-sized steps in `value`, where a fraction of a unit
 * counts as a full unit under `ceil` (statutory "or fraction thereof").
 */
export function stepUnits(
  value: Cents,
  unit: Cents,
  mode: "ceil" | "floor",
): bigint {
  if (unit <= 0n) throw new RangeError("stepUnits requires a positive unit");
  return divRound(value, unit, mode);
}

/**
 * Parse a human dollar amount into exact cents.
 * Accepts: 50000 (integer number of dollars), "50000", "$50,000",
 * "1234.56", "-12.50". Non-integer JS numbers are rejected — write them as
 * strings so no float ever touches the math.
 */
export function parseDollars(input: string | number): Cents {
  if (typeof input === "number") {
    if (!Number.isSafeInteger(input)) {
      throw new TypeError(
        `non-integer dollar amount ${input} must be a string (e.g. "1234.56") so it stays exact`,
      );
    }
    return BigInt(input) * 100n;
  }
  const s = input.trim().replace(/^\$/, "").replace(/,/g, "");
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) {
    throw new TypeError(
      `invalid money amount ${JSON.stringify(input)} — use dollars like 50000, "$50,000", or "1234.56"`,
    );
  }
  const [, sign, whole, frac] = m;
  const cents = BigInt(whole) * 100n + BigInt((frac ?? "").padEnd(2, "0") || "0");
  return sign === "-" ? -cents : cents;
}

/** Parse a decimal string of integer cents ("396150") into bigint cents. */
export function parseCents(s: string): Cents {
  if (!/^-?\d+$/.test(s)) {
    throw new TypeError(`invalid cents literal: ${JSON.stringify(s)}`);
  }
  return BigInt(s);
}

/** Parse a decimal string integer ("13") into bigint. */
export function parseInt_(s: string): bigint {
  if (!/^-?\d+$/.test(s)) {
    throw new TypeError(`invalid integer literal: ${JSON.stringify(s)}`);
  }
  return BigInt(s);
}
