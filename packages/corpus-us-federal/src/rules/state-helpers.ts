/**
 * Shared helpers for the per-state rule modules (state-il.ts, state-va.ts,
 * state-ca.ts, state-ny.ts) — split out of state-parameters.ts so each state
 * module can import the same fact/money/isStatus/printedSchedule builders.
 */

import type { Expr } from "@invaro/opentax-core";

export const fact = (factId: string): Expr => ({ kind: "fact", factId });
export const money = (cents: string): Expr => ({ kind: "money", cents });
export const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
export const isStatus = (v: string): Expr => ({
  kind: "cmp",
  op: "eq",
  left: fact("filingStatus"),
  right: { kind: "enum", value: v },
});

/**
 * A printed-form rate schedule: "fixed + rate × excess over threshold", using
 * the form's own (rounded) fixed-dollar anchors rather than pure marginal
 * accumulation — reproduces the schedule exactly as filers compute it.
 * rows must be ordered ascending by threshold; each row applies when
 * base > threshold and (no next row or base ≤ next threshold).
 */
export const printedSchedule = (
  base: Expr,
  rows: { thresholdCents: string; fixedCents: string; rate: { num: string; den: string } }[],
): Expr => {
  const rowExpr = (r: (typeof rows)[number]): Expr => ({
    kind: "add",
    args: [
      money(r.fixedCents),
      {
        kind: "mulRate",
        base: { kind: "sub", left: base, right: money(r.thresholdCents) },
        rate: r.rate,
        round: "half-up",
      },
    ],
  });
  let expr: Expr = rowExpr(rows[rows.length - 1]);
  for (let i = rows.length - 2; i >= 0; i--) {
    expr = {
      kind: "if",
      cond: { kind: "cmp", op: "le", left: base, right: money(rows[i + 1].thresholdCents) },
      then: rowExpr(rows[i]),
      else: expr,
    };
  }
  return expr;
};
