import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money } from "./state-helpers.js";

/**
 * Montana deep pack — TY2025 Form 2 (full-year resident). Every amount verified
 * from the 2025 Montana Form 2 Individual Income Tax Instructions (48 pp,
 * stamped "V2 9/16/2025"), the printed 2025 Form 2 and Schedules I, II, III and
 * 2EC (all stamped "2025v3 12/2025"), the Department's "2025 Montana Tax Tables
 * and Deductions" page, 2025 and 2026 Publication 1, and the Montana Code
 * Annotated 2025 (§§ 15-30-2101, 2103, 2110, 2120, 2302, 2318, 2337-2341) at
 * archive.legmt.gov, cross-checked against enrolled House Bill 337 (Ch. 227,
 * L. 2025, approved April 28, 2025).
 *
 * Load-bearing findings:
 *  - Montana starts from FEDERAL TAXABLE INCOME, not its own income concept:
 *    line 1 federal AGI, less line 2 (the federal standard or itemized
 *    deduction plus the Schedule 1-A deductions, but NOT the § 199A qualified
 *    business income deduction), ± Schedule I, less the age-65 subtraction.
 *    Montana has NO standard deduction of its own (§ 15-30-2132 repealed), NO
 *    personal or dependency exemption (§ 15-30-2114 repealed), and NO Social
 *    Security subtraction — all three died with SB 399 (Ch. 503, L. 2021).
 *  - The tax is TWO taxes summed on the page 2 worksheet: ordinary income tax
 *    on taxable income less net long-term capital gains, and a preferential
 *    3% / 4.1% tax on the gains, which stack on top of ordinary income. There
 *    is no tax table at any income level — the rate schedule is the only
 *    method, and it is printed with a rounded "Less" subtraction constant
 *    ($253 / $506 / $380 for 2025, each the exact 1.2-point figure truncated:
 *    21,100 x 1.2% = 253.20, 42,200 x 1.2% = 506.40, 31,700 x 1.2% = 380.40).
 *    Encoded as printed, so the schedule sits up to $0.40 above the pure
 *    cumulative bracket — that is the filed-return answer.
 *  - Qualified dividends are ORDINARY income in Montana ("Montana Ordinary
 *    Income is defined as all taxable income that is not considered a net
 *    long-term capital gain and includes qualified dividends"), unlike the
 *    federal treatment. Only § 1222 net long-term gains get 3% / 4.1%.
 *  - The elderly homeowner/renter credit (Schedule 2EC) is refundable and
 *    claimable with no income tax liability at all; it runs off GROSS
 *    HOUSEHOLD INCOME, which includes untaxed Social Security, pensions,
 *    public assistance and the 2024 Montana property tax rebate.
 *
 * CURRENCY TRAP — the codified statute is a YEAR AHEAD of TY2025. MCA 2025
 * prints § 15-30-2103 only as a "(Temporary)" version (the TY2026 numbers:
 * 5.65% over $47,500 / $95,000 / $71,250, terminating December 31, 2026) and an
 * "(Effective January 1, 2027)" version (5.4% over $65,000 / $130,000 /
 * $97,500); the TY2025 law is not printed at all. § 15-30-2318 likewise reads
 * 20% when TY2025 is 10%. Anyone encoding TY2025 from the current MCA gets both
 * the top rate and the EITC wrong — the TY2025 figures here come from the
 * printed booklet and form. HB 337 § 6 fixes the applicability: "[Sections 1
 * and 3] apply to the income tax year beginning January 1, 2026."
 */

const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const cmp = (op: "lt" | "le" | "gt" | "ge" | "eq" | "ne", left: Expr, right: Expr): Expr => ({ kind: "cmp", op, left, right });
const lt = (l: Expr, r: Expr): Expr => cmp("lt", l, r);
const le = (l: Expr, r: Expr): Expr => cmp("le", l, r);
const gt = (l: Expr, r: Expr): Expr => cmp("gt", l, r);
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const add = (...args: Expr[]): Expr => ({ kind: "add", args });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const minE = (...args: Expr[]): Expr => ({ kind: "min", args });
const and = (...args: Expr[]): Expr => ({ kind: "and", args });
const not = (arg: Expr): Expr => ({ kind: "not", arg });
const isStatus = (v: string): Expr => cmp("eq", fact("filingStatus"), { kind: "enum", value: v });
/** the MFJ/QSS column — Montana pairs "married filing jointly and qualifying surviving spouse" everywhere */
const isJoint: Expr = ({ kind: "or", args: [isStatus("mfj"), isStatus("qss")] } as Expr);
/** spouse-column branches: a qualifying surviving spouse has no spouse to count */
const isMfjOnly: Expr = isStatus("mfj");
const isHoh: Expr = isStatus("hoh");
const times = (base: Expr, num: string): Expr => ({ kind: "mulRate", base, rate: { num, den: "1" }, round: "half-up" });
const pct = (base: Expr, num: string, den: string): Expr => ({ kind: "mulRate", base, rate: { num, den }, round: "half-up" });
/** scaled integer (cents x 10^4) -> whole-dollar money, ONE half-up rounding */
const dollarsFromScaled = (n: Expr): Expr => times({ kind: "mulDiv", a: n, b: money("1"), c: money("1000000"), round: "half-up" }, "100");
/** filing-status threshold selector (single and MFS share the single column) */
const byStatus = (joint: string, hoh: string, single: string): Expr => iff(isJoint, money(joint), iff(isHoh, money(hoh), money(single)));

type Brackets = { joint: string; hoh: string; single: string; rate1Bps: string; rate2Bps: string; lessJoint?: string; lessHoh?: string; lessSingle?: string };

/**
 * Form 2 page 2, line 12 — Montana ordinary income tax on the line 4 amount.
 * For TY2025 the Department PRINTS a "Less" subtraction constant ($253 / $506 /
 * $380, each the exact 1.2-point figure truncated), so that is what filers
 * compute and what is encoded. For TY2026 and TY2027 no form exists yet and no
 * constant is printed, so those years accumulate the brackets exactly rather
 * than inventing a constant — the HOH continuity figure for 2026 is $676.875,
 * which is not even a whole cent, so there is no honest constant to invent.
 */
const ordinaryTax = (ordinary: Expr, b: Brackets): Expr => {
  const threshold = byStatus(b.joint, b.hoh, b.single);
  const lower = dollarsFromScaled(times(ordinary, b.rate1Bps));
  const upper = b.lessSingle !== undefined
    ? dollarsFromScaled(sub(times(ordinary, b.rate2Bps), times(byStatus(b.lessJoint as string, b.lessHoh as string, b.lessSingle), "10000")))
    : dollarsFromScaled(add(times(threshold, b.rate1Bps), times(sub(ordinary, threshold), b.rate2Bps)));
  return iff(cmp("ge", ordinary, threshold), upper, lower);
};

/**
 * Form 2 page 2, lines 1-11 — Montana net long-term capital gains tax.
 * Line 8 and line 10 are separate whole-dollar boxes on the printed form, so
 * each rounds before they are added; this is NOT one rounding of the total.
 */
const capitalGainsTax = (taxable: Expr, gains: Expr, b: Brackets): Expr => {
  const l1 = max0(taxable);
  const l2 = max0(gains);
  const l3 = minE(l1, l2); // "Enter the lesser of line 1 or line 2"
  const l4 = max0(sub(l1, l3)); // ordinary income
  const l5 = byStatus(b.joint, b.hoh, b.single);
  const l6 = max0(sub(l5, l4)); // room left in the 3% band
  const l7 = minE(l3, l6);
  // lines 8 and 10 are whole-dollar boxes: ONE half-up rounding each, straight from the
  // scaled product. Rounding to cents first and then to dollars double-rounds (4.1% of $256
  // is 10.496, which the form prints as $10 but a cent-then-dollar chain turns into $11).
  const l8 = dollarsFromScaled(times(l7, "300"));
  const l9 = max0(sub(l3, l6));
  const l10 = dollarsFromScaled(times(l9, "410"));
  return add(l8, l10);
};

