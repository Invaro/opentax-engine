import type { Cents } from "./money.js";

export type StateReturnInput = {
  jurisdiction: "il" | "va" | "ca" | "ny";
  [k: string]: unknown;
};

/**
 * Evaluate a state oracle target with the given stateTaxableIncome (cents).
 * extraFacts (cents/bool values keyed by fact id) merge into the evaluation —
 * used for Schedule P AMT (caAmti/caRegularTax) and method toggles.
 */
export type StateTaxEvaluator = (
  target: string,
  stateTaxableIncomeCents: Cents,
  extraFacts?: Record<string, Cents | boolean>,
) => Cents;

/** Legacy filing-status flags derived from filingStatus by the dispatcher. */
export const isJoint = (input: StateReturnInput): boolean =>
  (input as { filingJoint?: boolean }).filingJoint === true;
export const isHoh = (input: StateReturnInput): boolean =>
  (input as { filingHoh?: boolean }).filingHoh === true;
export const isHohOrQss = (input: StateReturnInput): boolean =>
  (input as { filingHohOrQss?: boolean }).filingHohOrQss === true;
export const isMfs = (input: StateReturnInput): boolean =>
  (input as { filingStatus?: string }).filingStatus === "mfs";
