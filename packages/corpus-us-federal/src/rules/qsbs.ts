/**
 * Qualified small business stock gain exclusion — 26 U.S.C. § 1202, as
 * amended by Pub. L. 119-21 (OBBBA), verified July 2026.
 *
 * Stock ACQUIRED AFTER July 4, 2025 (the OBBBA regime): tiered exclusion —
 * 50% after 3 years, 75% after 4, 100% after 5+; per-issuer cap the
 * greater of $15,000,000 (indexed after 2026) or 10× basis (the 10×-basis
 * alternative is NOT modeled — using the flat cap is conservative);
 * issuer gross-asset limit $75,000,000.
 *
 * Stock acquired September 28, 2010 – July 4, 2025 (prior law): 100%
 * exclusion after 5 years, $10,000,000 cap. Earlier acquisition dates
 * (50%/75% legacy tiers) REFUSE.
 *
 * The NON-excluded remainder under the 50%/75% tiers is § 1(h)(4) 28%-rate
 * gain with a 7% AMT preference — NEITHER is representable in this
 * corpus's individual chain, so the remainder must not be entered as
 * longTermCapitalGains; this rule answers the exclusion question only.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const param = (name: string): Expr => ({ kind: "param", name });

const years = fact("qsbsHoldingPeriodYears");
const atLeast = (n: string): Expr => ({
  kind: "cmp",
  op: "ge",
  left: years,
  right: { kind: "int", value: n },
});
const cappedGain = (capParam: string): Expr => ({
  kind: "min",
  args: [fact("qsbsGain"), param(capParam)],
});
const share = (num: string, capParam: string): Expr => ({
  kind: "mulRate",
  base: cappedGain(capParam),
  rate: { num, den: "100" },
  round: "half-up",
});

// the OBBBA (post-July 4, 2025) tiers vs the prior-law regime
const tiers: Expr = {
  kind: "if",
  cond: fact("qsbsAcquiredAfterJuly2025"),
  then: {
    kind: "if",
    cond: atLeast("5"),
    then: share("100", "capNew"),
    else: {
      kind: "if",
      cond: atLeast("4"),
      then: share("75", "capNew"),
      else: {
        kind: "if",
        cond: atLeast("3"),
        then: share("50", "capNew"),
        else: money("0"), // under 3 years: no exclusion yet
      },
    },
  },
  else: {
    kind: "if",
    cond: atLeast("5"),
    then: {
      kind: "if",
      cond: fact("qsbsAcquiredAfterSept2010"),
      then: share("100", "capOld"),
      else: {
        kind: "unsupported",
        reason:
          "stock acquired on or before September 27, 2010 falls in the legacy 50%/75% regimes (§ 1(h)(4) 28%-rate gain + 7% AMT preference) — not modeled",
      },
    },
    else: money("0"), // prior-law stock under 5 years: nothing excludable
  },
};

export const qsbsRules: Rule[] = [
  {
    id: "us.federal.qsbs_exclusion",
    version: 1,
    jurisdiction: "us.federal",
    title:
      "QSBS gain exclusion — OBBBA tiers (50/75/100% at 3/4/5 years) or prior-law 100% at 5 years",
    citation: {
      source: "26 U.S.C. § 1202, as amended by Pub. L. 119-21 (OBBBA)",
      section: "§ 1202(a), (b)",
      url: "https://www.law.cornell.edu/uscode/text/26/1202",
      excerpt:
        "For qualified small business stock acquired after July 4, 2025: 50 percent of gain excluded after a 3-year holding period, 75 percent after 4 years, 100 percent after 5 years; per-issuer limit the greater of $15,000,000 (indexed after 2026) or 10 times basis [the 10×-basis alternative is not modeled — the flat cap is conservative]; issuer aggregate gross assets must not exceed $75,000,000. For stock acquired after September 27, 2010 and on or before July 4, 2025: 100 percent excluded after 5 years, $10,000,000 cap. [Assumed and disclosed: original issuance for money/services, active qualified trade or business, and the asset test; earlier-vintage stock (50%/75% legacy with § 1(h)(4) 28%-rate gain and the 7% AMT preference) REFUSES. The non-excluded remainder of the new 50%/75% tiers is likewise 28%-rate gain — do not enter it as longTermCapitalGains; this target answers the exclusion amount only.]",
    },
    effectiveFrom: "2025-01-01", // statutory: open-ended
    output: { type: "money" },
    parameters: {
      capNew: { value: "1500000000", type: "money" }, // $15,000,000
      capOld: { value: "1000000000", type: "money" }, // $10,000,000
    },
    formula: {
      kind: "if",
      cond: { kind: "cmp", op: "eq", left: fact("qsbsGain"), right: money("0") },
      then: money("0"),
      else: tiers,
    },
  },
];
