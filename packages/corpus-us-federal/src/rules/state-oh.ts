/**
 * Ohio deep state pack — TY2025 (+TY2026 where enacted), encoded from primary
 * sources 2026-08-02: 2025 Ohio IT 1040 form bundle + instruction booklet
 * ("accurate as of November 27, 2025", tax.ohio.gov, read page-by-page),
 * ORC 5747.02 / 5747.025 / 5747.05 / 5747.98 as amended by 2025 Am. Sub.
 * H.B. 96 (136th G.A., "Effective: September 30, 2025"), and the ODT Annual
 * Tax Rates page. Tax Foundation used only as an outside cross-check (its
 * 2025 survey predates HB 96's retroactive top-rate cut to 3.125%).
 *
 * Ohio starts from federal AGI: line 1 FAGI → Schedule of Adjustments
 * (additions/deductions incl. the Business Income Deduction) → line 3 OAGI →
 * minus line 4 exemptions → line 5 Ohio income tax base → split into line 6
 * taxable business income (flat 3%) and line 7 taxable nonbusiness income
 * (the bracket schedule). MAGI = OAGI + the BID (booklet p. 8).
 */
import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, isStatus, money, printedSchedule, ruleRef } from "./state-helpers.js";

const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const param = (name: string): Expr => ({ kind: "param", name });
const le = (left: Expr, right: Expr): Expr => ({ kind: "cmp", op: "le", left, right });
const lt = (left: Expr, right: Expr): Expr => ({ kind: "cmp", op: "lt", left, right });

/** MAGI less exemptions — the gate most Ohio credits key on (booklet: "MAGI less exemptions"). */
const magiLessExemptions: Expr = max0(sub(fact("ohModifiedAgi"), ruleRef("us.oh.exemption_amount")));