const BR_2025: Brackets = { joint: "4220000", hoh: "3170000", single: "2110000", rate1Bps: "470", rate2Bps: "590", lessJoint: "50600", lessHoh: "38000", lessSingle: "25300" };
const BR_2026: Brackets = { joint: "9500000", hoh: "7125000", single: "4750000", rate1Bps: "470", rate2Bps: "565" };
const BR_2027: Brackets = { joint: "13000000", hoh: "9750000", single: "6500000", rate1Bps: "470", rate2Bps: "540" };

const BOOK = "https://revenuefiles.mt.gov/files/Forms/Montana-Individual-Income-Tax-Return-Form-2-Instructions/2025_Montana_Individual_Income_Tax_Return_Form_2_Instructions.pdf";
const FORM = "https://revenuefiles.mt.gov/files/Forms/Montana-Individual-Income-Tax-Return-Form-2/2025_Montana_Individual_Income_Tax_Return_Form_2.pdf";
const MCA = (part: string, section: string) => `https://archive.legmt.gov/bills/mca/title_0150/chapter_0300/part_0${part}/section_0${section}/0150-0300-0${part}-0${section}.html`;

const RATE_EXCERPT_2025 =
  "BOOKLET p. 12 '2025 Montana Income Tax Rates' (verbatim). Single and Married Filing Separately — Ordinary Income Tax Rates: 'If your taxable income without net long-term capital gains is $0 / But less than $21,100 / Then your tax rate is 4.7% / Less $0; $21,100 or greater / 5.9% / Less $253.' Net Long-Term Capital Gains Rate: 'For net long-term capital gains above $0 / But less than $21,100 minus ordinary income / 3%; $21,100 minus ordinary income / 4.1%; If ordinary income exceeds $21,100 / 4.1%.' Married Filing Jointly and Qualifying Surviving Spouse: $42,200 / 4.7% / Less $0; '$42,200 or greater / 5.9% / Less $506'. Head of Household: $31,700 / 4.7% / Less $0; '$31,700 or greater / 5.9% / Less $380'. The 'Less' constants are the exact 1.2-percentage-point figures TRUNCATED to whole dollars (21,100 x 1.2% = 253.20 -> $253; 42,200 x 1.2% = 506.40 -> $506; 31,700 x 1.2% = 380.40 -> $380), so the printed schedule sits up to $0.40 above pure cumulative bracketing — encoded as printed.";

