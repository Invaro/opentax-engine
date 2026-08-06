/**
 * Georgia deep state pack — TY2025, encoded from primary sources 2026-08-03:
 * 2025 IT-511 booklet + Form 500 (Rev. 07/09/25, dor.georgia.gov, read
 * page-by-page), enrolled 2025 HB 111 (5.19% retroactive rate cut) and
 * HB 136 (CDCC 50% for TY2025; the $250 under-6 CTC starts TY2026) from
 * legis.ga.gov, O.C.G.A. §§ 48-7-26 / 48-7-27 / 48-7A-3. Tax Foundation's
 * 2025 survey still prints the pre-HB 111 5.39% — the act text and printed
 * form are dispositive.
 *
 * Georgia starts from federal AGI (IRC as of Jan 1, 2025 — OBBBA NOT
 * adopted, booklet p.5 verbatim in the parameters rule). No personal
 * exemptions for filers since 2024; $4,000 per dependent (incl. unborn);
 * the distinctive pieces are the per-spouse retirement exclusion
 * ($35,000/$65,000 with a $5,000 earned-income allowance) and the Low
 * Income Credit's per-exemption table.
 */
import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, isStatus, money } from "./state-helpers.js";

const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const add = (...args: Expr[]): Expr => ({ kind: "add", args });
const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const param = (name: string): Expr => ({ kind: "param", name });
const lt = (left: Expr, right: Expr): Expr => ({ kind: "cmp", op: "lt", left, right });

