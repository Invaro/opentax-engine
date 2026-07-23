/**
 * § 469 passive activity losses — the Form 8582 core, as STANDALONE
 * per-return targets. Verified July 2026 from the statute (Cornell text
 * carries no OBBBA amendment to § 469).
 *
 * Mechanics modeled:
 *  - passive losses are allowed to the extent of passive income (§ 469(a),
 *    (d)(1): the "passive activity loss" is the excess of losses over income);
 *  - the § 469(i) special allowance lets up to $25,000 of ACTIVE-PARTICIPATION
 *    rental real estate losses through, phased out by 50% of AGI over
 *    $100,000 (halved to $12,500/$50,000 for an MFS filer who lived apart
 *    all year; ZERO for an MFS filer who did not);
 *  - the disallowed remainder is suspended and carried forward (§ 469(b)) —
 *    reported by its own target, not tracked across years.
 *
 * MAGI note: § 469(i)(3)(E) computes the phase-out on AGI with add-backs
 * (IRA deduction, taxable social security, § 221, etc.). Approximated here
 * by us.federal.agi over the OTHER facts supplied to this standalone call —
 * do not include the passive items themselves in the income facts when
 * calling. Disclosed.
 *
 * A common agent failure mode motivated this rule: suspending ALL passive
 * losses and missing that passive income (e.g. royalties) absorbs an equal
 * amount of passive loss under § 469(d)(1) before any suspension — which in
 * turn reduces the QBI base.
 *
 * v2 (July 2026): the self-rental recharacterization of
 * Reg. § 1.469-2(f)(6) moved from agent judgment into the rule — net income
 * items from property rented to a business in which the taxpayer materially
 * participates are nonpassive and cannot absorb passive losses. Agents
 * transcribe total passive income AND the self-rental subset; the rule
 * subtracts. Verified verbatim from 26 CFR § 1.469-2(f)(6) and, for the
 * NIIT coordination, § 1.1411-4(g)(6)(i) (July 2026).
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const zero = money("0");
const isMfs: Expr = {
  kind: "cmp",
  op: "eq",
  left: fact("filingStatus"),
  right: { kind: "enum", value: "mfs" },
};

// the absorption pool: passive income LESS the self-rental subset that
// Reg. § 1.469-2(f)(6) recharacterizes as nonpassive (it cannot absorb)
const absorptionPool: Expr = {
  kind: "max0",
  arg: {
    kind: "sub",
    left: fact("passiveActivityIncome"),
    right: fact("selfRentalNetIncome"),
  },
};

// losses absorbed dollar-for-dollar by (recharacterization-adjusted) passive income
const absorbed: Expr = {
  kind: "min",
  args: [fact("passiveActivityLosses"), absorptionPool],
};

// rental-active losses still on the table after absorption
const remainingRentalActive: Expr = {
  kind: "min",
  args: [
    fact("rentalActiveParticipationLosses"),
    { kind: "max0", arg: { kind: "sub", left: fact("passiveActivityLosses"), right: absorbed } },
  ],
};

/** § 469(i)(3)(A)/(i)(5) allowance cap after the AGI phase-out. */
function allowanceCap(capCents: string, phaseStartCents: string): Expr {
  return {
    kind: "max0",
    arg: {
      kind: "sub",
      left: money(capCents),
      right: {
        kind: "mulRate",
        base: {
          kind: "max0",
          arg: {
            kind: "sub",
            left: ruleRef("us.federal.agi"),
            right: money(phaseStartCents),
          },
        },
        rate: { num: "50", den: "100" },
        round: "half-up",
      },
    },
  };
}

const specialAllowance: Expr = {
  kind: "if",
  cond: isMfs,
  then: {
    kind: "if",
    cond: fact("mfsLivedApartAllYear"),
    then: {
      kind: "min",
      args: [remainingRentalActive, allowanceCap("1250000", "5000000")], // $12,500 / $50,000
    },
    else: zero, // § 469(i)(5)(B): lived together at any time → no allowance
  },
  else: {
    kind: "min",
    args: [remainingRentalActive, allowanceCap("2500000", "10000000")], // $25,000 / $100,000
  },
};