export const mtRules: Rule[] = [
  {
    id: "us.mt.ordinary_income_tax",
    version: 1,
    jurisdiction: "us.mt",
    title:
      "Montana ordinary income tax 2025 — 4.7% to $21,100 single and MFS, $42,200 MFJ and qualifying surviving spouse, $31,700 head of household, then 5.9% less the printed $253 / $506 / $380 constant, on taxable income excluding net long-term capital gains (Form 2 page 2, line 12)",
    citation: {
      source:
        "2025 Montana Form 2 Instructions (V2 9/16/2025) p. 12 '2025 Montana Income Tax Rates'; printed 2025 Form 2 (2025v3 12/2025) page 2 line 12; Montana Department of Revenue '2025 Montana Tax Tables and Deductions'; MCA § 15-30-2103 (the TY2026 'Temporary' text, for structure only — see the module note on the currency trap)",
      section: "MCA § 15-30-2103(1); Form 2 page 2 line 12",
      url: BOOK,
      excerpt:
        RATE_EXCERPT_2025 +
        " FORM (page 2, verbatim): '12 If you do not have a net long-term capital gain, figure your tax on the amount on line 1 using the Montana Ordinary Income Tax Table. If you have a net long-term capital gain, figure your tax on the amount on line 4 using the Montana Ordinary Income Tax Table. This is your Montana ordinary income tax.' DEFINITION (booklet p. 11, verbatim): 'Montana Ordinary Income is defined as all taxable income that is not considered a net long-term capital gain and includes qualified dividends.' — qualified dividends are ORDINARY income in Montana, unlike the federal treatment. Despite the words 'Tax Table', NO income-bracket lookup table exists anywhere in the 48-page booklet; the rate schedule is the only method at every income level, and Montana has no standard deduction (§ 15-30-2132 repealed) and no personal exemption (§ 15-30-2114 repealed), both by SB 399 (Ch. 503, L. 2021). The Department's tax-tables page adds: 'Estates, Trusts, and Pass-Through Composite Tax Filers have the same rates below' (the single/MFS column). TY2026 and TY2027 are versions 2 and 3 (HB 337, Ch. 227, L. 2025).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      rate1Bps: { value: "470", type: "int" },
      rate2Bps: { value: "590", type: "int" },
      thresholdSingle: { value: "2110000", type: "money" },
      thresholdJoint: { value: "4220000", type: "money" },
      thresholdHoh: { value: "3170000", type: "money" },
      lessSingle: { value: "25300", type: "money" },
      lessJoint: { value: "50600", type: "money" },
      lessHoh: { value: "38000", type: "money" },
    },
    formula: ordinaryTax(max0(sub(max0(fact("stateTaxableIncome")), minE(max0(fact("stateTaxableIncome")), max0(fact("mtNetLongTermCapitalGains"))))), BR_2025),
  },
  {
    id: "us.mt.capital_gains_tax",
    version: 1,
    jurisdiction: "us.mt",
    title:
      "Montana net long-term capital gains tax 2025 — 3% on the gains that fit below the filing-status threshold after ordinary income, 4.1% above, and 4.1% on all of them once ordinary income reaches the threshold (Form 2 page 2, lines 1-11)",
    citation: {
      source:
        "MCA § 15-30-2103(2)-(3); printed 2025 Form 2 (2025v3 12/2025) page 2 lines 1-11; 2025 Montana Form 2 Instructions p. 11 and the rate page p. 12; MCA § 15-30-2301 (the former capital gains credit) Repealed, Secs. 65, 70(1), Ch. 503, L. 2021",
      section: "MCA § 15-30-2103(2); Form 2 page 2 lines 1-11",
      url: FORM,
      excerpt:
        "STATUTE (§ 15-30-2103(2), verbatim, joint column): 'that portion of a taxpayer's Montana taxable income that consists of net long-term capital gains after accounting for amounts included in taxable income that is not net long-term capital gains is subject to a tax on the brackets of net long-term capital gains as follows: (a) for every married individual who files a joint return and for every surviving spouse: (i) on the first $95,000 less nonqualified taxable income of net long-term capital gains, 3.0%; (ii) on net long-term capital gains that exceed $95,000 less nonqualified taxable income or any part of that income, 4.1%, except that if the total nonqualified taxable income is $95,000 or greater, all of the net long-term capital gains are taxed at 4.1%'. (3): \"'Net long-term capital gains' means net long-term capital gains as that term is defined in section 1222 of the Internal Revenue Code, 26 U.S.C. 1222. 'Nonqualified taxable income' means Montana taxable income that is not considered net long-term capital gains.\" (The $95,000 is the TY2026 figure; TY2025 is $42,200 joint — see the module currency note.) FORM (page 2, verbatim): '1 Enter your total Montana taxable income from page 1, line 7. If you do not have a net long-term capital gains, skip lines 2 through 10 and enter 0 (zero) on line 11. 2 Enter your net long-term capital gains. 3 Enter the lesser of line 1 or line 2. 4 Subtract line 3 from line 1. 5 Enter the amount for your federal filing status: $21,100 if single or married filing separately; $42,200 if married filing jointly or qualifying surviving spouse; $31,700 if head of household. 6 Subtract line 4 from line 5. If zero or less, enter 0 (zero). 7 Enter the lesser of line 3 or line 6. 8 Multiply line 7 by 3% (0.03). 9 Subtract line 6 from line 3. If zero or less, enter 0 (zero). 10 Multiply line 9 by 4.1% (0.041). 11 Add lines 8 and 10. This is your Montana net long-term capital gains tax.' INSTRUCTIONS (p. 11, verbatim): 'Generally, this amount is the lesser of federal Schedule D, line 15 or Schedule D, line 16.' ENCODING: lines 8 and 10 are separate whole-dollar boxes on the printed form, so EACH rounds half-up before they are added — not one rounding of the sum. The old capital gains CREDIT no longer exists: § 15-30-2301 is repealed and Schedule III lists no such credit.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { lowRateBps: { value: "300", type: "int" }, highRateBps: { value: "410", type: "int" }, thresholdSingle: { value: "2110000", type: "money" }, thresholdJoint: { value: "4220000", type: "money" }, thresholdHoh: { value: "3170000", type: "money" } },
    formula: capitalGainsTax(fact("stateTaxableIncome"), fact("mtNetLongTermCapitalGains"), BR_2025),
  },
  {
    id: "us.mt.income_tax",
    version: 1,
    jurisdiction: "us.mt",
    title: "Montana resident tax 2025 — the ordinary income tax plus the net long-term capital gains tax (Form 2 page 2, line 13, carried to page 1 line 8)",
    citation: {
      source: "Printed 2025 Form 2 (2025v3 12/2025) page 2 line 13; 2025 Montana Form 2 Instructions p. 10 'Montana Individual Income Tax Calculation'; MCA § 15-30-2103",
      section: "Form 2 page 2 line 13; page 1 line 8",
      url: FORM,
      excerpt:
        "FORM (page 2, verbatim): '13 Residents add lines 11 and 12, and enter this amount on page 1, line 8. This is your Montana resident tax.' INSTRUCTIONS (p. 10, verbatim): 'Complete lines 1 through 12 to calculate your Montana tax liability, which consists of the Montana Ordinary Income Tax and the Montana Net Long-Term Capital Gains Tax. If you are a resident, the amount on line 13 is your tax liability. Nonresidents, part-year residents, and Montana residents filing jointly with a nonresident or part-year resident spouse (mixed residency filers) complete lines 1 through 12, then use the Net Long-Term Capital Gains Tax on line 11 and the Montana Ordinary Income Tax on line 12 to figure the total Montana tax liability on Schedule II, Tax on Montana Source Income.' SCOPE: this rule is the FULL-YEAR RESIDENT total. Nonresident, part-year and mixed-residency returns apportion on Schedule II and are out of scope. " + RATE_EXCERPT_2025,
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {},
    formula: add(
      capitalGainsTax(fact("stateTaxableIncome"), fact("mtNetLongTermCapitalGains"), BR_2025),
      ordinaryTax(max0(sub(max0(fact("stateTaxableIncome")), minE(max0(fact("stateTaxableIncome")), max0(fact("mtNetLongTermCapitalGains"))))), BR_2025),
    ),
  },
  {
    id: "us.mt.age65_subtraction",
    version: 1,
    jurisdiction: "us.mt",
    title: "Montana age-65 subtraction 2025 — $5,660 for each taxpayer who has attained age 65, $11,320 on a joint return where both have (Form 2 line 6)",
    citation: {
      source: "MCA § 15-30-2120(3)(g) ($5,500 base) and (7) (annual inflation adjustment, rounded to the nearest $10); 2025 Montana Form 2 Instructions p. 7 line 6; printed 2025 Form 2 line 6; Montana Department of Revenue '2025 Montana Tax Tables and Deductions'",
      section: "MCA § 15-30-2120(3)(g), (7); Form 2 line 6",
      url: MCA("210", "200"),
      excerpt:
        "STATUTE (§ 15-30-2120(3)(g), verbatim): 'for each taxpayer that has attained the age of 65, an additional subtraction of $5,500'. (7)(a)-(b), verbatim: 'By November 1 of each year, the department shall multiply the subtractions from federal taxable income in subsections (3)(g) and (3)(o) by the inflation factor for that tax year for a taxpayer that either: (i) has attained the age of 65; or (ii) is a qualified volunteer firefighter or volunteer emergency care provider. (b) The department shall round the results in subsection (7)(a) to the nearest $10.' § 15-30-2101(12): \"'Inflation factor' means a number determined for each tax year by dividing the consumer price index for June of the previous tax year by the consumer price index for June 2023.\" FORM (line 6, verbatim): '$5,660 subtraction for taxpayers 65 and older ($11,320 if married filing jointly and both are 65 and older)'. INSTRUCTIONS (p. 7, verbatim): 'Taxpayers 65 and older receive a $5,660 subtraction from federal taxable income. If married filing jointly, and both are 65 and older, the subtraction is equal to $11,320. This amount is adjusted annually for inflation.' NAMING TRAP: the Department's web page labels this the '65 and over exemption', but it is a SUBTRACTION from federal taxable income taken on Form 2 line 6 — Montana's personal exemption (§ 15-30-2114) is repealed. The doubled amount needs a JOINT return: a qualifying surviving spouse has no spouse to count. Indexed annually and the TY2026 figure is unpublished (the department sets it by November 1) — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { perTaxpayer: { value: "566000", type: "money" }, bothSpouses: { value: "1132000", type: "money" } },
    formula: add(
      iff(fact("mtTaxpayerAge65"), money("566000"), money("0")),
      iff(and(isMfjOnly, fact("mtSpouseAge65")), money("566000"), money("0")),
    ),
  },
  {
    id: "us.mt.eitc",
    version: 1,
    jurisdiction: "us.mt",
    title: "Montana earned income tax credit 2025 — 10% of the federal earned income credit, refundable (Form 2 line 15)",
    citation: {
      source: "MCA § 15-30-2318; 2025 Montana Form 2 Instructions p. 9 line 15; printed 2025 Form 2 line 15; Montana Department of Revenue 'Montana Earned Income Tax Credit'; enrolled House Bill 337 (Ch. 227, L. 2025) § 3 and § 6",
      section: "MCA § 15-30-2318; Form 2 line 15",
      url: MCA("230", "180"),
      excerpt:
        "FORM (line 15, verbatim): 'Earned Income Credit. Federal EIC ____ Multiply Federal EIC by 10% (0.10)'. INSTRUCTIONS (p. 9, verbatim): 'You are allowed a Montana earned income tax credit (EITC) of 10 percent of the federal EITC claimed on your federal return. Your Montana EITC is refundable. This means that if the credit is more than your Montana tax liability after applying withholding taxes and credits, the difference will be refunded to you. Nonresidents do not qualify for the Montana EITC.' STATUTE (§ 15-30-2318(4), verbatim): 'The taxpayer is entitled to a refund equal to the amount by which the credit exceeds the taxpayer's tax liability or, if the taxpayer has no tax liability under this chapter, a refund equal to the amount of the credit.' CURRENCY TRAP: § 15-30-2318(2) as published in MCA 2025 already reads '20%' — that is the TY2026 text. Enrolled HB 337 § 3 shows the amendment as '10% 20%' and § 6(1) provides: '[Sections 1 and 3] apply to the income tax year beginning January 1, 2026.' TY2025 is 10%; TY2026 is version 2. REDUCTION: Worksheet A prorates the credit by Montana earned income / federal earned income for part-year and mixed-residency filers, enrolled tribal members living on their own reservation, IRC § 501(d) agricultural-organization members, and resident active-duty servicemembers — those are out of scope for this full-year-resident rule and the composer names them.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "10", type: "int" } },
    formula: rd(pct(max0(fact("mtFederalEic")), "10", "100")),
  },
  {
    id: "us.mt.elderly_homeowner_renter_credit",
    version: 1,
    jurisdiction: "us.mt",
    title:
      "Montana elderly homeowner/renter credit 2025 (Schedule 2EC) — for a claimant 62 or older with gross household income under $45,000: property tax billed plus 15% of rent, less the household income reduction, capped at $1,150 and multiplied by the credit multiplier; refundable and claimable with no tax liability",
    citation: {
      source: "MCA §§ 15-30-2337 (definitions), 15-30-2338 (eligibility), 15-30-2340 (computation, tables, $1,150 cap, refundability); printed 2025 Form 2 Schedule 2EC (2025v3 12/2025) lines 1-30; 2025 Montana Form 2 Instructions pp. 38-42",
      section: "MCA §§ 15-30-2337 to 15-30-2341; Schedule 2EC",
      url: MCA("230", "400"),
      excerpt:
        "ELIGIBILITY (Schedule 2EC attestation block, verbatim): 'I reached age 62 by December 31, 2025 / I resided in Montana for a minimum of nine months during 2025 / I occupied a Montana residence as a renter, owner, or lessee for at least six months during 2025 / The combined gross household income was less than $45,000 for 2025 / I am the only member of my household claiming this credit.' All FIVE attestations gate the credit (mtAge62, mtResided9Months, mtOccupied6Months, mtSoleHouseholdClaimant), each defaulting to not-attested so an unattested claim pays $0. STATUTE (§ 15-30-2338(1), verbatim): 'must have reached age 62 or older during the claim period…; must have resided in Montana for at least 9 months of that period; must have occupied one or more dwellings in Montana as an owner, renter, or lessee for at least 6 months of the claim period; and must have less than $45,000 of gross household income.' DEFINITIONS: § 15-30-2337(4) \"'Gross household income' means all income received by all individuals of a household while they are members of the household\"; (9)(a) income is federal AGI without regard to loss 'plus all nontaxable income, including but not limited to: (i) the amount of any pension or annuity, including Railroad Retirement Act benefits and veterans' disability benefits; (ii) the amount of capital gains excluded from adjusted gross income; (iii) alimony; (iv) support money; (v) nontaxable strike benefits; (vi) cash public assistance and relief; (vii) interest on federal, state, county, and municipal bonds; and (viii) all payments received under federal social security except social security income paid directly to a nursing home'; (8) \"'Household income' means the amount obtained by subtracting $12,600 from gross household income\"; (11) \"'Rent-equivalent tax paid' means 15% of the gross rent.\" The booklet (p. 40, line 8) also requires including refundable credits received in cash, expressly 'the 2024 Montana property tax rebate'. WORKSHEET (Schedule 2EC, verbatim): '19 Your standard exclusion is entered here for you 12,600. 20 Subtract line 19 from line 18 and enter the result here, but not less than zero. 21 Enter your multiplier rate from the Household Income Reduction Table. 22 Multiply line 20 by line 21. This is your net household income. 23 Enter the property tax you were billed for your Montana residence and up to one acre in 2025. 24 Enter the rent that you paid in 2025 for your Montana residence. 25 Multiply line 24 by 15% (0.15). 26 Add lines 23 and 25. 27 Subtract line 22 from line 26 and enter the result here, but not less than zero. 28 Enter the lesser of line 27 or $1,150. 29 Enter the percentage from the Credit Multiplier Table that corresponds to your gross household income on line 18. 30 Multiply line 28 by the percentage on line 29.' HOUSEHOLD INCOME REDUCTION TABLE (line 20, verbatim): $0-$1,999 -> 0; $2,000-$2,999 -> 0.006; $3,000-$3,999 -> 0.016; $4,000-$4,999 -> 0.024; $5,000-$5,999 -> 0.028; $6,000-$6,999 -> 0.032; $7,000-$7,999 -> 0.035; $8,000-$8,999 -> 0.039; $9,000-$9,999 -> 0.042; $10,000-$10,999 -> 0.045; $11,000-$11,999 -> 0.048; $12,000 and greater -> 0.05. CREDIT MULTIPLIER TABLE (line 18, verbatim): 'Less than $35,000 -> 1.00 (100%); $35,000 to $37,500 -> 0.40 (40%); $37,501 to $40,000 -> 0.30 (30%); $40,001 to $42,500 -> 0.20 (20%); $42,501 to $44,999 -> 0.10 (10%); $45,000 and greater -> 0.00 (0%).' DRAFTING DISCREPANCY: § 15-30-2340(5) opens 'For a claimant whose household income is $35,000 or more but less than $45,000' while its own table column is headed 'Gross household income' and Schedule 2EC line 29 keys off line 18 (GROSS) — the form and the table header govern, and gross household income is encoded. REFUNDABLE: § 15-30-2340(7), verbatim: 'If the amount of the credit exceeds the claimant's liability under this chapter, the amount of the excess must be refunded to the claimant. The credit may be claimed even though the claimant has no income taxable under this chapter.' The $45,000 / $12,600 / $1,150 figures and both tables are hard-coded in statute with NO inflation indexing and were untouched by the 2025 session, so this rule carries through TY2027 alongside the House Bill 337 rate versions (only § 15-30-2339, the filing-date section, was amended, by Senate Bill 53).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2028-01-01",
    output: { type: "money" },
    parameters: { maximumCredit: { value: "115000", type: "money" }, incomeLimit: { value: "4500000", type: "money" }, standardExclusion: { value: "1260000", type: "money" }, rentEquivalentPct: { value: "15", type: "int" } },
    formula: (() => {
      const l18 = max0(fact("mtGrossHouseholdIncome"));
      const l20 = max0(sub(l18, money("1260000")));
      // Household Income Reduction Table — a per-mille multiplier on line 20
      // Household Income Reduction Table, as ten-thousandths so line 22 needs ONE rounding
      const mult = iff(lt(l20, money("200000")), money("0"),
        iff(lt(l20, money("300000")), money("60"),
        iff(lt(l20, money("400000")), money("160"),
        iff(lt(l20, money("500000")), money("240"),
        iff(lt(l20, money("600000")), money("280"),
        iff(lt(l20, money("700000")), money("320"),
        iff(lt(l20, money("800000")), money("350"),
        iff(lt(l20, money("900000")), money("390"),
        iff(lt(l20, money("1000000")), money("420"),
        iff(lt(l20, money("1100000")), money("450"),
        iff(lt(l20, money("1200000")), money("480"), money("500"))))))))))));
      const l22 = dollarsFromScaled({ kind: "mulDiv", a: l20, b: mult, c: money("1"), round: "half-up" });
      const l23 = max0(fact("mtPropertyTaxBilled"));
      const l25 = rd(pct(max0(fact("mtRentPaid")), "15", "100"));
      const l26 = add(l23, l25);
      const l27 = max0(sub(l26, l22));
      const l28 = minE(l27, money("115000"));
      // Credit Multiplier Table — basis points on gross household income (line 18)
      const cm = iff(lt(l18, money("3500000")), money("10000"),
        iff(le(l18, money("3750000")), money("4000"),
        iff(le(l18, money("4000000")), money("3000"),
        iff(le(l18, money("4250000")), money("2000"),
        iff(lt(l18, money("4500000")), money("1000"), money("0"))))));
      const l30 = rd({ kind: "mulDiv", a: l28, b: cm, c: money("10000"), round: "half-up" });
      // § 15-30-2338(1) has exactly four conditions (age 62, nine months of residency, six months
      // of occupancy, gross household income under $45,000) and the Schedule 2EC attestation block
      // adds only the sole-claimant statement — there is NO dependent test, so none is applied.
      const eligible = and(fact("mtAge62"), fact("mtResided9Months"), fact("mtOccupied6Months"), fact("mtSoleHouseholdClaimant"), lt(l18, money("4500000")));
      return iff(eligible, l30, money("0"));
    })(),
  },
  {
    id: "us.mt.other_state_credit",
    version: 1,
    jurisdiction: "us.mt",
    title:
      "Montana credit for income taxes paid to another state or country 2025 — computed SEPARATELY for ordinary income and for net long-term capital gains and summed; each is the least of the tax paid, that tax times the sourced-income ratio, and the Montana tax times the sourced-income ratio (Schedule III Part II, six decimals)",
    citation: {
      source: "MCA § 15-30-2302; printed 2025 Form 2 Schedule III Part II (2025v3 12/2025) lines 1-21; 2025 Montana Form 2 Instructions pp. 33-35",
      section: "MCA § 15-30-2302; Schedule III Part II",
      url: MCA("230", "020"),
      excerpt:
        "STATUTE (§ 15-30-2302(5), verbatim): 'The allowable credit must be computed by a formula prescribed by the department.' — so the printed worksheet IS the operative arithmetic. FORM (Schedule III Part II, verbatim): 'Montana Ordinary Income Tax — 1 Enter your income sourced and taxable to another state or country that is included in your Montana taxable income …, excluding any net long-term capital gains. 2 Enter all income sourced and taxable to the other state or country. 3 Income sourced and taxable to Montana excluding your net long-term capital gains. 4 Enter your total tax liability paid to the other state or country. 5 Enter your Montana ordinary income tax. 6 Divide line 1 by line 2. Round to 6 decimal places and do not enter more than 1.000000. 7 Multiply line 4 by line 6. 8 Divide line 1 by line 3. Round to 6 decimal places and do not enter more than 1.000000. 9 Multiply line 5 by line 8. 10 Enter the lesser of the amounts on lines 4, 7, or 9. This is your credit for income tax paid to another state or country for Montana ordinary income tax. Montana Net Long-Term Capital Gains Tax — 11 Enter your net long-term capital gain sourced and taxable to another state or country that is included in your Montana taxable income. 12 Enter all income sourced and taxable to the other state or country. 13 Enter federal net long-term capital gains. 14 Enter your income tax liability paid to the other state or country. 15 Full-year residents enter page 2, line 11. 16 Divide line 11 by line 12. Round to 6 decimal places and do not enter more than 1.000000. 17 Multiply line 14 by line 16. 18 Divide line 11 by line 13. Round to 6 decimal places and do not enter more than 1.000000. 19 Multiply line 15 by line 18. 20 Enter the lesser of the amounts on lines 14, 17, or 19. Total Credit for Income Taxes Paid to Another State or Country — 21 Add lines 10 and 20.' BOOKLET (page 35, verbatim): 'Line 4. Enter the actual tax liability paid by you or on your behalf to the other state or country.' 'Line 14. Enter the actual tax liability paid by you or on your behalf to the other state or country. This amount comes from either an individual income tax return you filed, or a pass-through entity return filed on your behalf by a partnership or S corporation. Do not include any penalties and interest paid to the other state or country.' 'Line 16. This amount represents the proportion of tax paid to the other state or country on only your net long-term capital gains.' ENCODING: lines 4 and 14 are the SAME figure — the total tax paid to the other state (mtOtherStateTaxPaid) — and the line 16 ratio (gains sourced / all income sourced) attributes the gains share; the rule does not take a pre-attributed gains tax. Both ratios are six decimal places, half-up, capped at 1.000000, and each block takes the least of three amounts before the two are summed. NONREFUNDABLE, carried to Schedule III Part I line 1 and Form 2 line 9. NORTH DAKOTA RECIPROCITY (instructions): wages earned in North Dakota by a Montana resident are NOT eligible — file a North Dakota return for a refund; non-wage North Dakota income can qualify. FOREIGN TAX: not allowed if a federal Form 1116 credit was claimed for the same year.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2028-01-01",
    output: { type: "money" },
    parameters: { ratioDecimals: { value: "6", type: "int" } },
    formula: (() => {
      const ratio6 = (num: Expr, den: Expr): Expr => minE({ kind: "mulDiv", a: max0(num), b: money("1000000"), c: den, round: "half-up" }, money("1000000"));
      // ONE half-up rounding to whole dollars: scale to cents x 10^4 first, then round once
      const applyRatio6 = (base: Expr, r: Expr): Expr => dollarsFromScaled({ kind: "mulDiv", a: base, b: r, c: money("100"), round: "half-up" });
      // ordinary block: lines 1-10
      const oSourced = max0(fact("mtOtherStateOrdinaryIncome"));
      const oAll = fact("mtOtherStateTotalIncome");
      const oMt = fact("mtOrdinaryIncomeSourcedToMontana");
      const oPaid = max0(fact("mtOtherStateTaxPaid"));
      const oTax = max0(fact("mtOrdinaryIncomeTax"));
      const l7 = iff(gt(oAll, money("0")), applyRatio6(oPaid, ratio6(oSourced, oAll)), money("0"));
      const l9 = iff(gt(oMt, money("0")), applyRatio6(oTax, ratio6(oSourced, oMt)), money("0"));
      const l10 = iff(gt(oSourced, money("0")), minE(oPaid, l7, l9), money("0"));
      // capital gains block: lines 11-20
      const gSourced = max0(fact("mtOtherStateCapitalGains"));
      const gAll = fact("mtOtherStateTotalIncome");
      const gFed = fact("mtFederalNetLongTermCapitalGains");
      // line 14 is the SAME total as line 4 — booklet p. 35 gives both lines the identical
      // instruction ("Enter the actual tax liability paid by you or on your behalf to the other
      // state or country") and says of line 16 that it "represents the proportion of tax paid to
      // the other state or country on only your net long-term capital gains". The ratio does the
      // attribution; the caller must NOT pre-attribute.
      const gPaid = max0(fact("mtOtherStateTaxPaid"));
      const gTax = max0(fact("mtCapitalGainsTax"));
      const l17 = iff(gt(gAll, money("0")), applyRatio6(gPaid, ratio6(gSourced, gAll)), money("0"));
      const l19 = iff(gt(gFed, money("0")), applyRatio6(gTax, ratio6(gSourced, gFed)), money("0"));
      const l20 = iff(gt(gSourced, money("0")), minE(gPaid, l17, l19), money("0"));
      return add(l10, l20);
    })(),
  },
  {
    id: "us.mt.tuition_savings_subtraction",
    version: 1,
    jurisdiction: "us.mt",
    title: "Montana family education savings (529) subtraction 2025 — up to $4,500 per taxpayer, $9,000 on a joint return (Schedule I line 16)",
    citation: {
      source: "MCA § 15-30-2120(5), (11); 2025 Montana Form 2 Schedule I line 16; 2025 Montana Form 2 Instructions 'What's New' (House Bill 845, Ch. 734, L. 2025) and p. 20; Senate Bill 53 (Ch. 545, L. 2025)",
      section: "MCA § 15-30-2120(5); Schedule I line 16",
      url: MCA("210", "200"),
      excerpt:
        "BOOKLET What's New (verbatim): 'House Bill 845 increased the maximum subtraction a taxpayer may take for contributions to a 529 plan. The bill also provides for annual inflationary adjustments to the amount of the subtraction. For tax year 2025, the maximum contribution amount has increased from $3,000 to $4,500 (up to $9,000 if filing jointly).' And: 'Senate Bill 53 … clarified that taxpayers filing jointly can take a subtraction for a joint contribution to a 529 or 529A plan. Previously, the subtraction was equal to the contribution per individual taxpayer. The bill updated the definition of a qualified withdrawal of a 529 plan to include the rollover of a 529 plan to a Roth IRA under IRC 529.' STATUTE (§ 15-30-2120(5)(a)): the subtraction is 'the lesser of $4,500 or the amount of the contribution', and for a joint return 'not in excess of $9,000'. INDEXING (§ 15-30-2120(11), verbatim): 'the total amount of the contributions for each tax year after 2025 is determined by multiplying the amount in subsection (5)(a) by an inflation factor determined by dividing the consumer price index fund for June of the previous tax year by the consumer price index for June 2024 and rounding the resulting figure to the nearest $100 increment.' (the printed code's 'consumer price index fund' is a drafting error). First indexed for TY2026, unpublished — this rule ends 2026-01-01. The doubled cap needs a JOINT return.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { cap: { value: "450000", type: "money" }, capJoint: { value: "900000", type: "money" } },
    formula: minE(max0(fact("mtTuitionSavingsContributions")), iff(isMfjOnly, money("900000"), money("450000"))),
  },
  {
    id: "us.mt.able_subtraction",
    version: 1,
    jurisdiction: "us.mt",
    title: "Montana ABLE account subtraction 2025 — up to $3,000 per taxpayer, $6,000 on a joint return (Schedule I line 17)",
    citation: {
      source: "MCA § 15-30-2120(6); 2025 Montana Form 2 Schedule I line 17; 2025 Montana Form 2 Instructions p. 20; House Bill 671 (Ch. 339, L. 2025)",
      section: "MCA § 15-30-2120(6); Schedule I line 17",
      url: MCA("210", "200"),
      excerpt:
        "FORM (Schedule I line 17, verbatim): 'Achieving a Better Life Experience Act (ABLE) account deposits'. STATUTE § 15-30-2120(6)(a) caps the subtraction at $3,000, and at $6,000 for a joint return. Unlike the § 529 subtraction, the ABLE cap is NOT inflation-indexed — § 15-30-2120(11) indexes only the subsection (5) amount — so this rule carries through TY2027 while the 529 rule ends at 2026-01-01 and refuses until the indexed cap publishes. The doubled cap needs a JOINT return.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2028-01-01",
    output: { type: "money" },
    parameters: { cap: { value: "300000", type: "money" }, capJoint: { value: "600000", type: "money" } },
    formula: minE(max0(fact("mtAbleContributions")), iff(isMfjOnly, money("600000"), money("300000"))),
  },
  {
    id: "us.mt.military_retirement_subtraction",
    version: 1,
    jurisdiction: "us.mt",
    title:
      "Montana military retirement and survivor benefit subtraction 2025 — the lesser of Montana source wage income or 50% of the military pension, for a qualifying recent resident, for five consecutive years only (Schedule I line 13)",
    citation: {
      source: "MCA § 15-30-2120(3)(n), (8), (9); 2025 Montana Form 2 Schedule I line 13 and Form WMRE; 2025 Montana Form 2 Instructions p. 19; Senate Bill 93 (Ch. 586, L. 2025)",
      section: "MCA § 15-30-2120(8), (9); Schedule I line 13",
      url: MCA("210", "200"),
      excerpt:
        "STATUTE (§ 15-30-2120(8), verbatim): 'Subject to subsection (9), the subtraction in subsection (3)(n)(i) is equal to the lesser of: (i) the amount of Montana source wage income on the return; or (ii) 50% of the taxpayer's military pension or military retirement income.' (9), verbatim: 'The subtractions in subsection (3)(n): (a) may only be claimed by a person who: (i) became a resident of the state on or after June 30, 2023; or (ii) was a resident of the state before receiving military pension or military retirement income and remained a resident after receiving military pension or military retirement income; (b) may only be claimed for 5 consecutive years after satisfying the provisions of subsection (9)(a); and (c) are not available if a taxpayer claimed the exemption before becoming a nonresident.' Survivor benefits, § 15-30-2120(3)(n)(ii): 'up to 50% of all income received as survivor benefits for military service.' FORM (Schedule I line 13, verbatim): 'Subtraction of military retirement income for working military retirees and military survivor benefits. Include Form WMRE'. BOOKLET What's New: 'Senate Bill 93 removes the expiration date for the military retirement income and survivor's benefits subtraction. Previously, it was set to expire December 31, 2033.' With the sunset removed and no indexed amount involved, this rule carries through TY2027. NOTE the working-retiree design: the subtraction is capped by MONTANA SOURCE WAGE INCOME, which § 15-30-2120(8)(b) (verbatim) defines as '(i) wages, salary, tips, and other compensation for services performed in the state; (ii) net income from a trade, business, profession, or occupation carried on in the state; and (iii) net income from farming activities carried on in the state' — so a retiree with Montana Schedule C or F net income qualifies without a W-2, and a fully retired veteran with none of the three gets nothing. Active-duty pay is a different, uncapped subtraction on Schedule I line 12 (§ 15-30-2120(3)(c)). Both eligibility conditions are attestations with conservative defaults.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2028-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "50", type: "int" } },
    formula: iff(
      and(fact("mtMilitaryRetireeEligible"), fact("mtMilitaryRetireeWithinFiveYears")),
      minE(max0(fact("mtMontanaSourceWageIncome")), rd(pct(max0(fact("mtMilitaryRetirementIncome")), "50", "100"))),
      money("0"),
    ),
  },
  {
    id: "us.mt.parameters",
    version: 1,
    jurisdiction: "us.mt",
    title: "Montana 2025 Form 2 parameters — line structure, Schedule I adjustments, the credit lists, and the enacted TY2026-TY2027 position (House Bill 337, Ch. 227, L. 2025)",
    citation: {
      source:
        "2025 Montana Form 2 Instructions (V2 9/16/2025); printed 2025 Form 2 and Schedules I, II, III, IV, V, 2EC (2025v3 12/2025); 2026 Publication 1 (V1 September 2025); MCA Title 15 chapter 30 parts 21 and 23; enrolled House Bill 337 (Ch. 227, L. 2025), House Bill 129 (Ch. 638), House Bill 845 (Ch. 734), Senate Bill 53 (Ch. 545), Senate Bill 93 (Ch. 586), Senate Bill 544 (Ch. 582), House Bill 231 (Ch. 674); web-verified September 2026",
      section: "Form 2 lines 1-26",
      url: BOOK,
      excerpt:
        "STRUCTURE (printed 2025 Form 2 page 1, verbatim): '1 Federal adjusted gross income from Form 1040, line 11b; 2 Add Form 1040, lines 12e and 13b; 3 Subtract line 2 from line 1. If zero or less, enter 0 (zero); 4 Montana additions to federal taxable income from Schedule I, Part I, line 7; 5 Montana subtractions from federal taxable income from Schedule I, Part I, line 24; 6 $5,660 subtraction for taxpayers 65 and older ($11,320 if married filing jointly and both are 65 and older); 7 Add lines 3 and 4. Then subtract lines 5 and 6. If zero or less, enter 0 (zero). This is your Montana taxable income.' Then line 8 the tax (page 2 worksheet), 9 nonrefundable credits (Schedule III Part I line 14), 11 Montana income tax withheld (11a W-2s, 11b 1099s, 11c pass-through entity tax credit, 11d Schedule K-1 withholding, 11e Form LOWCERT loan-out withholding), 15 the earned income credit, 16 the elderly homeowner/renter credit (Schedule 2EC line 30), 17 refundable credits (Schedule III Part I line 17), 21 total payments, 22 tax due, 26 refund. DEDUCTIONS (instructions p. 7, verbatim): 'Federal standard deduction or federal itemized deductions. You must use the same type of deduction taken on your federal return to determine Montana taxable income. This amount is reported on Form 1040, line 12e.' 'The additional deductions found on Form 1040, Schedule 1-A for qualified tips, qualified overtime compensation, qualified passenger vehicle loan interest, and the enhanced deduction for seniors, are included in the calculation of Montana taxable income.' 'Important: Do not include the federal qualified business income deduction to determine your federal taxable income for Montana purposes.' (§ 15-30-2120(2)(i) adds back 'an amount equal to the qualified business income deduction claimed'.) SALT ADD-BACK (§ 15-30-2120(2)(j), verbatim): 'for an individual taxpayer that deducts state income taxes pursuant to section 164(a)(3) of the Internal Revenue Code …, an additional amount equal to the state income tax deduction claimed, not to exceed the amount required to reduce the federal itemized amount computed under section 161 of the Internal Revenue Code … to the amount of the federal standard deduction allowable under section 63(c)' — computed on Worksheet B and reported on Schedule I Part I line 4; new placement for TY2025. SCHEDULE I additions lines 1-7 (out-of-state municipal bond interest, recoveries, taxable MSA and first-time homebuyer distributions, the state income tax add-back, expenses used to claim a Montana credit, coded other additions AC/AF/AG/AN/AZ) and subtractions lines 8-24 (state tax refunds, federal bond interest, recoveries, exempt tribal income on Form ETM, active-duty military salary, the working-military-retiree subtraction on Form WMRE, medical savings account deposits up to $4,600, first-time homebuyer accounts, 529 up to $4,500/$9,000, ABLE up to $3,000/$6,000, recycled-material expenses on Form RCYL, expenses offset by a federal credit, cannabis § 280E expenses, coded business subtractions SE/SJ/SO/SG/SL/SN/SP/SQ/SR, and Tier I and Tier II Railroad Retirement). NO SOCIAL SECURITY SUBTRACTION EXISTS — Montana taxes the federally taxable portion with no state modification; the pre-2024 Social Security worksheet was repealed with SB 399. NONREFUNDABLE CREDITS (Schedule III Part I lines 1-14): other state or country tax, qualified endowment (Form QEC), recycle (RCYL), apprenticeship, trades education and training (TETC), innovative educational program, student scholarship organization, contractor's gross receipts, historic property preservation, infrastructure users fee (IUFC), MEDIA, jobs growth incentive (JGI), and carryforwards from expired credits (codes BBSC, IRAC, GEOT, AESC, AEPC, DCAC, EMPZ, ADPT, MINE). REFUNDABLE (Schedule III Part I lines 15-17): the adoption credit ($7,500 for a foster-care child, $5,000 otherwise, § 15-30-2321, terminates December 31, 2031) and the unlocking public lands credit ($750 per agreement, maximum $3,000 per year, § 15-30-2380). Montana has NO child tax credit and NO child care credit — the dependent care assistance credit was repealed effective TY2022 and survives only as a five-year carryforward under code DCAC. TY2026 (HB 337 §§ 1, 3, applicability 'the income tax year beginning January 1, 2026'; booklet p. 42 '2026 Tax Tables'; 2026 Publication 1): ordinary rates 4.7% then 5.65% over $47,500 single and MFS, $95,000 MFJ and qualifying surviving spouse, $71,250 head of household; capital gains 3% then 4.1% on the same structure; the earned income credit doubles to 20% of the federal credit; HB 129 adds a $3,000 inflation-adjusted subtraction for qualified volunteer firefighters and volunteer emergency care providers. HB 337 § 4 (Transition): 'The modified inflation factor provided for in 15-30-2103(3) does not apply until tax year 2028' — the TY2026 and TY2027 brackets are STATUTORY and NOT indexed. TY2027 (HB 337 § 2, effective January 1, 2027): 4.7% then 5.4% over $65,000 / $130,000 / $97,500. UNPUBLISHED as of September 2026 and therefore not encoded for TY2026: the indexed age-65 subtraction, the indexed 529 cap, the volunteer firefighter subtraction amount, and the TY2026 Form 2 line numbering (no 2026 form exists). The elderly credit's $45,000 / $12,600 / $1,150 figures and both of its tables are statutory, unindexed and untouched by the 2025 session, so that rule carries through TY2026. OUT OF SCOPE: nonresident, part-year and mixed-residency returns (Schedule II apportionment), the Montana medical savings account Part II adjustment, Schedule IV penalties and interest, the pass-through entity tax credit, and the property tax rebate (House Bill 231 rebated TAX YEAR 2024 property taxes on a separate application at getmyrebate.mt.gov and never touches Form 2 — but the booklet requires counting it in gross household income on Schedule 2EC line 8).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      msaCap: { value: "460000", type: "money" },
      adoptionCreditFosterChild: { value: "750000", type: "money" },
      adoptionCreditOtherChild: { value: "500000", type: "money" },
      unlockingPublicLandsPerAgreement: { value: "75000", type: "money" },
      unlockingPublicLandsMaximum: { value: "300000", type: "money" },
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: Montana Form 2 composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.mt.income_tax, us.mt.ordinary_income_tax, us.mt.capital_gains_tax, us.mt.age65_subtraction, us.mt.eitc, us.mt.elderly_homeowner_renter_credit, us.mt.other_state_credit, us.mt.tuition_savings_subtraction, us.mt.able_subtraction, and us.mt.military_retirement_subtraction",
    },
  },

  // ---- TY2026 and TY2027: House Bill 337 (Ch. 227, L. 2025), statutory and NOT inflation-indexed ----
  {
    id: "us.mt.ordinary_income_tax",
    version: 2,
    jurisdiction: "us.mt",
    title: "Montana ordinary income tax TY2026 — 4.7% to $47,500 single and MFS, $95,000 MFJ and qualifying surviving spouse, $71,250 head of household, then 5.65% (House Bill 337)",
    citation: {
      source: "Enrolled House Bill 337 (Ch. 227, L. 2025) §§ 1, 5, 6; MCA § 15-30-2103 (Temporary); 2025 Montana Form 2 Instructions p. 42 '2026 Tax Tables'; 2026 Publication 1",
      section: "MCA § 15-30-2103(1) (Temporary); HB 337 § 1",
      url: MCA("210", "030"),
      excerpt:
        "STATUTE (§ 15-30-2103(1) (Temporary), verbatim): '(a) for every married individual who files a joint return and for every surviving spouse: (i) on the first $95,000 of Montana taxable income or any part of that income, 4.7%; (ii) on any Montana taxable income in excess of $95,000 or any part of that income, 5.65%; (b) for every head of household: (i) on the first $71,250 … 4.7%; (ii) … in excess of $71,250 … 5.65%; (c) for every individual other than a surviving spouse or head of household who is not a married individual: (i) on the first $47,500 … 4.7%; (ii) … in excess of $47,500 … 5.65%; (d) for every married individual who does not make a joint return and for every estate or trust …: (i) on the first $47,500 … 4.7%; (ii) … in excess of $47,500 … 5.65%.' Terminator: '(Terminates December 31, 2026--sec. 7, Ch. 227, L. 2025.)' HB 337 § 6(1): '[Sections 1 and 3] apply to the income tax year beginning January 1, 2026.' HB 337 § 4 (Transition): 'The modified inflation factor provided for in 15-30-2103(3) does not apply until tax year 2028.' — these brackets are statutory and NOT indexed. BOOKLET p. 42 ('2026 Tax Tables', verbatim, single and MFS): '$0 | $47,500 | 4.7% ; $47,500 or greater | 5.65%'. ENCODING: the 2026 schedule prints no 'Less' constant (the TY2026 Form 2 does not exist yet — it publishes ~September 2026), so this rule accumulates the two brackets EXACTLY (4.7% of the threshold plus 5.65% of the excess, one half-up rounding) rather than inventing a subtraction amount. The exact continuity figure for head of household is $676.875, which is not a whole cent, so no honest constant exists to encode. If the Department truncates its 2026 constants the way it truncated the 2025 ones ($253.20 -> $253), the printed schedule will sit up to $1 above this rule — re-verify when the 2026 booklet publishes.",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { rate1Bps: { value: "470", type: "int" }, rate2Bps: { value: "565", type: "int" }, thresholdSingle: { value: "4750000", type: "money" }, thresholdJoint: { value: "9500000", type: "money" }, thresholdHoh: { value: "7125000", type: "money" } },
    formula: ordinaryTax(max0(sub(max0(fact("stateTaxableIncome")), minE(max0(fact("stateTaxableIncome")), max0(fact("mtNetLongTermCapitalGains"))))), BR_2026),
  },
  {
    id: "us.mt.capital_gains_tax",
    version: 2,
    jurisdiction: "us.mt",
    title: "Montana net long-term capital gains tax TY2026 — 3% below the $47,500 / $95,000 / $71,250 threshold after ordinary income, 4.1% above (House Bill 337)",
    citation: {
      source: "MCA § 15-30-2103(2) (Temporary); enrolled House Bill 337 (Ch. 227, L. 2025) § 1; 2025 Montana Form 2 Instructions p. 42 '2026 Tax Tables'",
      section: "MCA § 15-30-2103(2) (Temporary)",
      url: MCA("210", "030"),
      excerpt:
        "BOOKLET p. 42 ('2026 Tax Tables', Net Long-Term Capital Gains Rate, single and MFS, verbatim): 'For net long-term capital gains above $0 | But less than $47,500 minus ordinary income | 3% ; $47,500 minus ordinary income | 4.1% ; If ordinary income exceeds $47,500 | 4.1%.' The joint column uses $95,000 and head of household $71,250. The 3% and 4.1% RATES are unchanged from 2025 — only the thresholds move. The page 2 worksheet arithmetic is unchanged, and lines 8 and 10 still round separately.",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { lowRateBps: { value: "300", type: "int" }, highRateBps: { value: "410", type: "int" }, thresholdSingle: { value: "4750000", type: "money" }, thresholdJoint: { value: "9500000", type: "money" }, thresholdHoh: { value: "7125000", type: "money" } },
    formula: capitalGainsTax(fact("stateTaxableIncome"), fact("mtNetLongTermCapitalGains"), BR_2026),
  },
  {
    id: "us.mt.income_tax",
    version: 2,
    jurisdiction: "us.mt",
    title: "Montana resident tax TY2026 — the ordinary income tax plus the net long-term capital gains tax under the House Bill 337 brackets",
    citation: {
      source: "Enrolled House Bill 337 (Ch. 227, L. 2025) §§ 1, 4, 5, 6; MCA § 15-30-2103 (Temporary); 2025 Montana Form 2 Instructions p. 42; 2026 Publication 1",
      section: "MCA § 15-30-2103 (Temporary); Form 2 page 2 line 13",
      url: MCA("210", "030"),
      excerpt:
        "TY2026 brackets, published a full year ahead in the 2025 booklet (p. 42) and in 2026 Publication 1, and matching MCA § 15-30-2103 (Temporary) digit for digit: 4.7% to $47,500 single and married filing separately, $95,000 married filing jointly and qualifying surviving spouse, $71,250 head of household, then 5.65%; net long-term capital gains 3% then 4.1% on the same thresholds. Statutory and NOT inflation-indexed (HB 337 § 4). The TY2026 Form 2 and its schedules do not exist yet, so the Form 2 line numbering, the indexed age-65 subtraction, the indexed 529 cap and the new House Bill 129 volunteer firefighter subtraction are all unpublished and deliberately not encoded for TY2026 — the age-65 and 529 rules end 2026-01-01 and refuse rather than guess.",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {},
    formula: add(
      capitalGainsTax(fact("stateTaxableIncome"), fact("mtNetLongTermCapitalGains"), BR_2026),
      ordinaryTax(max0(sub(max0(fact("stateTaxableIncome")), minE(max0(fact("stateTaxableIncome")), max0(fact("mtNetLongTermCapitalGains"))))), BR_2026),
    ),
  },
  {
    id: "us.mt.eitc",
    version: 2,
    jurisdiction: "us.mt",
    title: "Montana earned income tax credit TY2026 — 20% of the federal earned income credit, refundable (House Bill 337)",
    citation: {
      source: "MCA § 15-30-2318(2); enrolled House Bill 337 (Ch. 227, L. 2025) §§ 3, 6(1); 2025 Montana Form 2 Instructions 'What's New'; 2026 Publication 1; Montana Employer and Information Agent Guide",
      section: "MCA § 15-30-2318(2)",
      url: MCA("230", "180"),
      excerpt:
        "STATUTE (§ 15-30-2318(2), verbatim): 'The amount of the credit allowed under subsection (1) is 20% of the amount of the credit determined for the tax year under section 32 of the Internal Revenue Code, 26 U.S.C. 32.' Enrolled HB 337 § 3 shows the amendment as '10% 20%', and § 6(1): '[Sections 1 and 3] apply to the income tax year beginning January 1, 2026.' BOOKLET What's New (verbatim): 'The bill also increases the Montana earned income tax credit to 20% of the federal earned income tax credit beginning in tax year 2026.' Still refundable under § 15-30-2318(4). The 20% is PERMANENT: Ch. 227 § 7's termination clause applies to '[Section 1]' — the § 15-30-2103 (Temporary) RATE section — not to § 3, which amends the earned income credit. So this version carries through TY2027 rather than expiring with the 2026 rate table.",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2028-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "20", type: "int" } },
    formula: rd(pct(max0(fact("mtFederalEic")), "20", "100")),
  },
  {
    id: "us.mt.ordinary_income_tax",
    version: 3,
    jurisdiction: "us.mt",
    title: "Montana ordinary income tax TY2027 — 4.7% to $65,000 single and MFS, $130,000 MFJ and qualifying surviving spouse, $97,500 head of household, then 5.4% (House Bill 337 § 2)",
    citation: {
      source: "Enrolled House Bill 337 (Ch. 227, L. 2025) §§ 2, 4, 5(3), 6(2); MCA § 15-30-2103 (Effective January 1, 2027); 2025 Montana Form 2 Instructions p. 42 '2027 Tax Tables'",
      section: "MCA § 15-30-2103(1) (Effective January 1, 2027); HB 337 § 2",
      url: MCA("210", "030"),
      excerpt:
        "BOOKLET p. 42 ('2027 Tax Tables', verbatim, single and MFS): '$0 | $65,000 | 4.7% ; $65,000 or greater | 5.4%'; joint $130,000 and head of household $97,500. HB 337 § 5(3): '[Section 2] is effective January 1, 2027.' § 6(2): '[Section 2] applies to income tax years beginning after December 31, 2026.' INDEXING RESUMES AFTER THIS YEAR: § 15-30-2103(3) (2027 version, verbatim): 'By November 1 of each year, the department shall multiply the bracket amounts contained in subsections (1) and (2) by the modified inflation factor for the following tax year and round the cumulative brackets to the nearest $100.' with (4)(a) substituting the June 2026 consumer price index as the base — but HB 337 § 4 defers it: 'The modified inflation factor provided for in 15-30-2103(3) does not apply until tax year 2028.' So TY2027 uses these statutory figures unindexed, and TY2028 onward must be re-verified against the Department's November determination. No 'Less' constant is printed for 2027 either, so this rule accumulates the brackets exactly (4.7% of the threshold plus 5.4% of the excess, one half-up rounding); the TY2027 form is years from publication.",
    },
    effectiveFrom: "2027-01-01",
    effectiveTo: "2028-01-01",
    output: { type: "money" },
    parameters: { rate1Bps: { value: "470", type: "int" }, rate2Bps: { value: "540", type: "int" }, thresholdSingle: { value: "6500000", type: "money" }, thresholdJoint: { value: "13000000", type: "money" }, thresholdHoh: { value: "9750000", type: "money" } },
    formula: ordinaryTax(max0(sub(max0(fact("stateTaxableIncome")), minE(max0(fact("stateTaxableIncome")), max0(fact("mtNetLongTermCapitalGains"))))), BR_2027),
  },
  {
    id: "us.mt.capital_gains_tax",
    version: 3,
    jurisdiction: "us.mt",
    title: "Montana net long-term capital gains tax TY2027 — 3% below the $65,000 / $130,000 / $97,500 threshold after ordinary income, 4.1% above (House Bill 337 § 2)",
    citation: {
      source: "MCA § 15-30-2103(2) (Effective January 1, 2027); enrolled House Bill 337 (Ch. 227, L. 2025) § 2; 2025 Montana Form 2 Instructions p. 42 '2027 Tax Tables'",
      section: "MCA § 15-30-2103(2) (Effective January 1, 2027)",
      url: MCA("210", "030"),
      excerpt:
        "BOOKLET p. 42 ('2027 Tax Tables', Net Long-Term Capital Gains Rate, verbatim, single and MFS): 'For net long-term capital gains above $0 | But less than $65,000 minus ordinary income | 3% ; $65,000 minus ordinary income | 4.1% ; If ordinary income exceeds $65,000 | 4.1%.' Joint $130,000, head of household $97,500. The 3% and 4.1% rates are unchanged across all three years; only the thresholds move.",
    },
    effectiveFrom: "2027-01-01",
    effectiveTo: "2028-01-01",
    output: { type: "money" },
    parameters: { lowRateBps: { value: "300", type: "int" }, highRateBps: { value: "410", type: "int" }, thresholdSingle: { value: "6500000", type: "money" }, thresholdJoint: { value: "13000000", type: "money" }, thresholdHoh: { value: "9750000", type: "money" } },
    formula: capitalGainsTax(fact("stateTaxableIncome"), fact("mtNetLongTermCapitalGains"), BR_2027),
  },
  {
    id: "us.mt.income_tax",
    version: 3,
    jurisdiction: "us.mt",
    title: "Montana resident tax TY2027 — the ordinary income tax plus the net long-term capital gains tax under the House Bill 337 § 2 brackets",
    citation: {
      source: "Enrolled House Bill 337 (Ch. 227, L. 2025) §§ 2, 4, 5(3), 6(2); MCA § 15-30-2103 (Effective January 1, 2027); 2025 Montana Form 2 Instructions p. 42",
      section: "MCA § 15-30-2103 (Effective January 1, 2027)",
      url: MCA("210", "030"),
      excerpt:
        "TY2027: 4.7% to $65,000 single and married filing separately, $130,000 married filing jointly and qualifying surviving spouse, $97,500 head of household, then 5.4%; net long-term capital gains 3% then 4.1% on the same thresholds. Published in the 2025 booklet (p. 42) and codified as the '(Effective January 1, 2027)' version of § 15-30-2103. Bracket indexing is deferred to TY2028 by HB 337 § 4, so TY2028 onward must be re-verified against the Department's November determination — this version ends 2028-01-01. Everything downstream of the rate (the age-65 subtraction, the 529 cap, the earned income credit percentage, the elderly credit) must be re-checked against the TY2027 booklet when it publishes.",
    },
    effectiveFrom: "2027-01-01",
    effectiveTo: "2028-01-01",
    output: { type: "money" },
    parameters: {},
    formula: add(
      capitalGainsTax(fact("stateTaxableIncome"), fact("mtNetLongTermCapitalGains"), BR_2027),
      ordinaryTax(max0(sub(max0(fact("stateTaxableIncome")), minE(max0(fact("stateTaxableIncome")), max0(fact("mtNetLongTermCapitalGains"))))), BR_2027),
    ),
  },
];