export const gaRules: Rule[] = [
  {
    id: "us.ga.income_tax",
    version: 2, // v1 was the thin state-other.ts flat rule; v2+ are the deep pack
    jurisdiction: "us.ga",
    title: "Georgia income tax — TY2025: 5.19% flat on Georgia taxable income (Form 500 line 16, HB 111 retroactive)",
    citation: {
      source:
        "O.C.G.A. § 48-7-20(a.1) as rewritten by 2025 HB 111 (enrolled text, legis.ga.gov; eff. 7-1-2025, applicable to taxable years beginning on/after 1-1-2025); 2025 IT-511 pp. 9, 17 (line 16)",
      section: "O.C.G.A. § 48-7-20(a.1); Form 500 line 16",
      url: "https://www.legis.ga.gov/legislation/69464",
      excerpt:
        "HB 111 (enrolled, verbatim): 'the tax imposed pursuant to subsection (a) of this Code section shall be 5.19 percent for taxable years beginning on or after January 1, 2025; provided, however, that such rate shall be reduced by 0.10 percent annually beginning on January 1, 2026, until the rate reaches 4.99 percent, provided that such annual reductions in the tax rate shall be subject to delays as provided in paragraph (2)' — the step-downs are CONDITIONAL (Governor's revenue estimate +3%, prior-year collections above each of the three preceding years, Revenue Shortfall Reserve coverage; OPB reports by December 1). Printed 2025 IT-511 (verbatim): 'Effective January 1, 2025, the income tax rate is 5.19%'; Form 500 line 16: 'Tax (Multiply Line 15c by 5.19%. Round to the nearest dollar).' Surveys printed before HB 111 (signed after the year began, retroactive) still show 5.39% — the act text wins. TY2026: superseded by 2026 HB 463, which per the Governor's office 'lowers Georgia's state income tax rate from 5.19% to 4.99%, beginning January 1, 2026' and raises standard deductions — the ENROLLED HB 463 text was not yet verified at encoding, so this rule is TY2025-only and a 2026 asOf REFUSES rather than guessing between 5.09%/4.99%. No Georgia tax table exists — the flat computation is the method; whole-dollar rounding ('Round to the nearest dollar', half-up). Input: stateTaxableIncome = Form 500 line 15c Georgia taxable income (GA AGI − standard/itemized deduction − $4,000-per-dependent exemption − GA NOL). Part-year/nonresidents compute the base on Schedule 3 (ratio proration — out of scope, resident target). Filing threshold: required to file when required federally or income exceeds the standard deduction.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    formula: rd({
      kind: "mulRate",
      base: max0(fact("stateTaxableIncome")),
      rate: { num: "519", den: "10000" },
      round: "half-up",
    }),
  },
  {
    id: "us.ga.standard_deduction",
    version: 1,
    jurisdiction: "us.ga",
    title: "Georgia standard deduction — $24,000 MFJ, $12,000 all other statuses; forced itemizing when federal itemized (Form 500 line 11)",
    citation: {
      source: "O.C.G.A. § 48-7-27(a)(1)(B); 2025 IT-511 p. 16; 2025 Form 500 line 11",
      section: "O.C.G.A. § 48-7-27(a)(1)(B); Form 500 line 11",
      url: "https://dor.georgia.gov/it-511-individual-income-tax-instruction-booklet",
      excerpt:
        "Statute (verbatim): '(i) In the case of a married couple filing a joint return, $24,000.00; or (ii) In the case of a single taxpayer, head of household, or married taxpayer filing a separate return, $12,000.00.' Printed 2025 table: MFJ $24,000; Single, MFS, HEAD OF HOUSEHOLD, and Qualifying surviving spouse ALL $12,000 — Georgia gives HOH no extra amount (a common cross-state error). Form 500 line 11 caption: 'Enter $12,000 if the filing status from Line 5 is A, C, or D. If the filing status is B, enter $24,000. Use EITHER Line 11 OR Line 12c.' FORCED ELECTION (line 11 instructions, verbatim): 'Leave Line 11 blank if you itemize deductions on your Federal return' — a federal itemizer MUST use Georgia itemized deductions (federal Schedule A total less the line 12b adjustments: state income taxes and the disallowed-SALT formula), like Virginia and unlike North Carolina. No age/blind additions; no personal exemptions for filers ('Line 6: Reserved' — the 2024 restructure folded them into the deduction amounts). TY2026: HB 463 raises the amounts — re-verify before encoding 2026.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      joint: { value: "2400000", type: "money" }, // $24,000 MFJ only
      other: { value: "1200000", type: "money" }, // $12,000 single/MFS/HOH/QSS
    },
    formula: {
      kind: "if",
      cond: isStatus("mfj"),
      then: param("joint"),
      else: param("other"),
    },
  },
  {
    id: "us.ga.dependent_exemption",
    version: 1,
    jurisdiction: "us.ga",
    title: "Georgia dependent exemption — $4,000 per dependent, including unborn dependents (Form 500 line 14)",
    citation: {
      source: "O.C.G.A. § 48-7-26; 2025 IT-511 p. 16 (lines 7a-7d, 14)",
      section: "O.C.G.A. § 48-7-26(b); Form 500 lines 7a-7c, 14",
      url: "https://law.justia.com/codes/georgia/title-48/chapter-7/article-2/section-48-7-26/",
      excerpt:
        "Statute (verbatim): 'Each taxpayer shall be allowed as a deduction in computing his or her Georgia taxable income a personal exemption in the amount of $4,000.00 for each dependent of such taxpayer', with 'dependent' as defined in the IRC 'provided, however, that any unborn child with a detectable human heartbeat ... shall qualify as a dependent minor.' Form 500: line 7a qualified dependents ('Do not include yourself, your spouse, and/or dependent unborn children'), line 7b unborn dependents ('cannot be claimed if the child is born during the same tax year' — a child born during the year goes on 7a instead), line 7c = 7a + 7b; line 14 = 'Enter the number from Line 7c ... Multiply by $4,000.' NO exemption for the taxpayer or spouse (line 6 is Reserved). MFS: only one spouse may claim each dependent, under the pre-TCJA federal entitlement rules. Input: gaDependentCount = the line 7c total.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      perDependent: { value: "400000", type: "money" }, // $4,000
    },
    formula: { kind: "mulInt", base: param("perDependent"), count: fact("gaDependentCount") },
  },
  {
    id: "us.ga.retirement_exclusion",
    version: 1,
    jurisdiction: "us.ga",
    title: "Georgia retirement income exclusion — $35,000 (62-64/disabled) or $65,000 (65+) per spouse, $5,000 earned-income allowance (Schedule 1)",
    citation: {
      source: "O.C.G.A. § 48-7-27(a)(5) (earned-income cap $5,000 per 2023 SB 56); 2025 IT-511 pp. 21, 24 (Schedule 1 page 2 worksheet)",
      section: "O.C.G.A. § 48-7-27(a)(5); Form 500 Schedule 1 line 7",
      url: "https://law.justia.com/codes/georgia/title-48/chapter-7/article-2/section-48-7-27/",
      excerpt:
        "Statute (verbatim): 'retirement income from any source not to exceed an exclusion amount of $35,000.00 for each taxpayer' who 'Is 62 years of age or older but less than 65 years of age during any part of the taxable year' or 'Is permanently and totally disabled', 'or an amount of $65,000.00 for each taxpayer' who 'Is 65 years of age or older during any part of the year.' PER SPOUSE (verbatim): 'In the case of a married couple filing jointly, each spouse shall if otherwise qualified be individually entitled to exclude retirement income received by that spouse up to the exclusion amount' — never shared; jointly-owned property income allocates 50/50. Retirement income includes 'income from military retirement, interest income, dividend income, net income from rental property, capital gains income, income from royalties, income from pensions and annuities, and no more than $5,000.00 of an individual's earned income' — the $5,000 earned cap (raised from $4,000 by SB 56 for TY2024+) is INSIDE the exclusion, per the printed Schedule 1 page 2 worksheet ('Maximum Earned Income ... 5,000'). Social Security/RRB are NOT in this exclusion — they subtract fully and separately. Lottery/gambling income never qualifies; business income subject to SE/FICA tax is earned, not unearned. This rule computes each spouse's min(unearned retirement + min(earned, $5,000), tier cap) and sums; tiers are attested via the gaExclusionTier enums (conservative default none → $0). Part-year/nonresident proration and the date-of-birth documentation requirement are the caller's. TY2027: HB 463 raises the cap to $70,000 (per the Governor's office) — not applicable here.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      cap62to64: { value: "3500000", type: "money" }, // $35,000
      cap65plus: { value: "6500000", type: "money" }, // $65,000
      earnedIncomeCap: { value: "500000", type: "money" }, // $5,000 inside the exclusion
    },
    formula: (() => {
      const perSpouse = (tierFact: string, retirement: string, earned: string): Expr => {
        const capForTier: Expr = {
          kind: "match",
          on: fact(tierFact),
          cases: [
            { when: "none", value: money("0") },
            { when: "62to64OrDisabled", value: param("cap62to64") },
            { when: "65plus", value: param("cap65plus") },
          ],
        };
        return {
          kind: "min",
          args: [
            add(max0(fact(retirement)), { kind: "min", args: [max0(fact(earned)), param("earnedIncomeCap")] }),
            capForTier,
          ],
        };
      };
      return add(
        perSpouse("gaExclusionTier", "gaRetirementIncome", "gaRetirementEarnedIncome"),
        perSpouse("gaSpouseExclusionTier", "gaSpouseRetirementIncome", "gaSpouseRetirementEarnedIncome"),
      );
    })(),
  },
  {
    id: "us.ga.low_income_credit",
    version: 1,
    jurisdiction: "us.ga",
    title: "Georgia Low Income Credit — per-exemption table by federal AGI under $20,000 (Form 500 lines 17a-17c)",
    citation: {
      source: "O.C.G.A. § 48-7A-3; 2025 IT-511 pp. 17, 35 (Low Income Credit Worksheet + table)",
      section: "O.C.G.A. § 48-7A-3; Form 500 line 17",
      url: "https://dor.georgia.gov/it-511-individual-income-tax-instruction-booklet",
      excerpt:
        "2025 worksheet (verbatim): line 2 'Enter the number of exemptions. Exemptions are self, spouse and natural or legally adopted children' (NOT other dependents; 'dependents do not include those unborn with a detectable heartbeat'); line 3 'Enter 1 if you or your spouse is 65 or older; enter 2 if you and your spouse are 65 or older' (the statute's 65+ DOUBLE credit, implemented as extra exemptions — 65+ filers get MORE, never barred); line 4 = 2+3; credit = line 4 × the table amount. PRINTED TABLE (verbatim, federal AGI): 'Under $6,000: $26; $6,000 but not more than $7,999: $20; $8,000 but not more than $9,999: $14; $10,000 but not more than $14,999: $8; $15,000 but not more than $19,999: $5' — $20,000+ gets nothing. GATES (p. 17 + statute): FAGI under $20,000; RESIDENT taxpayers; not claimed or claimable as a dependent on another return; not an inmate; statute § 48-7A-3(e): a food-stamp (SNAP) recipient for any part of the year is INELIGIBLE (the booklet omits this — statutory gate, attest before claiming); MFS filers get only what a joint return would have allowed; claim within 12 months. NONREFUNDABLE: 'The credit cannot exceed the taxpayer's income tax liability' (the composer caps via the line 22 total). Inputs: gaFederalAgi, gaLicExemptions (worksheet line 2), gaLic65Count (line 3; conservative defaults 0).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      tier1Max: { value: "600000", type: "money" }, // under $6,000 → $26
      tier2Max: { value: "800000", type: "money" }, // to $7,999 → $20
      tier3Max: { value: "1000000", type: "money" }, // to $9,999 → $14
      tier4Max: { value: "1500000", type: "money" }, // to $14,999 → $8
      tier5Max: { value: "2000000", type: "money" }, // to $19,999 → $5; $20,000+ → $0
      credit1: { value: "2600", type: "money" },
      credit2: { value: "2000", type: "money" },
      credit3: { value: "1400", type: "money" },
      credit4: { value: "800", type: "money" },
      credit5: { value: "500", type: "money" },
    },
    formula: (() => {
      const agi: Expr = fact("gaFederalAgi");
      const tier = (max: string, credit: string, next: Expr): Expr => ({
        kind: "if",
        cond: lt(agi, param(max)),
        then: param(credit),
        else: next,
      });
      const perExemption = tier("tier1Max", "credit1",
        tier("tier2Max", "credit2",
          tier("tier3Max", "credit3",
            tier("tier4Max", "credit4",
              tier("tier5Max", "credit5", money("0"))))));
      return add(
        { kind: "mulInt", base: perExemption, count: fact("gaLicExemptions") },
        { kind: "mulInt", base: perExemption, count: fact("gaLic65Count") },
      );
    })(),
  },
  {
    id: "us.ga.cdcc",
    version: 1,
    jurisdiction: "us.ga",
    title: "Georgia Child and Dependent Care Expense Credit — 50% of the allowed federal § 21 credit (IND-CR 202, TY2025+ per HB 136)",
    citation: {
      source: "O.C.G.A. § 48-7-29.10 as amended by 2025 HB 136 § 1-1 (applicable to taxable years beginning on/after 1-1-2025); 2025 IND-CR 202; IT-511 p. 9",
      section: "O.C.G.A. § 48-7-29.10; IND-CR 202 → Form 500 line 20",
      url: "https://www.legis.ga.gov/legislation/69535",
      excerpt:
        "HB 136 (enrolled, verbatim): 'The amount of such credit shall be equal to 50 percent of the amount of the credit provided for in Section 21 of the Internal Revenue Code which is claimed and allowed pursuant to the Internal Revenue Code' (strikes the prior 30%). Effective-date section: 'Section 1-1 of this Act shall be applicable to all taxable years beginning on or after January 1, 2025' — the 50% rate IS in force for TY2025, confirmed by the printed 2025 IND-CR 202 ('Georgia allowable rate ... 50%') and the What's New page ('The amount of the credit has been increased to 50 percent'). Base = the federal § 21 credit CLAIMED AND ALLOWED (the liability-limited Form 2441 line 11 amount — input gaFederalCdccAllowed), NOT the tentative amount. Nonrefundable, no carryforward; flows through the IND-CR Summary to Form 500 line 20, capped with all credits at the line 16 tax. SEPARATE HB 136 items that start TY2026, never 2025 (verbatim: 'a taxpayer shall be allowed a credit ... in an amount equal to $250.00 for each qualifying child' UNDER AGE SIX, 'For taxable years beginning on or after January 1, 2026', nonrefundable, no carryforward — new § 48-7-29.27; plus the § 48-7-29.28 employer child-care credit): encode with the TY2026 pack after the 2026 forms publish.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      pctOfFederal: { value: "50", type: "int" },
    },
    formula: rd({
      kind: "mulRate",
      base: max0(fact("gaFederalCdccAllowed")),
      rate: { num: "50", den: "100" },
      round: "half-up",
    }),
  },
  {
    id: "us.ga.parameters",
    version: 1,
    jurisdiction: "us.ga",
    title: "Georgia 2025 return parameters — Schedule 1 adjustments, military exclusion, credits, conformity (Form 500)",
    citation: {
      source:
        "2025 IT-511 booklet + Form 500 Rev. 07/09/25 (dor.georgia.gov, read 2026-08-03); O.C.G.A. § 48-7-27; enrolled 2025 HB 111 / HB 136 (legis.ga.gov)",
      section: "Form 500 Schedule 1; IND-CR; Form 500 lines 12b, 18, 19",
      url: "https://dor.georgia.gov/it-511-individual-income-tax-instruction-booklet",
      excerpt:
        "CONFORMITY (IT-511 p. 5, verbatim): 'Georgia conforms to the Internal Revenue Code, as amended, provided for in federal law enacted on or before January 1, 2025. Georgia has not adopted the federal tax law changes in the federal One Big Beautiful Bill Act because the Act was signed on July 4, 2025' — OBBBA below-AGI items never flow (GA starts from federal AGI), and OBBBA above-AGI changes require Schedule 1 adjustments per DOR guidance; disclose when relevant. 'Georgia does not allow the 20% qualified business income deduction. (I.R.C. Section 199A). However, since Georgia starts with Federal AGI, no adjustment is necessary.'"
        + "\n\nSCHEDULE 1 SUBTRACTIONS (beyond the oracle targets): MILITARY RETIREMENT under-62 (§ 48-7-27(a)(5.1), verbatim): 'Up to $17,500.00 of income received by an individual who is less than 62 years of age paid to such individual as retirement benefits from military service ... and an additional amount of up to $17,500.00 of such income, provided that he or she has Georgia earned income otherwise included ... that exceeds $17,500.00' — per spouse if each qualifies; the printed Schedule 1 page 3 worksheet gates on 'Are you under the age of 62?'. US GOVERNMENT OBLIGATION interest (reduced by allocable expenses; FNMA/GNMA/FHLMC and repurchase-agreement interest is TAXABLE, never subtracted). SOCIAL SECURITY / Railroad Retirement Tiers 1 AND 2 fully subtracted. PATH2COLLEGE 529: 'cannot exceed $4,000 per beneficiary. If a married filing joint return is filed, then the amount cannot exceed $8,000 per beneficiary' (no income limit; § 48-7-27(a)(11.1)). Organ donation up to $25,000; 100% of HIGH-DEDUCTIBLE HEALTH PLAN premiums (§ 223 plans) not otherwise deducted (§ 48-7-27(a)(13.1)) — there is NO separate GA HSA subtraction and NO ABLE deduction ('No Deduction is allowed ... for any contribution made pursuant to the Georgia ABLE Program'). Other-state income tax refunds subtract; GEORGIA refunds never do. Hurricane Helene disaster-relief payments (TY2025-2029) and federal crop insurance proceeds (TY2025 only) subtract. SURPLUS REFUNDS (HB 112/HB 1000): 'Surplus refunds are not taxable for Georgia individual income tax purposes but may be Federally taxable.'"
        + "\n\nADDITIONS: non-Georgia municipal bond interest (and mutual-fund dividends derived from it); lump-sum distributions (Form 4972); federal NOL carryover deducted federally (GA NOL applies on line 15b instead, 80% limitation); loss carryovers from non-GA years. ITEMIZERS (line 12b): subtract state income taxes from the federal Schedule A total; when the federal $10,000/$5,000 SALT cap bound, the disallowed portion prorates by the printed formula (other-state income taxes ÷ total line 5d taxes × the capped amount)."
        + "\n\nCREDITS: OTHER STATE(S) TAX CREDIT (line 18) via the printed worksheet: GA-rate tax on (other-state AGI − ratio-share of deductions and dependent exemptions), capped at the other state's actual tax — hand-computed, return copy required. GEORGIA ELIGIBLE ITEMIZER TAX CREDIT (NEW 2025, line 19, verbatim): 'A full-year or part-year resident who itemized and lived in Georgia 183 days or longer, or who is living in Georgia on the last day of the year may qualify for a tax credit of up to $300 per taxpayer ... cannot exceed the tax liability from Line 16 ... cannot be carried forward' — the computation worksheet was not captured at encoding; TRANSCRIBE the computed amount (never assume the full $300). IND-CR credits (Form 500 line 20): 201 disabled-person home retrofit ($500/$125); 202 CDCC (→ us.ga.cdcc); 204 qualified caregiving (10% of expenses, max $150); 206 disaster assistance (max $500); 207 rural physicians ($5,000/yr); 213 foster child adoption 2021+ ($6,000/child first five years); 214 teacher recruitment ($3,000). Schedule 2 series-100 credits and the refundable Schedule 2B (line 27 — currently only Timber credits 145/155, never when purchased) require e-filing. Line 22 total credits 'cannot exceed Line 16.'"
        + "\n\nMECHANICS: whole-dollar rounding; no tax table; Form 500EZ DISCONTINUED for 2025; withholding splits across line 24 (W-2s/1099s) and line 25 (G2-A/G2-FL/G2-LP/G2-RP); estimated payments + Form IT-560 extension payments combine on line 26; UET penalty line 42; donations lines 32-41 ($1 minimum each). TY2026 treadmill notes: HB 463 (4.99% rate, higher standard deductions, tips/overtime exclusions through 2028, some credits repealed — enrolled text unverified at encoding), HB 136's $250 under-6 CTC and employer child-care credit begin TY2026.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      militaryExclusionBase: { value: "1750000", type: "money" }, // $17,500 under-62
      militaryExclusionAdditional: { value: "1750000", type: "money" }, // +$17,500 with GA earned income > $17,500
      path2college529PerBeneficiary: { value: "400000", type: "money" }, // $4,000 ($8,000 MFJ)
      path2college529PerBeneficiaryJoint: { value: "800000", type: "money" },
      organDonationCap: { value: "2500000", type: "money" }, // $25,000
      eligibleItemizerCreditMaxPerTaxpayer: { value: "30000", type: "money" }, // up to $300 (worksheet-computed)
      caregivingCreditPct: { value: "10", type: "int" },
      caregivingCreditMax: { value: "15000", type: "money" }, // $150 (IND-CR 204)
      ctc2026PerChildUnder6: { value: "25000", type: "money" }, // $250 (TY2026+, informational)
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: use lookup_tax_parameter for the Georgia amounts; tax → us.ga.income_tax, deductions → us.ga.standard_deduction / us.ga.dependent_exemption, exclusions → us.ga.retirement_exclusion, credits → us.ga.low_income_credit / us.ga.cdcc; Schedule 1 modifications, the military exclusion worksheet, and the other-state/itemizer credits are agent-composed from the cited lines",
    },
  },
];
