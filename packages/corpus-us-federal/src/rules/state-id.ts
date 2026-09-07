import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money } from "./state-helpers.js";

/**
 * Idaho deep pack — TY2025 Form 40 (full-year resident). Every amount verified
 * from the 2025 Idaho Individual Income Tax Forms and Instructions booklet
 * (EIN00046, 03-02-2026, 52 pp: General Information pp. 2-6, Form 40 lines
 * pp. 7-14, Form 39R lines pp. 27-39), the printed 2025 Form 40 (EFO00089) and
 * Form 39R (EFO00088), and Idaho Code Title 63 Chapter 30 (§§ 63-3022,
 * 63-3022A, 63-3022D, 63-3022H, 63-3022P, 63-3022Q, 63-3024, 63-3024A,
 * 63-3029, 63-3029A, 63-3029C, 63-3029L, 63-3030, 63-3082 at
 * legislature.idaho.gov, current through the 2026 session).
 *
 * Load-bearing findings:
 *  - Idaho has NO tax table: Form 40 line 20 is a four-line worksheet — 5.3%
 *    (H40, 2025) of Idaho taxable income over a CPI-indexed threshold ($4,811
 *    single and MFS; $9,622 MFJ, HOH, and QSS — § 63-3024(2) treats surviving
 *    spouses and heads of household as joint filers).
 *  - The deduction is the FEDERAL standard deduction ($15,750 / $31,500 /
 *    $23,625 plus $1,600 / $2,000 age-blind amounts, dependent floor) or federal
 *    itemized deductions less state and local income OR sales taxes (line 14
 *    reads Schedule A line 5a, or 5e − 5b − 5c when 5d exceeds the $40,000 cap).
 *  - No personal exemptions since 2018; instead a $155 refundable Food Tax
 *    Credit per household member (§ 63-3024A, $155 "for tax year 2025 and each
 *    year thereafter"; $12.92 per qualified month) and a $205 nonrefundable
 *    child tax credit that § 63-3029L SUNSETS for taxable years beginning on or
 *    after January 1, 2026 — the 2026 extension bills (S1450, H0782) died in
 *    the 2026 session, so that rule ends 2026-01-01.
 *  - The retirement benefits deduction (§ 63-3022A) is capped at the Social
 *    Security maximums ($48,216 single, $72,324 joint for 2025) less SS and
 *    railroad benefits received, MFS excluded.
 *  - Every filer required to file owes the $10 permanent building fund tax
 *    (§ 63-3082) unless on Idaho public assistance or legally blind.
 */

const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const cmp = (op: "lt" | "le" | "gt" | "ge" | "eq" | "ne", left: Expr, right: Expr): Expr => ({ kind: "cmp", op, left, right });
const le = (l: Expr, r: Expr): Expr => cmp("le", l, r);
const gt = (l: Expr, r: Expr): Expr => cmp("gt", l, r);
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const add = (...args: Expr[]): Expr => ({ kind: "add", args });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const minE = (...args: Expr[]): Expr => ({ kind: "min", args });
const maxE = (...args: Expr[]): Expr => ({ kind: "max", args });
const or = (...args: Expr[]): Expr => ({ kind: "or", args });
const not = (arg: Expr): Expr => ({ kind: "not", arg });
const int = (value: string): Expr => ({ kind: "int", value });
const mulInt = (base: Expr, count: Expr): Expr => ({ kind: "mulInt", base, count });
const isStatus = (v: string): Expr => cmp("eq", fact("filingStatus"), { kind: "enum", value: v });
const isJointLike: Expr = or(isStatus("mfj"), isStatus("qss"), isStatus("hoh")); // § 63-3024(2)(b): surviving spouse and HOH "shall be treated as a joint return"
const isMfj: Expr = isStatus("mfj");
const pct = (base: Expr, num: string, den: string): Expr => ({ kind: "mulRate", base, rate: { num, den }, round: "half-up" });
const half = (x: Expr): Expr => pct(x, "1", "2");

const BOOKLET_URL = "https://tax.idaho.gov/document-mngr/forms_EIN00046/";
const FORM40_URL = "https://tax.idaho.gov/document-mngr/forms_EFO00089/";
const FORM39R_URL = "https://tax.idaho.gov/document-mngr/forms_EFO00088/";
const CODE = (s: string) => `https://legislature.idaho.gov/statutesrules/idstat/Title63/T63CH30/SECT${s}/`;