const CITATION = {
  source: "26 U.S.C. § 469(a), (b), (i); 26 CFR § 1.469-2(f)(6)",
  section: "§ 469(i)(1)–(3), (5); Reg. § 1.469-2(f)(6)",
  url: "https://www.law.cornell.edu/uscode/text/26/469",
  excerpt:
    "Passive activity losses are disallowed (§ 469(a)(1)) and 'treated as a deduction or credit allocable to such activity in the next taxable year' (§ 469(b), verbatim) — losses apply against passive income first, then: 'In the case of any natural person, subsection (a) shall not apply to that portion of the passive activity loss… which is attributable to all rental real estate activities with respect to which such individual actively participated' (§ 469(i)(1)), capped at $25,000 (§ 469(i)(2)), 'reduced (but not below zero) by 50 percent of the amount by which the adjusted gross income of the taxpayer for the taxable year exceeds $100,000' (§ 469(i)(3)(A)); for a married individual filing separately, 'substituting “$12,500” for “$25,000”… [and] “$50,000” for “$100,000”' if living apart at all times, and NO allowance for one who 'does not live apart from his spouse at all times during such taxable year' (§ 469(i)(5), verbatim). SELF-RENTAL RECHARACTERIZATION: 'An amount of the taxpayer's gross rental activity income for the taxable year from an item of property equal to the net rental activity income for the year from that item of property is treated as not from a passive activity if the property— (i) Is rented for use in a trade or business activity… in which the taxpayer materially participates… for the taxable year; and (ii) Is not described in § 1.469-2T(f)(5)' (Reg. § 1.469-2(f)(6), verbatim) — this rule excludes selfRentalNetIncome from the absorption pool; that income is also deemed derived in the ordinary course of a trade or business for § 1411 (Reg. § 1.1411-4(g)(6)(i)), so it is NOT net investment income. [STANDALONE determination: net the result into scheduleENetIncome / k1OrdinaryBusinessIncome yourself, and reduce the QBI base by allowed QBI-flagged losses. § 469(i)(3)(E) MAGI add-backs approximated by AGI over the other supplied facts; the real-estate-professional escape (§ 469(c)(7)) makes those rentals NONpassive — exclude them from these inputs entirely; per-activity pro-rata allocation, the (f)(6) disposition-income arm, and the (i)(6) credit rules are not modeled.]",
};

export const passiveLossRules: Rule[] = [
  {
    id: "us.federal.passive_loss_allowed",
    version: 2, // v2: § 1.469-2(f)(6) self-rental income excluded from the pool
    jurisdiction: J,
    title:
      "Passive losses allowed this year — Form 8582 core (§ 469: income absorption + the § 469(i) $25,000 rental allowance)",
    citation: CITATION,
    effectiveFrom: "2025-01-01", // statutory, un-indexed since 1986
    output: { type: "money" },
    formula: { kind: "add", args: [absorbed, specialAllowance] },
  },
  {
    id: "us.federal.passive_loss_suspended",
    version: 2, // v2: follows passive_loss_allowed v2
    jurisdiction: J,
    title: "Passive losses suspended to next year (§ 469(b) carryforward)",
    citation: CITATION,
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: {
      kind: "max0",
      arg: {
        kind: "sub",
        left: fact("passiveActivityLosses"),
        right: ruleRef("us.federal.passive_loss_allowed"),
      },
    },
  },
];

/** Optional standard mileage rate, per year (Notice 2025-5; Notice 2026-10). */
function mileageRule(
  version: number,
  from: string,
  to: string,
  rateNum: string, // cents-per-mile numerator over den 1000 against $1/mile
  rateLabel: string,
  noticeLabel: string,
): Rule {
  return {
    id: "us.federal.vehicle_standard_mileage",
    version,
    jurisdiction: J,
    title: `Business standard mileage deduction (${rateLabel}/mile, ${noticeLabel})`,
    citation: {
      source: `${noticeLabel}; Rev. Proc. 2019-46`,
      section: `${noticeLabel} § 3`,
      url: "https://www.irs.gov/pub/irs-drop/n-26-10.pdf",
      excerpt: `The standard mileage rate for transportation or travel expenses is ${rateLabel} per mile for all miles of business use (${noticeLabel}, verbatim rate). [A STANDALONE determination in lieu of actual vehicle expenses (Rev. Proc. 2019-46 rules attested): subtract the result from your Schedule C profit yourself — it changes SE tax and QBI. Depreciation-component basis tracking and the actual-expense method are not modeled.] ADD-ON EXPENSES (Pub. 463 ch. 4): the mileage rate covers depreciation/gas/repairs ONLY. PARKING FEES and TOLLS for business trips deduct IN FULL in addition. The vehicle's PERSONAL PROPERTY TAX and (for the self-employed) CAR LOAN INTEREST deduct in addition but ONLY at the BUSINESS-USE PERCENTAGE = business miles ÷ TOTAL miles driven (business + commuting + other/personal), computed and rounded (half-up to the dollar) PER VEHICLE: per-vehicle deduction = miles × rate + parking + tolls + businessPct × (property tax + loan interest). A vehicle with no commuting/other miles listed is 100% business use (add-ons in full).`,
    },
    effectiveFrom: from,
    effectiveTo: to,
    output: { type: "money" },
    formula: {
      // miles × $1.00, scaled by the cents-per-mile rate (handles half-cent rates)
      kind: "mulRate",
      base: { kind: "mulInt", base: money("100"), count: fact("businessMilesDriven") },
      rate: { num: rateNum, den: "1000" },
      round: "half-up",
    },
  };
}

export const mileageRules: Rule[] = [
  mileageRule(1, "2025-01-01", "2026-01-01", "700", "70 cents", "Notice 2025-5"),
  mileageRule(2, "2026-01-01", "2027-01-01", "725", "72.5 cents", "Notice 2026-10"),
];
