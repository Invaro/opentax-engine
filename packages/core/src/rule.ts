/**
 * The rule IR: rules are DATA, not code. The engine is domain-general;
 * everything tax-specific lives in a corpus of these objects.
 */

import type { Expr, ValueType } from "./ast.js";

export interface Citation {
  /** e.g. "26 U.S.C. § 63(c)" or "Rev. Proc. 2024-40" */
  source: string;
  /** e.g. "§ 63(c)(2)" or "§ 3.15" */
  section: string;
  url?: string;
  /** Short verbatim quote of the operative statutory text. */
  excerpt?: string;
}

export interface RuleParameter {
  value: string | boolean;
  type: ValueType;
  citation?: Citation;
}

export interface Rule {
  /** Stable identifier, e.g. "us.federal.standard_deduction.base". */
  id: string;
  /** Human-facing version; bump on any change. The hash is the truth. */
  version: number;
  jurisdiction: string;
  title: string;
  citation: Citation;
  /** ISO date, inclusive. Validity window is half-open: [from, to). */
  effectiveFrom: string;
  /** ISO date, EXCLUSIVE. Absent = open-ended. */
  effectiveTo?: string;
  output: { type: ValueType; enumValues?: string[] };
  parameters?: Record<string, RuleParameter>;
  /** Boolean guard; absent = always applicable. */
  applicability?: Expr;
  formula: Expr;
  /**
   * Default logic: this rule overrides `ruleId` when its guard holds.
   * Higher priority wins; the base rule has implicit priority 0.
   */
  overrides?: { ruleId: string; priority: number };
}

export interface FactSpec {
  id: string;
  type: ValueType;
  enumValues?: string[];
  /** Inclusive bounds for money (cents) / int facts, as decimal strings. */
  min?: string;
  max?: string;
  description: string;
  /** Documented default. Using it is recorded as an assumption in the proof. */
  default?: { value: string | boolean; rationale: string };
}

/** Raw corpus input, before validation/hashing. */
export interface CorpusInput {
  name: string;
  version: string;
  rules: Rule[];
  facts: FactSpec[];
}