export const idRules: Rule[] = [
  {
    id: "us.id.income_tax",
    version: 1,
    jurisdiction: "us.id",
    title: "Idaho income tax — 5.3% of Idaho taxable income over $4,811 (single, MFS) or $9,622 (MFJ, HOH, QSS) (Form 40 line 20 worksheet)",
    citation: {
      source: "Idaho Code § 63-3024(2)-(3) (as amended by 2025 ch. 13 [H40]: 5.3%; thresholds indexed from $2,500 / $5,000 by the CPI factor since 2000); 2025 Form 40 instructions, line 20 'Worksheet' p. 9; Form 40 line 20 'Tax from worksheet'",
      section: "§ 63-3024; Form 40 line 20",
      url: CODE("63-3024"),
      excerpt:
        "STATUTE (verbatim): '(2)(a) The tax imposed upon individuals, trusts, and estates shall be computed at the rate of five and three-tenths percent (5.3%) of taxable income over two thousand five hundred dollars ($2,500). (b) For taxpayers filing a joint return pursuant to the provisions of section 63-3031, Idaho Code, the tax imposed shall be computed at the rate of five and three-tenths percent (5.3%) of taxable income over five thousand dollars ($5,000). For the purposes of this section, a return of a surviving spouse, as defined in section 2(a) of the Internal Revenue Code, and a head of household, as defined in section 2(b) of the Internal Revenue Code, shall be treated as a joint return. (3) For taxable year 2000 and each year thereafter, the state tax commission shall prescribe a factor that shall be used to compute the Idaho income tax thresholds provided in subsection (2) of this section. The factor shall provide an adjustment to the Idaho tax thresholds so that inflation will not result in a tax increase. … multiply the last threshold amount by the percentage (the consumer price index for the calendar year immediately preceding the calendar year to which the adjusted threshold amount will apply divided by the consumer price index for calendar year 1998).' History: '[63-3024, added 2022, 1st E.S., ch. 1, sec. 5, p. 6; am. 2024, ch. 237, sec. 2, p. 824; am. 2025, ch. 13, sec. 3, p. 43.]' — no 2026 amendment (H0589, 2026, was never heard). BOOKLET (What's New, p. 2): 'Tax Rate Reduction — Effective January 1, 2025, the individual income tax rate is 5.3%.' LINE 20 WORKSHEET (verbatim): '1. Enter the amount of Idaho taxable income from Form 40, line 19; 2. Enter the amount shown below for your filing status: Single or married filing separately, enter $4,811; Married filing jointly, head of household, or qualifying surviving spouse, enter $9,622; 3. Subtract line 2 from line 1. Enter the subtotal; 4. Multiply subtotal by 5.3%; 5. Idaho tax. Enter the total here and on Form 40, line 20. If zero or less, enter zero.' ROUNDING (General Information p. 6): 'Round the amounts on your return to the nearest whole dollar. Round down if under 50 cents, round up if 50 cents or more.' Idaho publishes no tax table — the worksheet is the only method. TY2026: the rate stays 5.3% but the thresholds re-index (unpublished) — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      rateBps: { value: "530", type: "int" },
      thresholdSingleMfs: { value: "481100", type: "money" },
      thresholdJointHohQss: { value: "962200", type: "money" },
      statutoryBaseSingle: { value: "250000", type: "money" },
      statutoryBaseJoint: { value: "500000", type: "money" },
    },
    formula: rd(pct(max0(sub(max0(fact("stateTaxableIncome")), iff(isJointLike, money("962200"), money("481100")))), "53", "1000")),
  },
  {
    id: "us.id.standard_deduction",
    version: 1,
    jurisdiction: "us.id",
    title: "Idaho standard deduction — the federal amounts: $15,750 single and MFS, $31,500 MFJ and QSS, $23,625 HOH, plus $1,600 ($2,000 single or HOH) per 65-or-older/blind box; a dependent filer's base is the larger of $1,350 or earned income + $450, capped at the filing-status amount (Form 40 line 16 and the Standard Deduction Worksheet)",
    citation: {
      source: "Idaho Code § 63-3022(j)(1) ('The standard deduction as defined in section 63 of the Internal Revenue Code'); 2025 Form 40 instructions, 'Standard Deduction Worksheet' pp. 8-9; printed Form 40 left margin ('Standard Deduction for Most People')",
      section: "§ 63-3022(j); Form 40 lines 12a-12c, 16",
      url: BOOKLET_URL,
      excerpt:
        "STATUTE (verbatim): '(j) In the case of an individual, there shall be allowed as a deduction from gross income either paragraph (1) or (2) of this subsection at the option of the taxpayer: (1) The standard deduction as defined in section 63 of the Internal Revenue Code; or (2) Itemized deductions as defined in section 63 of the Internal Revenue Code except state or local taxes measured by net income and general sales taxes as either is defined in section 164 of the Internal Revenue Code.' FORM 40 margin (verbatim): 'Standard Deduction for Most People — Single or Married Filing Separately: $15,750; Head of Household: $23,625; Married Filing Jointly or Qualifying Surviving Spouse: $31,500'. WORKSHEET (verbatim): '1. Enter the amount shown below for your filing status: Single or married filing separately, enter $15,750; Married filing jointly or qualifying surviving spouse, enter $31,500; Head of household, enter $23,625. 2. Can someone else claim you as a dependent? No. Enter the amount from line 1 on line 4. Skip line 3. Yes. Go to line 3. 3. Is your earned income* more than $900? Yes. Add $450 to your earned income. Enter the total. No. Enter $1,350. 4. If someone else can claim you as a dependent, enter the smaller of lines 1 or 3. If born after January 1, 1961, and not blind, skip to line 6. Otherwise, go to line 5. 5. If born before January 2, 1961, or blind, multiply the total number of boxes checked on Form 40, lines 12a and 12b, by $1,600 ($2,000 if single or head of household). 6. Add lines 4 and 5. Enter the total here and on Form 40, line 16.' 'Line 12a … The boxes you check here must match your federal return.' '*Earned income includes wages, salaries, tips, professional fees, and other compensation received for personal services you performed. It also includes any amount received as a scholarship that you must include in your income.' ENCODING: base by status; dependent filer → min(base, max($1,350, earned + $450)) (line 3's 'more than $900' test is the same thing); plus idAgeBlindBoxes × $2,000 (single, HOH) or $1,600 (MFJ, QSS, MFS). The 2026 federal amounts are known but Idaho's 2026 worksheet is unpublished — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      single: { value: "1575000", type: "money" },
      joint: { value: "3150000", type: "money" },
      hoh: { value: "2362500", type: "money" },
      perBoxSingleHoh: { value: "200000", type: "money" },
      perBoxMarried: { value: "160000", type: "money" },
      dependentFloor: { value: "135000", type: "money" },
      dependentEarnedAddOn: { value: "45000", type: "money" },
    },
    formula: (() => {
      const base: Expr = iff(or(isStatus("mfj"), isStatus("qss")), money("3150000"), iff(isStatus("hoh"), money("2362500"), money("1575000")));
      const depBase = minE(base, maxE(money("135000"), add(max0(fact("idEarnedIncome")), money("45000"))));
      const l4: Expr = iff(fact("isClaimedAsDependent"), depBase, base);
      const perBox: Expr = iff(or(isStatus("single"), isStatus("hoh")), money("200000"), money("160000"));
      return add(l4, mulInt(perBox, fact("idAgeBlindBoxes")));
    })(),
  },
  {
    id: "us.id.itemized_deductions",
    version: 1,
    jurisdiction: "us.id",
    title: "Idaho itemized deductions — federal Schedule A total (plus any federal foreign tax credit) minus state and local income or general sales taxes: Schedule A line 5a, or line 5e less lines 5b and 5c when line 5d exceeds $40,000 ($20,000 MFS) (Form 40 lines 13-15)",
    citation: {
      source: "Idaho Code § 63-3022(j)(2); 2025 Form 40 instructions, 'Itemized Deductions' and 'Federal Foreign Tax Credit' p. 8; printed Form 40 lines 13-15",
      section: "§ 63-3022(j)(2); Form 40 lines 13, 14, 15",
      url: BOOKLET_URL,
      excerpt:
        "FORM (verbatim): '13. Itemized deductions. Include federal Schedule A. Federal limits apply; 14. State and local income or general sales taxes included on federal Schedule A; 15. Subtract line 14 from line 13. If you don't use federal Schedule A, enter zero; 16. Standard deduction …; 17. Subtract the larger of line 15 or 16 from line 11. If less than zero, enter zero'. BOOKLET (verbatim): 'Idaho requires you to subtract state income tax, local income tax, or general sales tax on federal Schedule A from your total itemized amount before you use that amount to reduce your income. Because of this addback, it might be more beneficial to itemize for federal purposes but use the standard deduction for Idaho.' 'Itemized Deductions — If you use federal Schedule A to itemize, follow these instructions for line 14. If federal Schedule A, line 5d, is: $40,000 or less ($20,000 if married filing separately), enter the amount from federal Schedule A, line 5a. More than $40,000 ($20,000 if married filing separately), subtract lines 5b and 5c from line 5e, and enter the amount here. Enter zero for any result less than zero.' 'Federal Foreign Tax Credit: If you claim the federal foreign tax credit, Idaho allows that amount as a deduction. Idaho doesn't have a credit that matches the federal foreign tax credit. Add the amount you claimed for the federal foreign tax credit to your Idaho itemized deductions.' 'You Must Itemize If: Your filing status is married filing separately and your spouse itemizes …' ENCODING: line 13 = Schedule A line 17 + federal foreign tax credit; line 14 = 5a when 5a + 5b + 5c ≤ $40,000 ($20,000 MFS), else max0(5e − 5b − 5c); line 15 = max0(13 − 14). The composer takes the larger of line 15 and line 16. The federal SALT cap indexes to $40,400 ($20,200 MFS) for 2026 and Idaho's 2026 line 14 instruction is unpublished — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { saltCap: { value: "4000000", type: "money" }, saltCapMfs: { value: "2000000", type: "money" } },
    formula: (() => {
      const a = max0(fact("idSaltIncomeOrSalesTaxes"));
      const b = max0(fact("idRealEstateTaxes"));
      const c = max0(fact("idPersonalPropertyTaxes"));
      const d = add(a, b, c);
      const cap: Expr = iff(isStatus("mfs"), money("2000000"), money("4000000"));
      const l14: Expr = iff(le(d, cap), a, max0(sub(max0(fact("idSaltAllowed")), add(b, c))));
      const l13 = add(max0(fact("idFederalItemizedDeductions")), max0(fact("idForeignTaxCredit")));
      return max0(sub(l13, l14));
    })(),
  },
  {
    id: "us.id.child_tax_credit",
    version: 1,
    jurisdiction: "us.id",
    title: "Idaho Child Tax Credit — $205 per qualifying child age 16 or under, nonrefundable, limited to the tax after the other-state, Form 39R Part D, and Form 44 credits (Form 40 line 24 worksheet); sunsets after TY2025",
    citation: {
      source: "Idaho Code § 63-3029L(1) ('For taxable years beginning on or after January 1, 2018, and before January 1, 2026'); 2025 Form 40 instructions, line 24 and 'Child Tax Credit Worksheet' pp. 9-10; printed Form 40 line 24",
      section: "§ 63-3029L; Form 40 line 24",
      url: CODE("63-3029L"),
      excerpt:
        "STATUTE (verbatim): '(1) For taxable years beginning on or after January 1, 2018, and before January 1, 2026, there shall be allowed to a taxpayer a nonrefundable credit against the tax imposed by this chapter in the amount of two hundred five dollars ($205) with respect to each qualifying child of the taxpayer. For purposes of this section, the term \"qualifying child\" has the meaning as defined in section 24(c) of the Internal Revenue Code. In no event shall more than one (1) taxpayer be allowed this credit for the same qualifying child. This credit is available only to Idaho residents. Any part-year resident entitled to a credit under this section shall receive a proportional credit reflecting the part of the year in which the part-year resident was domiciled in Idaho.' History ends '[… am. 2020, ch. 271, sec. 3, p. 795.]' — the 2026 session's extension bills (S1450 'Child tax credit, permanent', which died in Senate Local Government and Taxation, and H0782 'Income taxes', which struck the sunset but was never heard) did not pass; the Tax Commission's withholding guidance (tax.idaho.gov/taxes/income-tax/withholding/computing, updated July 29, 2026) states 'The Idaho Child Tax Credit has sunsetted per Idaho Code Section 63-3029L. Because the credit is no longer in effect, the allowance amount will be zero.' BOOKLET (verbatim): 'To qualify for the Idaho Child Tax Credit, the child must be both of these: Your qualifying child. Age 16 or under as of December 31, 2025.' 'Note: This credit is limited to your tax liability after any credit for tax paid to other states and credits from Forms 39R and 44.' WORKSHEET: '1. Enter the number of your qualifying children; 2. Multiply line 1 by $205; 3. Enter the amount from Form 40, line 20; 4. Enter the amount from Form 40, line 21; 5. Enter the amount from Form 40, line 22; 6. Enter the amount from Form 40, line 23; 7. Subtract lines 4 through 6 from line 3. If less than zero, enter zero; 8. Enter the lesser of lines 2 or 7 here and on Form 40, line 24.'",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { perChild: { value: "20500", type: "money" } },
    formula: minE(
      mulInt(money("20500"), fact("idQualifyingChildren")),
      max0(sub(fact("idTaxBeforeCredits"), add(fact("idOtherStateCredit"), fact("idContributionCredits"), fact("idBusinessCredits")))),
    ),
  },
  {
    id: "us.id.food_tax_credit",
    version: 1,
    jurisdiction: "us.id",
    title: "Idaho Food Tax Credit (grocery credit) — $155 for the filer, spouse, and each dependent qualified all year, $12.92 per qualified month otherwise; refundable (Form 40 line 43 worksheet)",
    citation: {
      source: "Idaho Code § 63-3024A(1), (5)-(6), (9) (as amended 2025 [H231]: '$155 for tax year 2025 and each year thereafter'); 2025 Form 40 instructions, line 43 and 'Food Tax Credit Worksheet' pp. 11-12; printed Form 40 line 43",
      section: "§ 63-3024A; Form 40 line 43",
      url: CODE("63-3024A"),
      excerpt:
        "STATUTE (verbatim): '(1) Any resident individual who is required to file and who has filed an Idaho income tax return shall be allowed a credit against taxes due under the Idaho income tax act for the taxpayer, the taxpayer's spouse, and each dependent, as defined in section 152 of the Internal Revenue Code, claimed on the taxpayer's Idaho income tax return … For tax year 2022, the credit is one hundred dollars ($100). For tax years 2023 and 2024, the credit is one hundred twenty dollars ($120). For tax year 2025 and each year thereafter, the credit is one hundred fifty-five dollars ($155). If taxes due are less than the total credit allowed, the taxpayer shall be paid a refund equal to the balance of the unused credit.' '(5) … for whom assistance under the federal food stamp program was received for any month or part of a month … the credit or refund allowed under this section shall be in proportion to the number of months of the year in which no assistance was received. (6) … incarcerated … in proportion to the number of months of the year in which the individual was not incarcerated.' '(9) In lieu of the flat tax credit amounts … the actual amount of sales tax paid by such persons on food purchases that took place in Idaho during the taxable year, up to a maximum of two hundred fifty dollars ($250) per person' (receipts required — not composed). BOOKLET (line 43, verbatim): 'This credit applies only to Idaho residents. You can't claim this credit if someone else, such as a parent, can claim you as a dependent. The credit is either $155 each for you, your spouse, and your qualifying dependents or the actual amount of sales tax paid during the year (up to $250 each).' WORKSHEET (verbatim): 'Yourself: 1. Number of qualified months; 2. Multiply line 1 by $12.92. If qualified for the entire year, enter $155. Spouse (if joint return): 3. Number of qualified months; 4. Multiply line 3 by $12.92. If qualified for the entire year, enter $155. Resident dependents claimed on line 6: 5. Enter $155 for each dependent who qualifies for the entire year. If a dependent qualifies for only part of the year, calculate as follows: Number of qualified months ____ x $12.92 … 6. Add amounts on lines 2, 4, and 5. Enter total on line 43.' 'Donating Your Food Tax Credit — You can donate your entire Food Tax Credit to the Cooperative Welfare Fund. To donate, check the box on line 43 and enter zero.' ENCODING: $155 × idFoodCreditPersons (people qualified all twelve months) + $12.92 × idFoodCreditPartialMonths (the sum of qualified months across partially-qualified people), rounded to whole dollars.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { perPerson: { value: "15500", type: "money" }, perMonth: { value: "1292", type: "money" }, actualCostMaxPerPerson: { value: "25000", type: "money" } },
    formula: rd(add(mulInt(money("15500"), fact("idFoodCreditPersons")), mulInt(money("1292"), fact("idFoodCreditPartialMonths")))),
  },
  {
    id: "us.id.other_state_credit",
    version: 1,
    jurisdiction: "us.id",
    title: "Idaho credit for income tax paid to other states — Form 39R Part C: Idaho tax × (other-state income ÷ Idaho adjusted income, to four decimals), limited to the other state's tax after its credits and to the Idaho tax (Form 40 line 21)",
    citation: {
      source: "Idaho Code § 63-3029(1), (3)(a)(i), (3)(c); 2025 Form 39R Part C lines 1-7 and instructions p. 37; Form 40 line 21",
      section: "§ 63-3029; Form 39R Part C; Form 40 line 21",
      url: CODE("63-3029"),
      excerpt:
        "STATUTE (verbatim): '(1) A resident individual shall be allowed a credit against the tax otherwise due under this chapter for the amount of any income tax imposed on the individual … for the taxable year by another state on income derived from sources therein while domiciled in Idaho and that is also subject to tax under this chapter.' '(3)(a)(i) The credit provided under this section to an individual shall not exceed the proportion of the tax otherwise due under this chapter that the amount of the adjusted gross income of the taxpayer derived from sources in the other state as modified by this chapter bears to the adjusted gross income of the taxpayer as modified by this chapter.' '(c) The credit provided under this section shall further be limited to the tax paid to the other state.' FORM 39R PART C (verbatim): '1. Idaho tax, Form 40, line 20; 2. Federal adjusted gross income earned in other state and both states taxed, adjusted for Idaho modifications; 3. Idaho adjusted income; 4. Divide line 2 by line 3. Enter percentage here; 5. Multiply line 1 by line 4; 6. Other state's tax due minus its income tax credits; 7. Enter the smaller of lines 5 or 6 here and on Form 40, line 21.' INSTRUCTIONS (verbatim): 'Line 3. Enter your Idaho adjusted income from Form 40, line 11 …' 'Line 4. Divide line 2 by line 3. Round to four digits to the right of the decimal point. For example, you'd round .66666 to .6667 and enter it as 66.67%.' 'Line 6. Enter the other state's tax due from its tax table or rate schedule minus its income tax credits. Don't subtract state and local tax (SALT) workaround payments or credits.' 'Line 7. … This credit can't exceed the Idaho tax due on Form 40, line 20.' One Form 39R per state; a copy of the other state's return is required. ENCODING: ratio = round-half-up(line 2 ÷ line 3, 4 decimals); line 5 = round(line 1 × ratio); credit = min(line 5, line 6, line 1); $0 when line 3 is not positive.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { ratioDecimals: { value: "4", type: "int" } },
    formula: (() => {
      const l1 = max0(fact("idTaxBeforeCredits"));
      const l3 = fact("idAdjustedIncome");
      const ratio: Expr = { kind: "mulDiv", a: max0(fact("idOtherStateIncome")), b: money("10000"), c: l3, round: "half-up" }; // ×10,000 (four decimals), money("10000") = 10,000 cents
      const l5 = rd({ kind: "mulDiv", a: l1, b: ratio, c: money("10000"), round: "half-up" });
      return iff(gt(l3, money("0")), minE(l5, max0(fact("idOtherStateTaxDue")), l1), money("0"));
    })(),
  },
  {
    id: "us.id.educational_contribution_credit",
    version: 1,
    jurisdiction: "us.id",
    title: "Idaho credit for contributions to Idaho educational entities — the smallest of half the cash donated, 50% of the Idaho tax, $500 ($1,000 joint), and the tax remaining after the other-state credit (Form 39R Part D line 1)",
    citation: {
      source: "Idaho Code § 63-3029A (50% of contributions; individual limit 50% of the § 63-3024 tax or $500); 2025 Form 39R Part D line 1 and instructions pp. 37-38; Form 40 line 22",
      section: "§ 63-3029A; Form 39R Part D line 1",
      url: CODE("63-3029A"),
      excerpt:
        "STATUTE (verbatim): 'there shall be allowed … as a credit against the income tax imposed by chapter 30, title 63, Idaho Code, an amount equal to fifty percent (50%) of the aggregate amount of charitable contributions made by such taxpayer during the year to a nonprofit corporation, fund, foundation, trust, or association organized and operated exclusively for the benefit of institutions of higher learning located within the state of Idaho … to nonprofit private or public institutions of elementary, secondary, or higher education or their foundations located within the state of Idaho … (1) In the case of a taxpayer other than a corporation, the amount allowable as a credit under this section for any taxable year shall not exceed fifty percent (50%) of such taxpayer's total income tax liability imposed by section 63-3024, Idaho Code, for the year, or five hundred dollars ($500), whichever is less.' 'For the purposes of this section, \"contribution\" means monetary donations reduced by the value of any benefit received in return such as food, entertainment, or merchandise.' BOOKLET (Part D line 1, verbatim): 'If you donated cash to a qualified educational entity, you can claim a tax credit. Donation of goods or services don't qualify. … The credit is limited to the smallest of: One-half of the amount donated; 50% of the tax on Form 40, line 20; $500 ($1,000 on a joint return); The tax on Form 40, line 20 less the amount on Form 40, line 21.' ENCODING per the booklet (the Tax Commission doubles the $500 cap on a joint return; the statute states the per-taxpayer $500). The 2026 session (H0761, ch. 184, effective July 1, 2026) amended § 63-3029A's list of qualifying entities — not the percentage or limits.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pctOfDonation: { value: "50", type: "int" }, pctOfTax: { value: "50", type: "int" }, cap: { value: "50000", type: "money" }, capJoint: { value: "100000", type: "money" } },
    formula: (() => {
      const tax = max0(fact("idTaxBeforeCredits"));
      return minE(rd(half(max0(fact("idEducationalContributions")))), rd(half(tax)), iff(isMfj, money("100000"), money("50000")), max0(sub(tax, fact("idOtherStateCredit"))));
    })(),
  },
  {
    id: "us.id.youth_rehab_contribution_credit",
    version: 1,
    jurisdiction: "us.id",
    title: "Idaho credit for contributions to Idaho youth and rehabilitation facilities — the smallest of half the donation, 20% of the Idaho tax, $100 ($200 joint), and the tax remaining after the other-state, educational, and Form 44 credits (Form 39R Part D line 2)",
    citation: {
      source: "Idaho Code § 63-3029C (50% of contributions; individual limit 20% of the § 63-3024 tax or $100); 2025 Form 39R Part D line 2 and instructions p. 38; Form 40 line 22",
      section: "§ 63-3029C; Form 39R Part D line 2",
      url: CODE("63-3029C"),
      excerpt:
        "STATUTE (verbatim): 'an amount equal to fifty percent (50%) of the aggregate amount of charitable contributions made by such taxpayer during the year to the anchor house or its foundation, to the children's home society of Idaho, inc., to the Idaho youth ranch or its foundation, … to a center for independent living located within the state of Idaho, … to a nonprofit substance abuse center licensed by the department of health and welfare, or to a nonprofit rehabilitation facility located within the state of Idaho or its foundation. (1) In the case of a taxpayer other than a corporation, the amount allowable as a credit under this section for any taxable year shall not exceed twenty percent (20%) of such taxpayer's total income tax liability imposed by section 63-3024, Idaho Code, for the year, or one hundred dollars ($100), whichever is less.' BOOKLET (Part D line 2, verbatim): 'You can claim this credit if you donated cash or goods to any of these: Qualified center for independent living; Youth or rehabilitation facility or its foundation; Nonprofit substance abuse center that the Idaho Dept. of Health and Welfare licenses. … The credit is limited to the smallest of: One-half of the amount donated. 20% of the tax on Form 40, line 20. $100 ($200 on a joint return). The tax on Form 40, line 20 less the amounts on Form 40, line 21; Form 39R, Part D, line 1; and Form 44, Part I, line 1.' Form 44 Part I line 1 is the investment tax credit (Form 49) — only that line, not the line 23 total, reduces the tax available for this credit.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pctOfDonation: { value: "50", type: "int" }, pctOfTax: { value: "20", type: "int" }, cap: { value: "10000", type: "money" }, capJoint: { value: "20000", type: "money" } },
    formula: (() => {
      const tax = max0(fact("idTaxBeforeCredits"));
      return minE(
        rd(half(max0(fact("idYouthContributions")))),
        rd(pct(tax, "20", "100")),
        iff(isMfj, money("20000"), money("10000")),
        max0(sub(tax, add(fact("idOtherStateCredit"), fact("idEducationalCredit"), fact("idInvestmentTaxCredit")))),
      );
    })(),
  },
  {
    id: "us.id.live_organ_donation_credit",
    version: 1,
    jurisdiction: "us.id",
    title: "Idaho credit for live organ donation expenses — unreimbursed travel, lodging, and lost wages up to $5,000, limited to the remaining tax liability; five-year carryover (Form 39R Part D line 3)",
    citation: {
      source: "Idaho Code § 63-3029K (lesser of the expenses or $5,000; nonrefundable; five-year carryforward); 2025 Form 39R Part D line 3 and instructions p. 39; Form 40 line 22",
      section: "Form 39R Part D line 3",
      url: FORM39R_URL,
      excerpt:
        "BOOKLET (verbatim): 'A living taxpayer who donates (or whose dependent donates) a qualified organ that's transplanted into another individual can claim a credit for expenses related to the donation. The credit can't be more than the taxpayer's tax liability and is limited to the smaller of: The amount of live-organ donation expenses the taxpayer paid during the tax year. $5,000. You can carry over any unused credit for five years. To claim the credit, you must donate one or more of these organs: Human bone marrow; Any part of an: Intestine, Kidney, Liver, Lung, Pancreas. Qualified expenses are those that the taxpayer or dependent incurred for travel, lodging, or lost wages and that aren't reimbursed to the taxpayer.' ENCODING: min(expenses, $5,000, tax remaining after the other-state, educational, youth/rehab, and Form 44 credits); the carryover is a note.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { cap: { value: "500000", type: "money" } },
    formula: minE(
      max0(fact("idOrganDonationExpenses")),
      money("500000"),
      max0(sub(max0(fact("idTaxBeforeCredits")), add(fact("idOtherStateCredit"), fact("idEducationalCredit"), fact("idYouthCredit"), fact("idBusinessCredits")))),
    ),
  },
  {
    id: "us.id.retirement_benefits_deduction",
    version: 1,
    jurisdiction: "us.id",
    title: "Idaho retirement benefits deduction — qualifying CSRS/FSRDS, Idaho firefighter, Idaho city police, and military retirement benefits, up to $48,216 (single) or $72,324 (joint) less Social Security and railroad benefits received; age 65 (62 if disabled; military 62 or disabled or employed); not for MFS (Form 39R Part B line 8)",
    citation: {
      source: "Idaho Code § 63-3022A(1)-(3); 2025 Form 39R Part B lines 8a-8f; 2025 Form 39R instructions, line 8 pp. 31-32",
      section: "§ 63-3022A; Form 39R Part B line 8",
      url: CODE("63-3022A"),
      excerpt:
        "STATUTE (verbatim): '(1) An amount specified by subsection (2) of this section of the following retirement benefits may be deducted by an individual from taxable income: (a) If such individual has either attained age sixty-five (65) years or has attained age sixty-two (62) years and is classified as disabled: (i) Retirement annuities paid to a retired employee or the unmarried widow or widower of a retired employee by the United States of America under the: 1. Civil service retirement system; or 2. Foreign service retirement and disability system; or 3. Offset program …; (ii) Retirement benefits paid from the firefighters' retirement fund of the state of Idaho …; (iii) Retirement benefits paid to a retired Idaho city police officer … (b) Retirement benefits paid by the United States of America to a retired member of the military services of the United States, or the unremarried widow or widower of such member, who: (i) Is classified as disabled …; (ii) Has attained the age of sixty-two (62) years by the end of the tax year; or (iii) Was employed during the tax year and received sufficient income from such employment to be required to file a federal return … (2) The amount of retirement benefits that may be deducted from taxable income shall be an amount not in excess of maximum retirement benefits under the social security act … (e) Taxpayers not described in paragraphs (a), (b), (c), and (d) of this subsection may not deduct any amount of retirement benefits under this section. This includes retirement benefits paid by the federal employees retirement system or foreign service pension system. (3) The total deduction under this section may not exceed the total amount of retirement benefits or annuities that are described in subsection (1) of this section and that are included in the taxpayer's gross income in the tax year.' FORM 39R (verbatim): '8. Retirement benefits deduction. See instructions for qualifications. a. If single, enter $48,216 or if married filing jointly, enter $72,324; b. Federal Railroad Retirement benefits received; c. Social Security benefits received; d. Line 8a minus lines 8b and 8c. If less than zero, enter zero; e. Qualifying retirement benefits included in federal income; f. Enter the smaller of line 8d or 8e here'. INSTRUCTIONS (verbatim): 'Line 8a. The maximum amounts you can deduct for 2025 are: Single $48,216; Married filing jointly $72,324. The retirement benefits you and your spouse received under the federal Social Security Act and the federal Railroad Retirement Act further reduce these maximum amounts. The amount deducted can't be more than the amount of qualified benefits included in federal income.' 'Line 8c. Enter the amount of retirement benefits you (and your spouse) received under the federal Social Security Act, Box 5 of your Form SSA-1099s.' 'If you're married, you can't claim this deduction if you file separately.' ENCODING: $0 unless idRetirementEligible (age/disability/employment tests met) and not MFS; the 'single' maximum applies to single, HOH, and QSS; 8b and 8c are GROSS benefits received (Box 5), not the taxable portion. The maximums track the Social Security maximum benefit and change every year — this rule ends 2026-01-01.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { maxSingle: { value: "4821600", type: "money" }, maxJoint: { value: "7232400", type: "money" } },
    formula: (() => {
      const l8a: Expr = iff(isMfj, money("7232400"), money("4821600"));
      const l8d = max0(sub(l8a, add(max0(fact("idRailroadBenefits")), max0(fact("idSocialSecurityBenefits")))));
      const l8f = minE(l8d, max0(fact("idQualifyingRetirementBenefits")));
      return iff(or(not(fact("idRetirementEligible")), isStatus("mfs")), money("0"), l8f);
    })(),
  },
  {
    id: "us.id.child_care_deduction",
    version: 1,
    jurisdiction: "us.id",
    title: "Idaho child and dependent care deduction — the smallest of qualified expenses paid, $12,000 less employer-excluded benefits, and each spouse's earned income (Form 39R Part B line 6 worksheet)",
    citation: {
      source: "Idaho Code § 63-3022D (as amended 2023 ch. 290: $12,000); 2025 Form 39R instructions, line 6 'Worksheet' p. 30; Form 39R Part B line 6",
      section: "§ 63-3022D; Form 39R Part B line 6",
      url: CODE("63-3022D"),
      excerpt:
        "STATUTE (verbatim): 'There shall be allowed as a deduction, in the case of an individual who maintains a household that includes as a member one (1) or more qualifying individuals, as defined in section 21(b)(1) of the Internal Revenue Code, the employment-related expenses, as defined in section 21(b)(2) of the Internal Revenue Code and as further specified and limited by section 21 (d) and (e) of the Internal Revenue Code, paid by such individual during the taxable year, not to exceed twelve thousand dollars ($12,000).' BOOKLET (line 6, verbatim): 'If you claimed the federal Credit for Child and Dependent Care Expenses, you can take an Idaho deduction for the child care expenses you paid for your dependents. The Idaho deduction is a different amount than the federal credit.' WORKSHEET (verbatim): '1. Enter the amount of qualified expenses you incurred and paid in 2025. Don't include amounts paid by your employer or excluded from taxable income; 2. Enter $12,000 for one or more children or dependents cared for during the year; 3. Enter excluded benefits from Form 2441, Part III; 4. Subtract line 3 from line 2. If zero or less, stop. You can't claim the deduction; 5. Enter your earned income; 6. If married filing a joint return, enter your spouse's earned income. All others enter the amount from line 5; 7. Enter the smallest of lines 1, 4, 5, or 6 here and on Form 39R, Part B, line 6.' 'Include federal Form 2441, Child and Dependent Care Expenses, with your return.'",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { cap: { value: "1200000", type: "money" } },
    formula: (() => {
      const l4 = max0(sub(money("1200000"), max0(fact("idDependentCareBenefitsExcluded"))));
      const earned = max0(fact("idEarnedIncome"));
      const l6: Expr = iff(isMfj, max0(fact("idSpouseEarnedIncome")), earned);
      return minE(max0(fact("idChildCareExpenses")), l4, earned, l6);
    })(),
  },
  {
    id: "us.id.health_insurance_deduction",
    version: 1,
    jurisdiction: "us.id",
    title: "Idaho health insurance premiums deduction — premiums paid for the filer, spouse, and dependents not otherwise deducted; when itemizing for Idaho, reduced by the part of the federal medical deduction allocated to health insurance (Form 39R Part B line 18 worksheet lines 1-10)",
    citation: {
      source: "Idaho Code § 63-3022P; 2025 Form 39R instructions, line 18 and the 'Health Insurance and Long-term Care Insurance Deduction Limitations' worksheet pp. 34-36",
      section: "§ 63-3022P; Form 39R Part B line 18",
      url: CODE("63-3022P"),
      excerpt:
        "STATUTE (verbatim): 'With respect to an individual taxpayer, an amount equal to the amount paid by the taxpayer during the taxable year for insurance which constitutes medical care for the taxpayer, the spouse or dependents of the taxpayer which is not otherwise deducted or accounted for by the taxpayer for Idaho income tax purposes shall be allowed as a deduction for Idaho taxable income.' BOOKLET (line 18, verbatim): 'Deduct premiums you paid for health insurance for yourself, your spouse, and your dependents if those premiums haven't already been deducted or excluded from your income. If you claimed a deduction for health insurance premiums on your federal Form 1040 or 1040-SR, Schedule A, use the worksheet on page 35 to calculate the Idaho deduction. The worksheet follows the priority that itemized deductions first apply to health insurance premiums and then to long-term care insurance.' 'Salary Reduction Plans — You can't include premiums paid through a cafeteria plan or other salary-reduction arrangement …' 'Business Deductions — You can't include in this Idaho deduction the premiums you already deducted as a business expense. This includes self-employed health insurance premiums deducted in arriving at federal adjusted gross income.' 'Idaho Standard Deduction — If you use the Idaho standard deduction instead of itemizing your deductions for Idaho purposes, you don't have to reduce your health insurance costs by any amount claimed as a federal itemized deduction.' WORKSHEET (verbatim): 'If you aren't itemizing deductions for Idaho, skip lines 1-6 and enter zeros on lines 8, 12, and 13. 1. Amount claimed for health insurance costs on federal Form 1040 or 1040-SR, Schedule A; 2. Amount claimed for long-term care insurance on federal … Schedule A; 3. Additional medical expenses claimed on federal … Schedule A; 4. Total medical expenses. Add lines 1, 2, and 3; 5. Enter 7.5% of federal adjusted gross income; 6. Medical expense deduction allowed on federal … Schedule A. (Subtract line 5 from line 4. If less than zero, enter zero.) Health Insurance: 7. Enter the total paid for health insurance; 8. Portion of health insurance deduction allowed on federal … Schedule A. Enter the lesser of lines 1 or 6; 9. Enter the total health insurance costs deducted elsewhere on the federal return; 10. Idaho health insurance deduction allowed. Subtract lines 8 and 9 from line 7. Enter this amount on Form 39R, line 18.'",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { medicalFloorBps: { value: "750", type: "int" } },
    formula: (() => {
      const l1 = max0(fact("idSchAHealthPremiums"));
      const l4 = add(l1, max0(fact("idSchALtcPremiums")), max0(fact("idSchAOtherMedical")));
      const l5 = rd(pct(max0(fact("idAgi")), "75", "1000"));
      const l6 = max0(sub(l4, l5));
      const l8: Expr = iff(fact("idItemizingForIdaho"), minE(l1, l6), money("0"));
      return max0(sub(max0(fact("idHealthPremiumsPaid")), add(l8, max0(fact("idHealthPremiumsDeductedElsewhere")))));
    })(),
  },
  {
    id: "us.id.long_term_care_deduction",
    version: 1,
    jurisdiction: "us.id",
    title: "Idaho long-term care insurance premiums deduction — premiums paid not otherwise deducted; when itemizing for Idaho, reduced by the federal medical deduction left after health insurance (Form 39R Part B line 19 worksheet lines 11-15)",
    citation: {
      source: "Idaho Code § 63-3022Q; 2025 Form 39R instructions, line 19 and worksheet lines 11-15 pp. 35-36",
      section: "§ 63-3022Q; Form 39R Part B line 19",
      url: CODE("63-3022Q"),
      excerpt:
        "STATUTE (verbatim): 'For taxable years commencing on or after January 1, 2004, premiums paid during the taxable year, by a taxpayer for long-term care insurance as that term is defined in section 41-4603, Idaho Code, which long-term care insurance is to be for the benefit of the taxpayer, a dependent of the taxpayer or an employee of the taxpayer, may be deducted from taxable income to the extent that the premium is not otherwise deducted or accounted for by the taxpayer for Idaho income tax purposes.' WORKSHEET (verbatim): 'Long-term Care Insurance: 11. Enter the total paid for long-term care insurance; 12. Medical expense deduction not allocated to health insurance costs. Subtract line 1 from line 6. If less than zero, enter zero; 13. Portion of long-term care insurance deduction allowed on federal Form 1040 or 1040-SR, Schedule A. Enter the lesser of lines 2 or 12; 14. Enter the total long-term care insurance costs deducted elsewhere on the federal return; 15. Long-term care insurance deduction allowed. Subtract lines 13 and 14 from line 11. Enter the amount on Form 39R, line 19.' Lines 1-6 are shared with us.id.health_insurance_deduction (zeros when not itemizing for Idaho).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { medicalFloorBps: { value: "750", type: "int" } },
    formula: (() => {
      const l1 = max0(fact("idSchAHealthPremiums"));
      const l2 = max0(fact("idSchALtcPremiums"));
      const l4 = add(l1, l2, max0(fact("idSchAOtherMedical")));
      const l5 = rd(pct(max0(fact("idAgi")), "75", "1000"));
      const l6 = max0(sub(l4, l5));
      const l12 = max0(sub(l6, l1));
      const l13: Expr = iff(fact("idItemizingForIdaho"), minE(l2, l12), money("0"));
      return max0(sub(max0(fact("idLtcPremiumsPaid")), add(l13, max0(fact("idLtcDeductedElsewhere")))));
    })(),
  },
  {
    id: "us.id.alternative_energy_device_deduction",
    version: 1,
    jurisdiction: "us.id",
    title: "Idaho alternative energy device deduction — 40% of the cost of a device placed in service in 2025 and 20% for each of the three following years, each year capped at $5,000 (Form 39R Part B lines 5a-5e)",
    citation: {
      source: "Idaho Code § 63-3022C; 2025 Form 39R Part B line 5 (printed percentages) and instructions p. 30",
      section: "§ 63-3022C; Form 39R Part B line 5",
      url: FORM39R_URL,
      excerpt:
        "FORM 39R (verbatim): '5. Alternative energy device deduction — Year Acquired / Type of Device / Total Cost / Percentage: a. 2025 … X 40% = 5a; b. 2024 … X 20% = 5b; c. 2023 … X 20% = 5c; d. 2022 … X 20% = 5d; e. Add lines 5a through 5d. Can't exceed $5,000'. INSTRUCTIONS (verbatim): 'If you install an alternative energy device in your Idaho residence, you can deduct a portion of the amount actually paid or accrued (billed but not paid). In the year the device is placed in service, you can deduct 40% of the cost to construct, reconstruct, remodel, install, or acquire the device, but not more than $5,000. In the three years after installation, you can deduct 20% of these costs per year, but not more than $5,000 in any year. Qualifying devices include: A system using solar radiation, wind, or geothermal resource primarily to provide heating or cooling or produce electrical power …; A fluid-to-air heat pump …; A natural gas or propane heating unit that replaces a noncertified wood stove; An EPA-certified wood stove or pellet stove … that replaces a noncertified wood stove.' 'Line 5e can't be more than $5,000.' ENCODING: min($5,000, Σ min($5,000, round(pct × cost))).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: { firstYearPct: { value: "40", type: "int" }, laterYearPct: { value: "20", type: "int" }, cap: { value: "500000", type: "money" } },
    formula: minE(
      money("500000"),
      add(
        minE(money("500000"), rd(pct(max0(fact("idEnergyDeviceCost2025")), "40", "100"))),
        minE(money("500000"), rd(pct(max0(fact("idEnergyDeviceCost2024")), "20", "100"))),
        minE(money("500000"), rd(pct(max0(fact("idEnergyDeviceCost2023")), "20", "100"))),
        minE(money("500000"), rd(pct(max0(fact("idEnergyDeviceCost2022")), "20", "100"))),
      ),
    ),
  },
  {
    id: "us.id.capital_gains_deduction",
    version: 1,
    jurisdiction: "us.id",
    title: "Idaho capital gains deduction — 60% of the capital gain net income from qualified Idaho property (real property held 12+ months, etc.), limited to the capital gain net income included in taxable income (Form 39R Part B line 10, Form CG)",
    citation: {
      source: "Idaho Code § 63-3022H(1)-(3); 2025 Form 39R instructions, line 10 p. 32; Form 39R Part B line 10",
      section: "§ 63-3022H; Form 39R Part B line 10",
      url: CODE("63-3022H"),
      excerpt:
        "STATUTE (verbatim): '(1) If an individual taxpayer reports capital gain net income in determining Idaho taxable income, eighty percent (80%) in taxable year 2001 and sixty percent (60%) in taxable years thereafter of the capital gain net income from the sale or exchange of qualified property shall be a deduction in determining Idaho taxable income. (2) The deduction provided in this section is limited to the amount of the capital gain net income from all property included in taxable income. Gains treated as ordinary income by the Internal Revenue Code do not qualify for the deduction allowed in this section. The deduction otherwise allowable under this section shall be reduced by the amount of any federal capital gains deduction relating to such property, but not below zero. (3) Property … is \"qualified property\" under this section if the property had an Idaho situs at the time of sale and is: (a) Real property held at least twelve (12) months; (b) Tangible personal property used in Idaho for at least twelve (12) months by a revenue-producing enterprise; (c) Cattle or horses held for breeding, draft, dairy or sporting purposes for at least twenty-four (24) months in Idaho; (d) Breeding livestock other than cattle or horses held at least twelve (12) months in Idaho; (e) Timber grown in Idaho and held at least twenty-four (24) months; (f) A partnership interest …' BOOKLET (line 10): 'You might be able to deduct 60% of the capital gain net income reported on federal Schedule D from the sale of any of the qualified Idaho property described below … Note: Gains from the sale of stocks, goodwill, and other intangibles don't qualify. Complete Idaho Form CG to calculate your capital gains deduction.' ENCODING: min(round(60% × qualified Idaho capital gain net income), net capital gain income from all property included in taxable income).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "60", type: "int" } },
    formula: minE(rd(pct(max0(fact("idQualifiedCapitalGain")), "60", "100")), max0(fact("idNetCapitalGain"))),
  },
  {
    id: "us.id.permanent_building_fund_tax",
    version: 1,
    jurisdiction: "us.id",
    title: "Idaho permanent building fund tax — $10 per return for everyone required to file, except filers receiving Idaho public assistance or legally blind (Form 40 line 31)",
    citation: {
      source: "Idaho Code §§ 63-3082(1), 63-3086; 2025 Form 40 instructions, line 31 p. 10; printed Form 40 line 31",
      section: "§ 63-3082; Form 40 line 31",
      url: CODE("63-3082"),
      excerpt:
        "STATUTE (verbatim): '(1) Every person required to file an income tax return shall pay a tax of ten dollars ($10.00). For this purpose, a husband and wife filing a joint return shall be deemed a single person. This tax shall be in the nature of an excise tax upon the receipt of the income which requires the filing of such return.' § 63-3086 (verbatim): 'This act shall not apply to any person who on the last day of his taxable year is blind or lawfully receiving public assistance payments from the state under title 56, Idaho Code.' FORM (verbatim): '31. Permanent building fund tax. Check the box if you received Idaho public assistance payments for 2025 … 10 00'. BOOKLET (verbatim): 'You must pay the $10 PBF tax if Idaho requires you to file an Idaho income tax return. See Who Must File on page 2. You don't have to pay the $10 PBF tax if any of these were true: Your gross income was less than the amount specified for your filing status. Draw a line through the $10 and enter \"NRF\" (Not Required to File). You were receiving Idaho public assistance payments at the end of the tax year. Check the box on this line and draw a line through the $10. Food stamps and WIC payments don't qualify as Idaho public assistance. You (or your spouse) are legally blind at the end of the tax year. Draw a line through the $10.' 2025 filing thresholds (gross income, p. 4): MFJ $31,500 (one spouse 65+: $33,100; both: $34,700); HOH $23,625 ($25,625); single $15,750 ($17,750); QSS $31,500 ($33,100); MFS $5.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { tax: { value: "1000", type: "money" } },
    formula: iff(or(fact("idReceivedPublicAssistance"), fact("idBlind"), not(fact("idRequiredToFile"))), money("0"), money("1000")),
  },
  {
    id: "us.id.home_for_family_member_credit",
    version: 1,
    jurisdiction: "us.id",
    title: "Idaho credit for maintaining a home for a family member age 65 or older or with a developmental disability — $100 per member (up to $300), $8.33 per month for a partial year; refundable; not with the $1,000 deduction (Form 40 line 44, Form 39R Part E)",
    citation: {
      source: "2025 Form 40 instructions, line 44 p. 12; 2025 Form 39R Part E and instructions p. 39; Form 39R Part B line 15 instructions p. 33-34",
      section: "Form 40 line 44; Form 39R Part E",
      url: BOOKLET_URL,
      excerpt:
        "BOOKLET (line 44, verbatim): 'You can claim a tax credit of $100 per person (up to $300) if both of these are true: You didn't claim a deduction of $1,000 per person on Form 39R, Part B, line 15. You maintained a household for an immediate family member who either: Is age 65 or older (not including yourself or your spouse). Has a developmental disability (including yourself and your spouse).' PART E (verbatim): 'If you didn't claim the $1,000 deduction on Part B, line 15, you can claim a $100 credit for each family member who's age 65 or older (not including yourself or your spouse) for whom you do both of these: Maintain a household for; Provide more than one-half of the family member's support for the year. If you maintained the home for the family member for less than a full year, you can take the credit at the rate of $8.33 for each month you maintained the home.' Form 39R Part E line 4: 'Total amount claimed ($100 for each qualifying member but not more than $300). Enter here and on Form 40, line 44.' DEDUCTION ALTERNATIVE (Part B line 15): 'You can claim no more than three deductions of $1,000. If you claim this deduction, you can't claim the $100 credit in Part E. … If you maintained the home for the family member for less than a full year, you can take a deduction of $83.33 for each month you maintained the home.' ENCODING: min($300, $100 × full-year members + $8.33 × partial months), rounded to whole dollars.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { perMember: { value: "10000", type: "money" }, perMonth: { value: "833", type: "money" }, cap: { value: "30000", type: "money" }, deductionPerMember: { value: "100000", type: "money" }, deductionPerMonth: { value: "8333", type: "money" } },
    formula: minE(money("30000"), rd(add(mulInt(money("10000"), fact("idHomeFamilyMembers")), mulInt(money("833"), fact("idHomeFamilyPartialMonths"))))),
  },
  {
    id: "us.id.use_tax",
    version: 1,
    jurisdiction: "us.id",
    title: "Idaho sales/use tax due on untaxed purchases — 6% of purchases on which no Idaho sales tax was paid (Form 40 line 28)",
    citation: {
      source: "2025 Form 40 instructions, line 28 p. 10; printed Form 40 line 28",
      section: "Form 40 line 28",
      url: BOOKLET_URL,
      excerpt:
        "BOOKLET (verbatim): 'Line 28 Sales/Use Tax Due — You owe use tax if you did either of these during the year: Bought items without paying Idaho sales tax. Bought items from an out-of-state seller (including internet, catalog, radio, and TV purchases) and the seller didn't collect sales tax. Multiply the total amount of purchases by 6% (.06). If you don't have an Idaho seller's permit: Add this use tax to any use tax you calculated on Form 75. Enter the total on this line. If you have an Idaho seller's permit: Don't report the use tax you owe on this line.' FORM: '28. Sales/use tax due on untaxed purchases (online, mail order, and other)'. Idaho has no local-option use tax on this line.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { rateBps: { value: "600", type: "int" } },
    formula: rd(pct(max0(fact("idUseTaxPurchases")), "6", "100")),
  },
  {
    id: "us.id.parameters",
    version: 1,
    jurisdiction: "us.id",
    title: "Idaho 2025 Form 40 parameters — line structure, Form 39R adjustments and their caps, the credit lines, filing thresholds, and the enacted TY2026 position",
    citation: {
      source: "2025 Idaho Individual Income Tax Forms and Instructions (EIN00046, 03-02-2026); printed Form 40 (EFO00089) and Form 39R (EFO00088); Idaho Code §§ 63-3022, 63-3022A-U, 63-3024, 63-3024A, 63-3029-3029L, 63-3030, 63-3082; 2026 session legislation index (legislature.idaho.gov); web-verified September 2026",
      section: "Form 40 lines 1-61; Form 39R Parts A-F",
      url: FORM40_URL,
      excerpt:
        "STRUCTURE (printed 2025 Form 40): 1-5 federal filing status ('Your Idaho filing status must be the same as your federal filing status'); 6a-6d household (yourself unless claimable as a dependent, spouse, dependents — used for the Food Tax Credit; Idaho has had no personal exemptions since 2018); 7 federal AGI (Form 1040 line 11); 8 additions (Form 39R Part A line 7: federal NOL deduction, non-Idaho capital loss carryover, non-Idaho state and local bond interest and dividends, nonqualified IDeal withdrawals, bonus depreciation, other — lump-sum distributions on Form 4972, non-Idaho passive losses, bullion capital loss, Idaho MSA / first-time home buyer nonqualified withdrawals); 9 = 7 + 8; 10 subtractions (Form 39R Part B line 24: 1 Idaho NOL, 2 state income tax refund, 3 U.S. government interest, 4 energy efficiency upgrades (pre-2002 residence), 5 alternative energy device (→ us.id.alternative_energy_device_deduction), 6 child/dependent care (→ us.id.child_care_deduction), 7 Social Security and railroad benefits taxable federally — 100% (§ 63-3022(l)), 8 retirement benefits (→ us.id.retirement_benefits_deduction), 9 technological equipment donation, 10 Idaho capital gains (→ us.id.capital_gains_deduction), 11 active-duty military pay earned outside Idaho (120+ consecutive days), 12 adoption expenses ≤ $10,000 per adoption, 13 Idaho medical savings account contributions ≤ $10,000 ($20,000 joint) plus interest, 14 Idaho college savings (IDeal) ≤ $6,000 ($12,000 joint), 15 home for the aged or developmentally disabled $1,000 each (≤ 3; $83.33 per month), 16 Idaho lottery prizes under $600, 17 American Indian reservation income, 18 health insurance premiums (→ us.id.health_insurance_deduction), 19 long-term care premiums (→ us.id.long_term_care_deduction), 20 workers' compensation premiums (self-employed), 21 bonus depreciation, 22 first-time home buyer savings ≤ $15,000 ($30,000 joint) plus interest, 23 other — bullion gains, Idaho Build America Bond interest); 11 total adjusted income; 12a-12c 65+/blind/dependent boxes; 13-16 deductions (→ us.id.itemized_deductions, us.id.standard_deduction); 17 = 11 − larger of 15 or 16; 18 'Qualified business income deduction' — 'Add lines 13a and 13b from federal Form 1040 or 1040-SR' (the QBI deduction and the new Schedule 1-A deductions); 19 Idaho taxable income; 20 tax (→ us.id.income_tax); 21 other-state credit (→ us.id.other_state_credit); 22 Form 39R Part D (→ educational, youth/rehab, live organ credits); 23 Form 44 business credits; 24 child tax credit (→ us.id.child_tax_credit); 25-26; 27 fuels use tax (Form 75); 28 use tax (→ us.id.use_tax); 29-30 credit and QIE recapture; 31 $10 permanent building fund tax (→ us.id.permanent_building_fund_tax); 32 total tax; 33-40 donations (Nongame Wildlife, Children's Trust, Special Olympics, Guard and Reserve Family Support, American Red Cross of Idaho, Veterans Support, Idaho Food Bank, Opportunity Scholarship); 41; 42 Parental Choice Tax Credit (approved amount; H0934, 2026 ch. 302 adds advance payment from 2026); 43 Food Tax Credit (→ us.id.food_tax_credit) or donate to the Cooperative Welfare Fund; 44 maintaining a home credit (→ us.id.home_for_family_member_credit); 45 fuels tax refund; 46 Idaho withholding; 47 Form 51 payments and prior-year credit; 48 paid by entity / withheld / ABE; 49 Tax Reimbursement Incentive and Claim of Right credits; 50 total payments; 51 tax due = 41 − 50; 52 penalty and interest ('The rate for 2026 is 6%'; 10% penalty on nonqualified MSA withdrawals under 59½); 53 nonrefundable credit from a prior year; 54 total due ('Payments of less than $1 aren't required'); 55 overpaid = 50 − 41 − 52; 56 refund / apply to 2026 ('We don't issue refunds of less than $1'); 57 direct deposit; 58-61 amended-return reconciliation. ROUNDING: nearest whole dollar. FILING (§ 63-3030(a)(1)): every resident required to file a federal return under § 6012(a)(1); gross-income thresholds p. 4. ESTIMATED TAX: 'Idaho doesn't require estimated tax payments.' TY2026 (enacted, verified against the 2026 session index): the 5.3% rate continues (§ 63-3024 last amended 2025; H0589 died); § 63-3029L's $205 child tax credit expires for taxable years beginning in 2026 (S1450 and H0782 died; the Tax Commission confirmed the sunset on July 29, 2026); the Food Tax Credit stays $155 (H0605 died); thresholds, the retirement maximums, and the federal standard deduction amounts re-index (Idaho's 2026 worksheets unpublished); H0733 (ch. 81) adds partnership federal-adjustment reporting; H0761 (ch. 184) amends the § 63-3029A entity list from July 1, 2026. RESIDENCY: part-year residents and nonresidents file Form 43 with Form 39NR (proration) — not composed.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      adoptionExpenseCap: { value: "1000000", type: "money" },
      medicalSavingsCap: { value: "1000000", type: "money" },
      medicalSavingsCapJoint: { value: "2000000", type: "money" },
      collegeSavingsCap: { value: "600000", type: "money" },
      collegeSavingsCapJoint: { value: "1200000", type: "money" },
      firstTimeHomeBuyerCap: { value: "1500000", type: "money" },
      firstTimeHomeBuyerCapJoint: { value: "3000000", type: "money" },
      homeForAgedDeductionPerMember: { value: "100000", type: "money" },
      homeForAgedDeductionMaxMembers: { value: "3", type: "int" },
      interestPctPerYear2026: { value: "6", type: "int" },
      minimumPaymentOrRefund: { value: "100", type: "money" },
      filingThresholdSingle: { value: "1575000", type: "money" },
      filingThresholdJoint: { value: "3150000", type: "money" },
      filingThresholdHoh: { value: "2362500", type: "money" },
      filingThresholdMfs: { value: "500", type: "money" },
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: Idaho Form 40 composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.id.income_tax, us.id.standard_deduction, us.id.itemized_deductions, us.id.child_tax_credit, us.id.food_tax_credit, us.id.other_state_credit, us.id.educational_contribution_credit, us.id.youth_rehab_contribution_credit, us.id.live_organ_donation_credit, us.id.retirement_benefits_deduction, us.id.child_care_deduction, us.id.health_insurance_deduction, us.id.long_term_care_deduction, us.id.alternative_energy_device_deduction, us.id.capital_gains_deduction, us.id.permanent_building_fund_tax, us.id.home_for_family_member_credit, and us.id.use_tax",
    },
  },
];
