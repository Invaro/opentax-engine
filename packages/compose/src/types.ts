import type { Cents } from "./money.js";

export type StateReturnInput = {
  jurisdiction: "il" | "va" | "ca" | "ny" | "pa";
  [k: string]: unknown;
};

/**
 * Evaluate a state oracle target with the given stateTaxableIncome (cents).
 * extraFacts (values keyed by fact id) merge into the evaluation — used for
 * Schedule P AMT (caAmti/caRegularTax), method toggles, and the PA class
 * facts. Value typing: bigint = money cents, boolean = bool fact, plain JS
 * number = INT fact (counts, e.g. paSpDependentChildren).
 */
export type StateTaxEvaluator = (
  target: string,
  stateTaxableIncomeCents: Cents,
  extraFacts?: Record<string, Cents | boolean | number>,
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