export const ohRules: Rule[] = [
  {
    id: "us.oh.income_tax",
    version: 1,
    jurisdiction: "us.oh",
    title: "Ohio nonbusiness income tax — 2025 brackets: 0% to $26,050, $342.00 + 2.75%, $2,394.32 + 3.125% over $100,000 (IT 1040 line 8a)",
    citation: {
      source:
        "ORC 5747.02(A)(3)(b) (2025 Am. Sub. H.B. 96, eff. 9-30-2025); 2025 Ohio IT 1040 instructions p. 18 (bracket table); tax.ohio.gov Annual Tax Rates",
      section: "R.C. 5747.02(A)(3)(b); IT 1040 line 8a",
      url: "https://codes.ohio.gov/ohio-revised-code/section-5747.02",
      excerpt:
        "Statute (HB 96 codification, verbatim): 'If the balance thus obtained is equal to or less than twenty-six thousand fifty dollars, no tax shall be imposed on that balance. If the balance thus obtained is greater than twenty-six thousand fifty dollars, the tax is hereby levied as follows: ... (b) For taxable years beginning in 2025: More than $26,050 but not more than $100,000 — $342.00 plus 2.75% of the amount in excess of $26,050; More than $100,000 — $2,394.32 plus 3.125% of the amount in excess of $100,000.' Printed 2025 instructions bracket table (p. 18) matches verbatim, with the worked example: '$68,050 ... $42,000 x 0.0275 = $1,155 ... $1,155 + $342 = $1,497.' ENCODING NOTE: the $2,394.32 anchor at $100,000 does NOT equal $342 + 2.75% × $73,950 ($2,375.63) — the printed/statutory base amounts are carried anchors (the $342 is 1.31287% × $26,050, the 2025 estate rate), so this rule encodes the PRINTED amounts, never a recomputed continuation; and crossing $26,050 by one dollar jumps tax from $0 to ~$342 BY STATUTE (a real cliff, findable via opentax cliffs). The 2024 top rate was 3.5%; HB 96 cut TY2025's top rate to 3.125% ('For tax year 2025, the highest tax rate has been reduced to 3.125%', booklet Highlights) — surveys printed before HB 96 still show 3.5%. No tax-lookup table exists; the schedule is computed directly ('Calculate your tax on your Ohio income tax base less business income using the Income Tax Brackets found on page 18'). Rounding: 'Use whole dollars only' / 'Round all figures to the nearest dollar' (half-up). Input: stateTaxableIncome = IT 1040 line 7 TAXABLE NONBUSINESS INCOME (line 5 Ohio income tax base minus line 6 taxable business income) — business income is taxed separately at 3% (us.oh.business_income_tax). School district income tax (SD 100) and municipal income taxes are SEPARATE levies, not in this target.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      zeroBracketTop: { value: "2605000", type: "money" }, // $26,050
    },
    formula: (() => {
      const base: Expr = max0(fact("stateTaxableIncome"));
      return {
        kind: "if",
        cond: le(base, param("zeroBracketTop")),
        then: money("0"),
        else: rd(
          printedSchedule(base, [
            { thresholdCents: "2605000", fixedCents: "34200", rate: { num: "275", den: "10000" } },
            { thresholdCents: "10000000", fixedCents: "239432", rate: { num: "3125", den: "100000" } },
          ]),
        ),
      } as Expr;
    })(),
  },
  {
    id: "us.oh.income_tax",
    version: 2,
    jurisdiction: "us.oh",
    title: "Ohio nonbusiness income tax — TY2026 single rate: $332.00 + 2.75% of the excess over $26,050 (ORC 5747.02(A)(3)(c), enacted)",
    citation: {
      source: "ORC 5747.02(A)(3)(c) (2025 Am. Sub. H.B. 96, eff. 9-30-2025)",
      section: "R.C. 5747.02(A)(3)(c)",
      url: "https://codes.ohio.gov/ohio-revised-code/section-5747.02",
      excerpt:
        "Statute (verbatim): '(c) For taxable years beginning in 2026 and thereafter, $332.00 plus 2.75% of the amount in excess of $26,050.' The zero band below $26,050 continues ('no tax shall be imposed on that balance'); the $332 anchor is 1.27448% × $26,050 (the 2026 estate rate in the same section). CAVEAT (disclosed): ORC 5747.02(A)(5) directs an annual GDP-deflator adjustment of bracket income amounts (rounded to the nearest $50, rates never adjusted) — the $26,050 threshold has been unchanged 2023-2025, but the TY2026 printed instructions were not yet published at encoding; re-verify the threshold when the 2026 IT 1040 instructions appear before relying on this rule for exact 2026 filings. TY2026 exemption amounts and the tightened $500,000 exemption/JFC caps are NOT encoded (indexed amounts unknown) — us.oh.exemption_amount refuses for 2026.",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      zeroBracketTop: { value: "2605000", type: "money" }, // $26,050 (statutory; re-verify against the 2026 instructions)
    },
    formula: (() => {
      const base: Expr = max0(fact("stateTaxableIncome"));
      return {
        kind: "if",
        cond: le(base, param("zeroBracketTop")),
        then: money("0"),
        else: rd(
          printedSchedule(base, [
            { thresholdCents: "2605000", fixedCents: "33200", rate: { num: "275", den: "10000" } },
          ]),
        ),
      } as Expr;
    })(),
  },
  {
    id: "us.oh.business_income_tax",
    version: 1,
    jurisdiction: "us.oh",
    title: "Ohio business income tax — flat 3% of taxable business income after the Business Income Deduction (IT 1040 line 8b)",
    citation: {
      source: "ORC 5747.02(A)(4)(a); 2025 Ohio Schedule of Business Income, Parts 2-3",
      section: "R.C. 5747.02(A)(4); Schedule of Business Income lines 11-16",
      url: "https://codes.ohio.gov/ohio-revised-code/section-5747.02",
      excerpt:
        "Statute: 'the tax imposed by this section on taxable business income shall equal three per cent' (flat, unchanged by HB 96 — confirmed for 2025 and 2026). 2025 Schedule of Business Income (verbatim): Part 2 BUSINESS INCOME DEDUCTION line 11 'Enter the lesser of line 10 above or Ohio IT 1040, line 1. If negative, enter zero'; line 12 'Enter $250,000 if filing status is single or married filing jointly; OR Enter $125,000 if filing status is married filing separately'; line 13 'Enter the lesser of line 11 or line 12' → Schedule of Adjustments line 13 deduction. Part 3: line 14 = line 11 minus line 13; line 15 taxable business income = 'the lesser of line 14 above or Ohio IT 1040, line 5' → IT 1040 line 6; line 16 = 'multiply line 15 by 3% (.03)' → IT 1040 line 8b. Business income (Part 1) is the Schedule B/C/D/E/F + guaranteed-payment + § 4797 total per R.C. 5747.01(B); the 20%-or-greater-owner compensation rule applies. INPUT: ohTaxableBusinessIncome = the already-composed Schedule line 15 (the composer runs the BID arithmetic from FAGI, business income, and filing status; the caps are this rule's parameters). Unused exemption amounts reduce taxable business income under (A)(4)(b) via the line 5/6 lesser-of mechanics.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      bidCap: { value: "25000000", type: "money" }, // $250,000 single/MFJ
      bidCapMfs: { value: "12500000", type: "money" }, // $125,000 MFS
      rate: { value: "3", type: "int" }, // 3%
    },
    formula: rd({
      kind: "mulRate",
      base: max0(fact("ohTaxableBusinessIncome")),
      rate: { num: "3", den: "100" },
      round: "half-up",
    }),
  },
  {
    id: "us.oh.exemption_amount",
    version: 1,
    jurisdiction: "us.oh",
    title: "Ohio personal and dependent exemptions — 2025 MAGI-tiered amount per exemption (IT 1040 line 4)",
    citation: {
      source: "ORC 5747.025 (2025 Am. Sub. H.B. 96); 2025 Ohio IT 1040 instructions p. 17 (line 4 table)",
      section: "R.C. 5747.025; IT 1040 line 4",
      url: "https://codes.ohio.gov/ohio-revised-code/section-5747.025",
      excerpt:
        "2025 instructions line 4 table (verbatim): 'Modified Adjusted Gross Income $40,000 or less — Exemption Amount $2,400; $40,001-$80,000 — $2,150; $80,001-$749,999 — $1,900; $750,000 or greater — $0.' (Statutory base amounts $2,350/$2,100/$1,850 per 5747.025(A), indexed to $2,400/$2,150/$1,900 for 2025 under (C); the $0-above-$750,000 tier is NEW for 2025 per HB 96, and the cap drops to $500,000 for 2026 — 2026 indexed amounts were unpublished at encoding, so this rule is TY2025-only and refuses for 2026.) MAGI = Ohio adjusted gross income (line 3) PLUS the business income deduction (Schedule of Adjustments line 13) — booklet p. 8, verbatim. Exemptions: self (unless claimable as a dependent on another return — then $0 for self, per the booklet's Patrick example), spouse if filing jointly and not claimable elsewhere, and each federal dependent (Schedule of Dependents). Inputs: ohModifiedAgi, ohExemptionCount (the IT 1040 line 4 box count).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      tier1Max: { value: "4000000", type: "money" }, // $40,000 → $2,400
      tier2Max: { value: "8000000", type: "money" }, // $80,000 → $2,150
      zeroTierFloor: { value: "75000000", type: "money" }, // $750,000+ → $0
      amount1: { value: "240000", type: "money" },
      amount2: { value: "215000", type: "money" },
      amount3: { value: "190000", type: "money" },
    },
    formula: (() => {
      const magi: Expr = fact("ohModifiedAgi");
      const perExemption: Expr = {
        kind: "if",
        cond: le(magi, param("tier1Max")),
        then: param("amount1"),
        else: {
          kind: "if",
          cond: le(magi, param("tier2Max")),
          then: param("amount2"),
          else: {
            kind: "if",
            cond: lt(magi, param("zeroTierFloor")),
            then: param("amount3"),
            else: money("0"),
          },
        },
      };
      return { kind: "mulInt", base: perExemption, count: fact("ohExemptionCount") } as Expr;
    })(),
  },
  {
    id: "us.oh.joint_filing_credit",
    version: 1,
    jurisdiction: "us.oh",
    title: "Ohio joint filing credit — 20/15/10/5% of tax after earlier credits, max $650 (Schedule of Credits line 12)",
    citation: {
      source: "ORC 5747.05(E) (2025 Am. Sub. H.B. 96); 2025 Ohio Schedule of Credits instructions p. 29 (line 12)",
      section: "R.C. 5747.05(E); Schedule of Credits line 12",
      url: "https://codes.ohio.gov/ohio-revised-code/section-5747.05",
      excerpt:
        "2025 line 12 instructions (verbatim): 'To qualify, you and your spouse must each have at least $500 of qualifying income, jointly file your return, and have an MAGI less than $750,000. Qualifying income is any amount included in Ohio adjusted gross income (AGI), other than the following: Interest; Dividends and distributions; Capital gains; AND Rents and royalties.' Amounts deducted on the Schedule of Adjustments (business income via the BID, Social Security, railroad retirement, uniformed-services retirement) are NOT in Ohio AGI and thus NOT qualifying income — a spouse whose only income is deducted business income does NOT qualify (the booklet's Kevin & Krysten example). 'The credit equals a percentage of your tax liability prior to the application of the credit. The maximum credit per return is $650. The percentage used is based on your MAGI less exemptions: 0-$25,000: 20% of line 11; $25,001-$50,000: 15%; $50,001-$75,000: 10%; $75,001-$749,999: 5%.' The base is Schedule of Credits LINE 11 (tax less the line 2-9 credits: retirement/lump-sum/senior/child-care/displaced-worker/campaign/exemption credits subtract FIRST per the R.C. 5747.98 ordering). The $750,000 MAGI cap is NEW for 2025 (statute: 'less than seven hundred fifty thousand dollars for taxable years beginning in 2025 or less than five hundred thousand dollars for taxable years beginning in 2026 or thereafter'). Inputs: ohTaxLessCredits (line 11), ohModifiedAgi + ohExemptionCount (tier + cap), ohBothSpousesHaveQualifyingIncome (attested; conservative default false → $0). Include a statement listing each spouse's qualifying income (procedural).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      magiCap: { value: "75000000", type: "money" }, // $750,000 (2025; $500,000 for 2026)
      creditCap: { value: "65000", type: "money" }, // $650
      tier1Max: { value: "2500000", type: "money" }, // $25,000 → 20%
      tier2Max: { value: "5000000", type: "money" }, // $50,000 → 15%
      tier3Max: { value: "7500000", type: "money" }, // $75,000 → 10%; above → 5%
    },
    formula: (() => {
      const pct = (num: string): Expr => ({
        kind: "mulRate",
        base: max0(fact("ohTaxLessCredits")),
        rate: { num, den: "100" },
        round: "half-up",
      });
      const tiered: Expr = {
        kind: "if",
        cond: le(magiLessExemptions, param("tier1Max")),
        then: pct("20"),
        else: {
          kind: "if",
          cond: le(magiLessExemptions, param("tier2Max")),
          then: pct("15"),
          else: {
            kind: "if",
            cond: le(magiLessExemptions, param("tier3Max")),
            then: pct("10"),
            else: pct("5"),
          },
        },
      };
      return {
        kind: "if",
        cond: {
          kind: "and",
          args: [
            isStatus("mfj"),
            fact("ohBothSpousesHaveQualifyingIncome"),
            lt(fact("ohModifiedAgi"), param("magiCap")),
          ],
        },
        then: rd({ kind: "min", args: [tiered, param("creditCap")] }),
        else: money("0"),
      } as Expr;
    })(),
  },
  {
    id: "us.oh.retirement_income_credit",
    version: 1,
    jurisdiction: "us.oh",
    title: "Ohio retirement income credit — Table 2 tiers, max $200 per return (Schedule of Credits line 2)",
    citation: {
      source: "ORC 5747.055(B); 2025 Ohio Schedule of Credits instructions pp. 28, 44 (Table 2)",
      section: "R.C. 5747.055(B); Schedule of Credits line 2",
      url: "https://codes.ohio.gov/ohio-revised-code/section-5747.055",
      excerpt:
        "2025 gates (verbatim): 'Your MAGI less exemptions is less than $100,000; You received income from a pension, profit-sharing, or retirement plan (such as traditional IRAs or 401(k) plans); This income was received on account of retirement; This income is included in your Ohio adjusted gross income; AND You have not previously taken the Ohio lump sum retirement credit.' Table 2 (p. 44, verbatim — total of BOTH spouses' eligible retirement income on a joint return): '$0-$500: $0; $501-$1,500: $25; $1,501-$3,000: $50; $3,001-$5,000: $80; $5,001-$8,000: $130; $8,001 or more: $200.' 'The maximum credit per return is $200.' Amounts DEDUCTED on the Schedule of Adjustments (Social Security, railroad, uniformed-services retirement income) do NOT qualify — only retirement income still inside Ohio AGI counts (ohEligibleRetirementIncome input). The lump-sum-history disqualifier is attested by the input being supplied (a filer who previously took the lump sum retirement credit must pass $0 — disclosed). Nonrefundable; ordering per R.C. 5747.98 (this credit or the lump-sum retirement credit comes first).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      magiLessExemptionsCap: { value: "10000000", type: "money" }, // $100,000
      tier1Max: { value: "50000", type: "money" }, // $500 → $0
      tier2Max: { value: "150000", type: "money" }, // $1,500 → $25
      tier3Max: { value: "300000", type: "money" }, // $3,000 → $50
      tier4Max: { value: "500000", type: "money" }, // $5,000 → $80
      tier5Max: { value: "800000", type: "money" }, // $8,000 → $130; above → $200
      credit2: { value: "2500", type: "money" },
      credit3: { value: "5000", type: "money" },
      credit4: { value: "8000", type: "money" },
      credit5: { value: "13000", type: "money" },
      creditMax: { value: "20000", type: "money" },
    },
    formula: (() => {
      const ri: Expr = max0(fact("ohEligibleRetirementIncome"));
      const tier = (max: string, then: Expr, next: Expr): Expr => ({
        kind: "if",
        cond: le(ri, param(max)),
        then,
        else: next,
      });
      return {
        kind: "if",
        cond: lt(magiLessExemptions, param("magiLessExemptionsCap")),
        then: tier("tier1Max", money("0"),
          tier("tier2Max", param("credit2"),
            tier("tier3Max", param("credit3"),
              tier("tier4Max", param("credit4"),
                tier("tier5Max", param("credit5"), param("creditMax")))))),
        else: money("0"),
      } as Expr;
    })(),
  },
  {
    id: "us.oh.senior_citizen_credit",
    version: 1,
    jurisdiction: "us.oh",
    title: "Ohio senior citizen credit — $50 per return, age 65+, MAGI less exemptions under $100,000 (Schedule of Credits line 4)",
    citation: {
      source: "ORC 5747.055(F); 2025 Ohio Schedule of Credits instructions p. 28 (line 4)",
      section: "R.C. 5747.055(F); Schedule of Credits line 4",
      url: "https://codes.ohio.gov/ohio-revised-code/section-5747.055",
      excerpt:
        "2025 line 4 (verbatim): 'To qualify, all of the following must be true: Your MAGI less exemptions is less than $100,000; You were 65 or older at the end of the tax year; AND You have not previously taken the Ohio lump sum distribution credit. The credit is equal to $50 per return.' One $50 per RETURN (not per spouse). The lump-sum-distribution-history disqualifier is not separately modeled — a filer who ever claimed the one-time lump sum distribution credit (Schedule of Credits line 5) is permanently ineligible and must not use this target (disclosed; conservative for everyone else since isAge65OrOlder defaults false). Nonrefundable.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      credit: { value: "5000", type: "money" }, // $50 per return
      magiLessExemptionsCap: { value: "10000000", type: "money" }, // $100,000
    },
    formula: {
      kind: "if",
      cond: {
        kind: "and",
        args: [fact("isAge65OrOlder"), lt(magiLessExemptions, param("magiLessExemptionsCap"))],
      },
      then: param("credit"),
      else: money("0"),
    },
  },
  {
    id: "us.oh.exemption_credit",
    version: 1,
    jurisdiction: "us.oh",
    title: "Ohio exemption credit — $20 per exemption when MAGI less exemptions is under $30,000 (Schedule of Credits line 9)",
    citation: {
      source: "ORC 5747.022; 2025 Ohio Schedule of Credits instructions p. 29 (line 9)",
      section: "R.C. 5747.022; Schedule of Credits line 9",
      url: "https://codes.ohio.gov/ohio-revised-code/section-5747.022",
      excerpt:
        "2025 line 9 (verbatim): 'To qualify, your modified adjusted gross income (MAGI) less exemptions must be less than $30,000. The credit equals $20 for each exemption claimed on your return.' Nonrefundable; uses the same exemption count as IT 1040 line 4 (ohExemptionCount). This is Ohio's surviving low-income credit mechanism — the former low income credit does not exist on the 2025 return.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      perExemption: { value: "2000", type: "money" }, // $20
      magiLessExemptionsCap: { value: "3000000", type: "money" }, // $30,000
    },
    formula: {
      kind: "if",
      cond: lt(magiLessExemptions, param("magiLessExemptionsCap")),
      then: { kind: "mulInt", base: param("perExemption"), count: fact("ohExemptionCount") },
      else: money("0"),
    },
  },
  {
    id: "us.oh.eic",
    version: 1,
    jurisdiction: "us.oh",
    title: "Ohio earned income credit — 30% of the federal EIC, nonrefundable (Schedule of Credits line 13)",
    citation: {
      source: "ORC 5747.71; 2025 Ohio Schedule of Credits instructions p. 30 (line 13)",
      section: "R.C. 5747.71; Schedule of Credits line 13",
      url: "https://codes.ohio.gov/ohio-revised-code/section-5747.71",
      excerpt:
        "2025 line 13 (verbatim): 'Your nonrefundable Ohio earned income credit (EIC) equals 30% of your federal EIC (federal 1040 and 1040-SR, line 27a). See R.C. 5747.71.' No cap and no separate phase-out beyond the federal EIC's own; NONREFUNDABLE (it sits in the Schedule of Credits line 12-35 block whose total cannot exceed the remaining tax — the composer caps it via the line 37 floor). Ohio has NO age-decoupled variant (unlike Illinois' 35 ILCS 5/212(b-5)/(b-10) or New Jersey's flat $260): 30% of the ordinary federal EIC only. Ohio has NO child tax credit for 2025 (the proposed HB 96 CTC was removed before enactment; verified by absence from the 2025 form and booklet).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      pctOfFederal: { value: "30", type: "int" },
    },
    formula: rd({
      kind: "mulRate",
      base: ruleRef("us.federal.eitc"),
      rate: { num: "30", den: "100" },
      round: "half-up",
    }),
  },
  {
    id: "us.oh.cdcc",
    version: 1,
    jurisdiction: "us.oh",
    title: "Ohio child care & dependent care credit — 100% of the federal tentative credit under $20,000 MAGI, 25% of the allowed credit to $40,000 (Schedule of Credits line 6)",
    citation: {
      source: "ORC 5747.054; 2025 Ohio Schedule of Credits instructions pp. 28, 45 (line 6 worksheet)",
      section: "R.C. 5747.054; Schedule of Credits line 6",
      url: "https://codes.ohio.gov/ohio-revised-code/section-5747.054",
      excerpt:
        "2025 worksheet (p. 45, verbatim): line 1 MAGI — 'If line 1 is $40,000 or more, STOP. You do not qualify for this credit'; line 2 'Enter the amount on your federal form 2441, line 9c'; line 3 'Enter 25% of the amount on your federal form 2441, line 11'; line 4 'If line 1 of this worksheet is less than $20,000, enter the amount from line 2. If line 1 is equal to or greater than $20,000 but less than $40,000, enter the amount from line 3.' NOTE THE ASYMMETRY (as printed): under $20,000 MAGI the credit is 100% of 2441 LINE 9c (the tentative credit BEFORE the federal liability limit — so a low-income filer with zero federal liability still gets the full Ohio amount); $20,000-$39,999 uses 25% of LINE 11 (the liability-LIMITED federal credit). Inputs are the transcribed 2441 amounts: ohFederalCdccTentative (line 9c; equals the line 9a tentative credit unless prior-year-expense line 9b amounts exist) and ohFederalCdccAllowed (line 11). Gate: MAGI (not MAGI-less-exemptions) < $40,000, per the printed worksheet and the line-6 instruction 'your MAGI must be less than $40,000 and you must have claimed the federal credit for child and dependent care expenses on federal form 2441.' Nonrefundable.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      fullPctMagiCap: { value: "2000000", type: "money" }, // $20,000 (under → 100% of 2441 line 9c)
      magiCap: { value: "4000000", type: "money" }, // $40,000 (at/over → $0)
    },
    formula: {
      kind: "if",
      cond: lt(fact("ohModifiedAgi"), param("fullPctMagiCap")),
      then: rd(max0(fact("ohFederalCdccTentative"))),
      else: {
        kind: "if",
        cond: lt(fact("ohModifiedAgi"), param("magiCap")),
        then: rd({
          kind: "mulRate",
          base: max0(fact("ohFederalCdccAllowed")),
          rate: { num: "25", den: "100" },
          round: "half-up",
        }),
        else: money("0"),
      },
    },
  },
  {
    id: "us.oh.parameters",
    version: 1,
    jurisdiction: "us.oh",
    title: "Ohio 2025 return parameters — filing thresholds, remaining credits, adjustments, SD 100 and municipal disclosures (IT 1040)",
    citation: {
      source:
        "2025 Ohio IT 1040 instruction booklet (tax.ohio.gov, 'accurate as of November 27, 2025', read 2026-08-02); ORC 5747.98 (credit ordering); ORC 5748 (school district tax)",
      section: "IT 1040; Schedule of Adjustments; Schedule of Credits; SD 100",
      url: "https://dam.assets.ohio.gov/image/upload/v1767095693/tax.ohio.gov/forms/ohio_individual/individual/2025/it1040-booklet.pdf",
      excerpt:
        "WHO OWES NOTHING (booklet p. 13, verbatim): 'You do not have to file an Ohio income tax return if: Your Ohio adjusted gross income (Ohio IT 1040, line 3) is less than or equal to $0; The total of your senior citizen credit, lump sum distribution credit, and joint filing credit (Ohio Schedule of Credits, lines 4, 5 and 12) is equal to or exceeds your income tax liability (Ohio IT 1040, line 8c) and you are not liable for school district income tax; OR Your exemption amount (Ohio IT 1040, line 4) is the same as or more than your Ohio adjusted gross income (Ohio IT 1040, line 3).' Above $28,450 FAGI the Department recommends filing even at $0 tax (delinquency billing avoidance)."
        + "\n\nSCHEDULE OF ADJUSTMENTS (2025 line set): additions include non-Ohio state/local government interest and dividends (line 1), Ohio pass-through entity taxes excluded from FAGI (line 2), IRC 168(k)/179 depreciation add-back (line 9); deductions include the Business Income Deduction (line 13), taxable refunds of state/local income taxes (line 15), TAXABLE SOCIAL SECURITY (line 16 — fully deducted, so Social Security is never taxed by Ohio), railroad benefits (line 17), Ohio public-obligation interest (line 18), STABLE/529 contributions (lines 20/37 — 529 up to $4,000 per beneficiary per year, unlimited carryforward), disaster-work income (line 21), military pay for residents stationed outside Ohio (line 32), uniformed services retirement income (line 34, fully deducted), Ohio educator expenses up to $300 (line 39, increased for 2025), unreimbursed medical care expenses over 7.5% of OAGI (line 44 worksheet), Ohio adoption grants (line 23), pregnancy resource center contributions (line 25, NEW for 2025)."
        + "\n\nREMAINING SCHEDULE OF CREDITS ITEMS (each transcribed, not oracle targets): lump sum retirement credit (line 3, one-time, Table 1 age multiple — bars the retirement income credit forever) and lump sum distribution credit (line 5, one-time, age multiple × $50 — bars the $50 senior credit forever); displaced worker training credit (line 7, lesser of $500 or 50% of training paid); campaign contribution credit (line 8, up to $50/$100 MFJ for statewide/General Assembly candidates — LAST YEAR: 'will no longer be available after tax year 2025', repealed by HB 96); home school expenses credit (line 14, $250 PER QUALIFYING STUDENT for 2025, was per return); scholarship donation credit (line 15, lesser of $750 or SGO donations, $1,500 total MFJ when both spouses donate); nonchartered nonpublic school tuition credit (line 16, lesser of tuition or $1,000 if FAGI under $50,000 / $1,500 if $50,000+, one per return); certificate credits (lines 17-35); nonresident credit (line 38, IT NRC) and resident credit for other states' taxes (line 39, IT RC); refundable credits (lines 41-46: refundable historic preservation, job creation, PASS-THROUGH ENTITY CREDIT from IT K-1s (line 43 — where Ohio's own withheld/PTE taxes land), motion picture, venture capital)."
        + "\n\nCREDIT ORDERING (R.C. 5747.98, verbatim): 'a taxpayer shall claim any credits to which the taxpayer is entitled in the following order: Either the retirement income credit... or the lump sum retirement income credits...; Either the senior citizen credit... or the lump sum distribution credit...; The dependent care credit...' — the Schedule of Credits line order IS the statutory order; the joint filing credit applies to line 11 (tax less the line 2-9 credits), and line 37 floors at zero (nonrefundable credits never refund)."
        + "\n\nSCHOOL DISTRICT INCOME TAX (SD 100, separate return — NOT in the us.oh targets): 'School district income tax is levied based on one of the following methods: The traditional tax base uses modified adjusted gross income (MAGI) less exemptions... The earned income tax base is limited by MAGI' (booklet pp. 57-58); district-specific rates (0.25%-2%+, ~600 districts, 'T' or 'E' base per the pp. 49-56 list); compute separately and disclose when the taxpayer's district levies one (tax.ohio.gov/Finder). MUNICIPAL INCOME TAXES: separate city levies administered by cities/RITA/CCA, never on the IT 1040 ('Do not include any city income tax withheld')."
        + "\n\nMISC: rounding 'Round all figures to the nearest dollar'; refund/payment of $1.00 or less is not issued/not required; interest rate for calendar year 2026 is 7%; estimated-tax interest penalty via IT/SD 2210 (line 11); use tax on untaxed out-of-state purchases = purchases × the COUNTY rate (6.5%-8.25%, printed county table p. 46) on IT 1040 line 12 (county-specific — transcribed, not an oracle target); Ohio Nonresident Statement replaced form IT NRS beginning 2025 (checkbox on the IT 1040 itself). TY2026 enacted changes: single 2.75% rate (us.oh.income_tax v2), exemption/JFC MAGI caps drop to $500,000, campaign credit gone.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      filingRecommendationFagi: { value: "2845000", type: "money" }, // $28,450
      homeSchoolCreditPerStudent: { value: "25000", type: "money" }, // $250 (2025: per student)
      scholarshipDonationCap: { value: "75000", type: "money" }, // $750 ($1,500 MFJ both donate)
      nonchartered_tuition_under50k: { value: "100000", type: "money" }, // $1,000 (FAGI < $50,000)
      nonchartered_tuition_50kPlus: { value: "150000", type: "money" }, // $1,500
      displacedWorkerCap: { value: "50000", type: "money" }, // $500
      campaignContributionCap: { value: "5000", type: "money" }, // $50 ($100 MFJ; last year 2025)
      educatorExpenseDeductionCap: { value: "30000", type: "money" }, // $300 (2025)
      collegeAdvantage529PerBeneficiary: { value: "400000", type: "money" }, // $4,000/beneficiary/year
      medicalExpenseFloorPct: { value: "75", type: "int" }, // 7.5% of OAGI (Schedule of Adjustments line 44)
      deMinimisRefundOrDue: { value: "100", type: "money" }, // $1.00
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: use lookup_tax_parameter for the Ohio amounts; tax → us.oh.income_tax + us.oh.business_income_tax, exemptions → us.oh.exemption_amount, credits → us.oh.joint_filing_credit / us.oh.retirement_income_credit / us.oh.senior_citizen_credit / us.oh.exemption_credit / us.oh.eic / us.oh.cdcc; SD 100 school district tax and municipal taxes are separate levies — compute and disclose",
    },
  },
];
