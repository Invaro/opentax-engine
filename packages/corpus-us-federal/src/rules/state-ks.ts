import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money } from "./state-helpers.js";

/**
 * Kansas deep pack — TY2025 Form K-40 (and TY2026, whose rates the Department
 * of Revenue certified unchanged in Notice 25-06). Every amount verified from
 * the printed 2025 Kansas Individual Income Tax booklet (36pp: K-40 and
 * Schedule S/A instructions, the 2,000-row tax table, the Tax Computation
 * Worksheet), the printed 2025 Form K-40, K.S.A. 79-32,110 (rates),
 * 79-32,110c (SB 269 trigger), 79-32,117 (modifications), 79-32,119
 * (standard deduction), 79-32,121 (exemptions), 79-32,111c (child care
 * credit), 79-32,205 (EITC), and KDOR Notice 25-06.
 *
 * Load-bearing findings:
 *  - Kansas maps a federal QUALIFYING SURVIVING SPOUSE to HEAD OF HOUSEHOLD
 *    ("If your federal filing status is Qualifying Widow(er) with Dependent
 *    Child, check the Head of Household box") — so QSS gets the single/HOH
 *    rate schedule, the $6,180 deduction and the $9,160 + $2,320 exemption,
 *    not the joint amounts.
 *  - The printed tax table's rows are [$50k+1, $50k+50] and print the
 *    schedule at the row midpoint ($50k + 25.50), half-up — 2,000 of 2,000
 *    rows reproduce. The over-$100,000 worksheet uses a ROUNDED subtraction
 *    constant ($175 / $87 where the exact schedule gives $174.80 / $87.40),
 *    so it is encoded as printed rather than as the exact schedule.
 *  - SB 269's revenue trigger did NOT fire for TY2026 (Notice 25-06, October
 *    2, 2025): FY2025 collections fell $88.5M short of the inflation-adjusted
 *    base, so 5.2%/5.58% continue for 2026.
 */

const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const cmp = (op: "lt" | "le" | "gt" | "ge" | "eq" | "ne", left: Expr, right: Expr): Expr => ({ kind: "cmp", op, left, right });
const lt = (l: Expr, r: Expr): Expr => cmp("lt", l, r);
const le = (l: Expr, r: Expr): Expr => cmp("le", l, r);
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const add = (...args: Expr[]): Expr => ({ kind: "add", args });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const mulInt = (base: Expr, count: Expr): Expr => ({ kind: "mulInt", base, count });
const isStatus = (v: string): Expr => cmp("eq", fact("filingStatus"), { kind: "enum", value: v });
const isMfj: Expr = isStatus("mfj");
// Kansas: "If your federal filing status is Qualifying Widow(er) with Dependent
// Child, check the Head of Household box" (booklet p. 6)
const isKsHoh: Expr = { kind: "or", args: [isStatus("hoh"), isStatus("qss")] };
const times = (base: Expr, num: string): Expr => ({ kind: "mulRate", base, rate: { num, den: "1" }, round: "half-up" });
/** scaled integer (cents × 10^k) → whole-dollar money, ONE half-up rounding */
const dollarsFromScaled = (n: Expr, denCents: string): Expr =>
  times({ kind: "mulDiv", a: n, b: money("1"), c: money(denCents), round: "half-up" }, "100");
/** Σ rate_i × portion in bracket i, scaled ×10,000 (rate numerators per 10,000) */
const scaledSchedule = (base: Expr, rows: { thresholdCents: string; rateNum: string }[]): Expr =>
  add(
    ...rows.map((r, i) => {
      const excess = sub(base, money(r.thresholdCents));
      const portion: Expr =
        i + 1 < rows.length
          ? { kind: "clamp", value: excess, lo: money("0"), hi: money(String(BigInt(rows[i + 1].thresholdCents) - BigInt(r.thresholdCents))) }
          : max0(excess);
      return times(portion, r.rateNum);
    }),
  );

// K.S.A. 79-32,110(a) — TY2024 and thereafter
const SCHED_MFJ = [
  { thresholdCents: "0", rateNum: "520" }, // 5.2% of the first $46,000
  { thresholdCents: "4600000", rateNum: "558" }, // $2,392 + 5.58% over $46,000
];
const SCHED_OTHER = [
  { thresholdCents: "0", rateNum: "520" }, // 5.2% of the first $23,000
  { thresholdCents: "2300000", rateNum: "558" }, // $1,196 + 5.58% over $23,000
];

const BOOKLET_URL = "https://www.ksrevenue.gov/pdf/ip25.pdf";

export const ksRules: Rule[] = [
  {
    id: "us.ks.income_tax",
    version: 1,
    jurisdiction: "us.ks",
    title: "Kansas income tax — 5.2% to $23,000 ($46,000 MFJ), 5.58% above, via the printed tax table to $100,000 and the Tax Computation Worksheet above; QSS uses the single/HOH column (Form K-40 line 8)",
    citation: {
      source: "K.S.A. 79-32,110(a)(1)(B), (a)(2)(B) (as amended by 2024 Special Session SB 1 and 2025 SB 269); 2025 Kansas Individual Income Tax booklet: line 8 instructions p. 7, 2025 Kansas Tax Table pp. 27-33 (the TOC says 25), 2025 Tax Computation Worksheet p. 34; KDOR Notice 25-06 (October 2, 2025)",
      section: "K.S.A. 79-32,110(a); K-40 line 8; 2025 Tax Table; Tax Computation Worksheet",
      url: BOOKLET_URL,
      excerpt:
        "STATUTE (verbatim): married filing jointly — 'Not over $46,000—5.2% of Kansas taxable income; Over $46,000—$2,392 plus 5.58% of excess over $46,000'; all other individuals — 'Not over $23,000—5.2% of Kansas taxable income; Over $23,000—$1,196 plus 5.58% of excess over $23,000'. FILING STATUS (booklet p. 6, verbatim): 'Your Kansas filing status must be the same as your federal filing status. If your federal filing status is Qualifying Widow(er) with Dependent Child, check the Head of Household box' — a federal QSS files as Kansas HEAD OF HOUSEHOLD and uses the single/HOH/MFS column, NOT the joint schedule. METHOD (line 8, verbatim): 'If line 7 is $100,000 or less, use the Tax Tables beginning on page 27 to find the amount of your tax. If line 7 is more than $100,000, you will need to use the Tax Computation Worksheet on page 34.' TABLE (two columns: 'Single, Head of Household or Married Filing Separate' and 'Married Filing Joint'; rows 'at least 26 / but not more than 50', then '51-100', '101-150' … '99,951-100,000'): every row equals the statutory schedule at the ROW MIDPOINT (row [50k+1, 50k+50] → $50k + 25.50; the first row [26, 50] → $38), rounded half-up — verified on all 2,000 printed rows; there is no printed row below $26 (and K.S.A. 79-32,110(e)'s zero-liability band applied only to 'tax years 2018 through 2023'), so for taxable income of $1-$25 this rule applies the statutory 5.2% directly (at most $1). WORKSHEET (p. 34, verbatim constants): joint — '$0 – $46,000 … 5.2% (.052) … $0' and '$46,001 and over … 5.58% (.0558) … $175' subtraction; single/HOH/MFS — '$23,001 and over … 5.58% (.0558) … $87' — the printed subtraction constants are ROUNDED ($174.80 and $87.40 exactly), so the worksheet method (rate × income − constant, one rounding to whole dollars) is encoded as printed for income over $100,000; useFormulaMethod=true evaluates the exact statutory schedule at any income instead. TY2026 (Notice 25-06, verbatim): the SB 269 trigger requires FY collections above the inflation-adjusted base AND a 15% rainy-day fund; 'the amount of total fiscal year adjusted general revenue fund collections from FY 2025 are not in excess of the inflation adjusted base year revenues for FY 2025' ($6,038,279,792 vs $6,126,761,315), so no rate reduction applies for tax year 2026 — 5.2%/5.58% continue; the next determination is August 15, 2026 (for TY2027). The 2026 printed table publishes ~January 2027 (re-verify rows then). Nonresidents/part-year residents prorate on Schedule S Part B (Form K-40 lines 9-10) — not composed.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      lowRateBps: { value: "520", type: "int" },
      highRateBps: { value: "558", type: "int" },
      bracketMfj: { value: "4600000", type: "money" }, // $46,000
      bracketOther: { value: "2300000", type: "money" }, // $23,000
      tableTop: { value: "10000000", type: "money" }, // $100,000
      worksheetSubtractionMfj: { value: "17500", type: "money" }, // $175 as printed
      worksheetSubtractionOther: { value: "8700", type: "money" }, // $87 as printed
      tableFirstRowStart: { value: "2600", type: "money" }, // $26
    },
    formula: (() => {
      const base: Expr = max0(fact("stateTaxableIncome"));
      const sched = (b: Expr): Expr => iff(isMfj, dollarsFromScaled(scaledSchedule(b, SCHED_MFJ), "1000000"), dollarsFromScaled(scaledSchedule(b, SCHED_OTHER), "1000000"));
      // table rows [50k+1, 50k+50] → midpoint 50k + 25.50; row [26, 50] → $38
      const units: Expr = { kind: "stepUnits", value: sub(base, money("100")), unitCents: "5000", mode: "floor" }; // floor((x−1)/50)
      const mid: Expr = add(mulInt(money("5000"), units), money("2550"));
      // no printed row below $26: the statute has no floor (the TY2018-2023 zero band expired), so the exact schedule applies there
      const table: Expr = iff(lt(base, money("2600")), sched(base), iff(le(base, money("5000")), sched(money("3800")), sched(mid)));
      // worksheet: rate × income − printed constant, one rounding
      const worksheet: Expr = iff(
        isMfj,
        dollarsFromScaled(sub(times(base, "558"), times(money("17500"), "10000")), "1000000"),
        dollarsFromScaled(sub(times(base, "558"), times(money("8700"), "10000")), "1000000"),
      );
      return iff(fact("useFormulaMethod"), sched(base), iff(le(base, money("10000000")), table, worksheet));
    })(),
  },
  {
    id: "us.ks.standard_deduction",
    version: 1,
    jurisdiction: "us.ks",
    title: "Kansas standard deduction — $3,605 single, $8,240 MFJ, $6,180 HOH (and federal QSS), $4,120 MFS, plus $850 (single/HOH) or $700 (MFJ/MFS) per 65-or-older/blind box (Form K-40 line 4)",
    citation: {
      source: "K.S.A. 79-32,119 (as amended by 2024 Special Session SB 1); 2025 Kansas Individual Income Tax booklet, line 4 instructions and the 'Worksheet - Standard Deduction for People 65 or Older and/or Blind' p. 6",
      section: "K.S.A. 79-32,119; K-40 line 4",
      url: BOOKLET_URL,
      excerpt:
        "BOOKLET (verbatim): 'The following amounts will be the standard deduction for most people to enter on line 4: Single $3,605; Married Filing Joint $8,240; Head of Household $6,180; Married Filing Separate $4,120.' WORKSHEET (verbatim rows, boxes checked → line 4): Single 1 → $4,455, 2 → $5,305; Married Filing Joint 1 → $8,940, 2 → $9,640, 3 → $10,340, 4 → $11,040; Married Filing Separate 1 → $4,820, 2 → $5,520, 3 → $6,220, 4 → $6,920; Head of Household 1 → $7,030, 2 → $7,880 — i.e. $850 per box for single/HOH and $700 per box for MFJ/MFS (K.S.A. 79-32,119(c)). ELECTION IS INDEPENDENT OF FEDERAL (verbatim): 'If you did not itemize your deductions on your federal return, you may choose to itemize your deductions or claim the standard deduction on your Kansas return whichever is to your advantage. If you itemized on your federal return, you may either itemize or take the standard deduction on your Kansas return' — except MFS spouses 'must use the same method of claiming deductions'. A federal qualifying surviving spouse checks the Kansas Head of Household box (booklet p. 6) → $6,180 and the $850 box amount. No dependent-filer limitation appears in the booklet or statute. Not indexed — TY2026 identical (no 2025/2026 act amended § 79-32,119). [Inputs: filingStatus, ksStdBoxes.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      single: { value: "360500", type: "money" },
      mfj: { value: "824000", type: "money" },
      hohQss: { value: "618000", type: "money" },
      mfs: { value: "412000", type: "money" },
      perBoxSingleHoh: { value: "85000", type: "money" },
      perBoxMfjMfs: { value: "70000", type: "money" },
    },
    formula: (() => {
      const base: Expr = iff(isMfj, money("824000"), iff(isKsHoh, money("618000"), iff(isStatus("mfs"), money("412000"), money("360500"))));
      const perBox: Expr = iff({ kind: "or", args: [isMfj, isStatus("mfs")] }, money("70000"), money("85000"));
      // a single/HOH filer has at most two boxes (65+ and blind); married returns up to four
      const boxes: Expr = iff(
        { kind: "and", args: [{ kind: "not", arg: { kind: "or", args: [isMfj, isStatus("mfs")] } }, cmp("gt", fact("ksStdBoxes"), { kind: "int", value: "2" })] },
        { kind: "int", value: "2" },
        fact("ksStdBoxes"),
      );
      return add(base, mulInt(perBox, boxes));
    })(),
  },
  {
    id: "us.ks.exemptions",
    version: 1,
    jurisdiction: "us.ks",
    title: "Kansas exemption allowance — $18,320 MFJ or $9,160 single/HOH/MFS (plus $2,320 for head of household, incl. federal QSS), plus $2,320 for each dependent, child born this year, stillbirth, and 100% disabled veteran (Form K-40 line 5)",
    citation: {
      source: "K.S.A. 79-32,121 (as amended by 2024 Special Session SB 1, 2025 HB 2062 [ch. 112 § 6: unborn-child exemption] and 2025 HB 2231 [ch. 123 § 9, codified at § 79-32,121b: HOH and disabled-veteran exemptions]); 2025 Kansas Individual Income Tax booklet, 'Exemptions and Dependents' and 'Additional Exemptions' p. 6 and the Form K-40 exemption boxes",
      section: "K.S.A. 79-32,121; Form K-40 exemption boxes → line 5",
      url: BOOKLET_URL,
      excerpt:
        "BOOKLET (verbatim): 'If your filing status is married filing joint, check the box to indicate filing status, enter 2 in the box for the number of exemptions and $18,320 in the amount box. If your filing status is single, married filing separate or head of household, check the box to indicate filing status, enter one in the box for number of exemptions and $9,160 in the amount box. If your filing status is Head of Household, you are allowed an additional exemption of $2,320.' 'Enter the number of dependents claimed on your federal return. Multiply that number by $2,320 … If you are claimed as a dependent by another taxpayer, enter \"0\" in the number of dependents box.' ADDITIONAL (verbatim): 'An additional personal exemption of $2,320 will be allowed for each child born in this tax year'; 'An exemption of $2,320 is allowed for the birth of a child that does not result in a live birth (known as a stillbirth)'; disabled veterans — 'honorably discharged … certified by the United States department of veterans affairs … to be in receipt of disability compensation at the 100% rate, if the disability is permanent … an additional Kansas exemption of $2,320 for tax year 2025 and all tax years thereafter' (2025 HB 2231 raised it from $2,250; the codified § 79-32,121(b) still prints $2,250 while § 79-32,121b(b)(2) and KDOR Notice 25-07 carry the $2,320). QSS NOTE: the booklet routes a federal QSS to the Head of Household box, and the form's HOH box carries the $2,320 additional exemption — this rule follows the form; § 79-32,121b(b)(1) speaks of 'head of household, as defined in 26 U.S.C. § 2(b)', so a preparer may take the stricter view (disclosed). STATUTE: 'a personal exemption of $18,320' (joint), '$9,160' (others), '$2,320 for each dependent'. A federal QSS files as Kansas head of household → $9,160 + $2,320. Not indexed — TY2026 identical. [Inputs: filingStatus, ksDependents, ksChildrenBornThisYear, ksStillbirths, ksDisabledVeterans, isClaimedAsDependent (zeroes the dependent count).]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      mfj: { value: "1832000", type: "money" },
      other: { value: "916000", type: "money" },
      perAdditional: { value: "232000", type: "money" }, // $2,320
    },
    formula: (() => {
      const personal: Expr = iff(isMfj, money("1832000"), money("916000"));
      const hohExtra: Expr = iff(isKsHoh, money("232000"), money("0"));
      // the live-birth exemption "shall be an additional exemption for any qualifying dependent … pursuant to paragraph (3)"
      // (K.S.A. 79-32,121(a)(4)(A)), so it falls with the dependent count when the filer is someone's dependent
      const dependents: Expr = iff(fact("isClaimedAsDependent"), money("0"), mulInt(money("232000"), fact("ksDependents")));
      const bornThisYear: Expr = iff(fact("isClaimedAsDependent"), money("0"), mulInt(money("232000"), fact("ksChildrenBornThisYear")));
      return add(
        personal,
        hohExtra,
        dependents,
        bornThisYear,
        mulInt(money("232000"), fact("ksStillbirths")),
        mulInt(money("232000"), fact("ksDisabledVeterans")),
      );
    })(),
  },
  {
    id: "us.ks.itemized_deductions",
    version: 1,
    jurisdiction: "us.ks",
    title: "Kansas itemized deductions (Schedule A) — 100% of medical expenses over 7.5% of federal AGI, 100% of real and personal property taxes (no SALT cap; no income or sales taxes), 100% of qualified residence interest, and 100% of charitable contributions",
    citation: {
      source: "K.S.A. 79-32,120 (as amended by 2021 SB 50 and 2024 SB 1); 2025 Kansas Individual Income Tax booklet, Kansas Schedule A instructions pp. 14-15 and the printed 2025 Schedule A lines 1-14",
      section: "K.S.A. 79-32,120; Kansas Schedule A lines 1-14 → K-40 line 4",
      url: BOOKLET_URL,
      excerpt:
        "SCHEDULE A (printed lines): 1 medical and dental expenses; 2 federal AGI (1040 line 11); 3 = 7.5% of line 2 ('Federal limitation'); 4 = 1 − 3, floor 0 ('Kansas allows 100% of the expenses for medical care allowable as deductions in section 213'); 5 state and local REAL ESTATE taxes; 6 state and local PERSONAL PROPERTY taxes (value-based, annual); 7 = 5 + 6 ('Kansas allows 100% of the amount of taxes on real and personal property as provided in section 164(a)' — verbatim: 'The $40,000 ($20,000 if married filing separate) federal cap on the itemized deduction for state and local taxes … does not apply for Kansas purposes'; state and local INCOME or SALES taxes are NOT deductible on the Kansas schedule at all); 8a-8c home mortgage interest and points ('Kansas allows 100% of the qualified residence interest paid as provided in section 163(h)'); 9 = interest total; 10-12 gifts by cash, other than cash, carryover ('Kansas allows 100% of the charitable contributions that qualify as deductions in section 170'); 13 = gifts total; 14 = 4 + 7 + 9 + 13 → K-40 line 4. No overall limitation, no casualty/theft, no miscellaneous deductions. Available whether or not the filer itemized federally ('You may itemize your deductions on your Kansas return even if you did not itemize your deductions on your federal return'). [Inputs: ksMedicalExpenses, ksFederalAgi, ksPropertyTaxes, ksMortgageInterest, ksCharitableContributions.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { medicalFloorPct: { value: "75", type: "int" } }, // 7.5%
    formula: (() => {
      const floor = rd({ kind: "mulRate", base: max0(fact("ksFederalAgi")), rate: { num: "75", den: "1000" }, round: "half-up" });
      const medical = max0(sub(rd(fact("ksMedicalExpenses")), floor));
      return add(medical, rd(fact("ksPropertyTaxes")), rd(fact("ksMortgageInterest")), rd(fact("ksCharitableContributions")));
    })(),
  },
  {
    id: "us.ks.eitc",
    version: 1,
    jurisdiction: "us.ks",
    title: "Kansas earned income tax credit — 17% of the federal EIC; nonrefundable up to the line 16 tax, the excess refundable (Form K-40 lines 17 and 22)",
    citation: {
      source: "K.S.A. 79-32,205; 2025 Kansas Individual Income Tax booklet, line 17 instructions and the 'Earned Income Tax Credit (EITC) Worksheet' p. 8, lines 17 and 22 of Form K-40",
      section: "K.S.A. 79-32,205; K-40 lines 17, 22; EITC Worksheet",
      url: BOOKLET_URL,
      excerpt:
        "STATUTE (verbatim): a credit 'against the tax liability of a resident individual … in an amount equal to … 17% for tax year 2013, and all tax years thereafter' of the federal § 32 credit; 'If the amount of the credit allowed by subsection (a) exceeds the taxpayer's income tax liability imposed under the Kansas income tax act, such excess amount shall be refunded to the taxpayer.' WORKSHEET (verbatim): '1. Federal EITC (from your federal tax return); 2. Kansas EITC (multiply line 1 by 17%); 3. Enter amount from line 16 of Form K-40; 4. Total (subtract line 3 from line 2). If line 4 is a positive figure, enter the amount from line 3 on line 17 of Form K-40. Then enter amount from line 4 on line 22 of Form K-40. If line 4 is a negative figure, enter the amount from line 2 on line 17 of Form K-40. Then enter zero (0) on line 22.' 'This credit is for residents only – not part-year residents or nonresidents.' Valid SSNs required for the taxpayer, spouse, and dependents. This rule returns the FULL 17% credit; the composer splits it into the line 17 nonrefundable portion (≤ line 16) and the line 22 refundable remainder. Whole dollars. [Input: ksFederalEic.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "17", type: "int" } },
    formula: rd({ kind: "mulRate", base: max0(fact("ksFederalEic")), rate: { num: "17", den: "100" }, round: "half-up" }),
  },
  {
    id: "us.ks.child_care_credit",
    version: 1,
    jurisdiction: "us.ks",
    title: "Kansas credit for child and dependent care expenses — 50% of the federal Form 2441 credit allowed, residents only, nonrefundable (Form K-40 line 14)",
    citation: {
      source: "K.S.A. 79-32,111c (as amended by 2024 Special Session SB 1: 50% for tax year 2024 and thereafter); 2025 Kansas Individual Income Tax booklet, line 14 instructions p. 8",
      section: "K.S.A. 79-32,111c; K-40 line 14",
      url: BOOKLET_URL,
      excerpt:
        "BOOKLET (verbatim): 'This credit is available to residents only - nonresidents and part-year residents are not eligible. Multiply amount of credit allowed on (federal Form 2441) by 50% and enter the result on line 14.' STATUTE: '25% for tax years 2020 through 2023' and '50% for tax year 2024, and all tax years thereafter' of the federal § 21 credit; the credit 'shall not exceed the amount of the tax imposed' (nonrefundable — the composer caps it at the remaining line 12 tax); 'No credit … shall be allowed to any individual who fails to provide a valid social security number' for the taxpayer, spouse, and dependents. Not indexed — TY2026 identical. [Input: ksFederalChildCareCredit (the federal credit ALLOWED, Schedule 3 line 2).]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: { pct: { value: "50", type: "int" } },
    formula: rd({ kind: "mulRate", base: max0(fact("ksFederalChildCareCredit")), rate: { num: "50", den: "100" }, round: "half-up" }),
  },
  {
    id: "us.ks.parameters",
    version: 1,
    jurisdiction: "us.ks",
    title: "Kansas 2025 Form K-40 parameters — line structure, Schedule S modifications and caps, the other-state credit worksheet, lump-sum tax, penalties, and the SB 269 trigger status",
    citation: {
      source: "2025 Kansas Individual Income Tax booklet (K-40, Schedule S, Schedule A, K-210 instructions and forms); K.S.A. 79-32,117; KDOR Notice 25-06; KDOR 2025 Legislative Changes presentation (rev. 11/25/25); web-verified September 2026",
      section: "Form K-40 lines 1-43; Schedule S Part A lines A1-A27",
      url: BOOKLET_URL,
      excerpt:
        "STRUCTURE: 1 federal AGI; 2 net modifications (Schedule S line A27, may be negative); 3 KANSAS AGI = 1 ± 2; 4 standard (→ us.ks.standard_deduction) OR Kansas itemized (→ us.ks.itemized_deductions) — free choice regardless of the federal election (MFS spouses must match); 5 exemption allowance (→ us.ks.exemptions); 6 = 4 + 5; 7 TAXABLE INCOME = max0(3 − 6); 8 tax (→ us.ks.income_tax); 9-10 nonresident percentage/tax (Schedule S Part B line B23 — not composed); 11 Kansas tax on lump-sum distributions = 13% of the federal Form 4972 tax (residents; KPERS lump sums prorated); 12 TOTAL INCOME TAX = 8 + 11; 13 credit for taxes paid to other states — 'Worksheet for Residents' (verbatim): '1. 2025 income tax that was actually paid to the other state (including political subdivisions thereof); 2. Total Kansas income tax (line 12, Form K-40); 3. Total income derived from other state and included in KAGI; 4. KAGI (line 3, Form K-40); 5. Percentage limitation (divide line 3 by line 4); 6. Maximum credit allowable (multiply line 2 by line 5); 7. Credit for taxes paid to the other state. Enter the lesser of line 1 or line 6' (one worksheet per state; the other state's return must be enclosed; states with no income tax → no entry); 14 child and dependent care credit (→ us.ks.child_care_credit); 15 other credits (Schedule K-24 … K-89, transcribed); 16 = 12 − 13 − 14 − 15; 17 nonrefundable EITC portion (→ us.ks.eitc, ≤ line 16); 18 TOTAL TAX BALANCE = max0(16 − 17). PAYMENTS: 19 withholding; 20 estimated payments INCLUDING the 2024 overpayment credited forward; 21 extension payment; 22 refundable EITC remainder; 23 refundable portion of other credits; 24 amended-return payments; 25 credit for tax paid on the K-120S (5.58% entity-level tax, Form K-9); 26 overpayment from the original return (amended, subtracted); 27 = 19 … 25 − 26. SETTLE: 28 underpayment = 18 − 27; 29 interest 0.6667% per month (8% per annum) from the due date; 30 penalty 1% per month or fraction, max 24% (no penalty when 90% was paid by the due date under an extension); 31 K-210 estimated tax penalty (applies when line 18 less withholding and refundable credits is $500 or more; exceptions: payments ≥ 100% of last year's line 19 tax or ≥ 90% of this year's line 18; farmers/fishers two-thirds test); 32 AMOUNT YOU OWE = 28 + 29 + 30 + 31 + checkoffs; 33 overpayment = 27 − 18 (under $5 not refunded — carried forward or donated); 34 credit forward to 2026 estimates ($1 or more); 35-42 checkoffs (Chickadee, Meals on Wheels, breast cancer research, military emergency relief, hometown heroes, creative arts, school district, historic site); 43 REFUND = 33 − 34 … 42. SCHEDULE S PART A ADDITIONS: A1 non-Kansas state/municipal bond interest (Kansas obligations issued after 12/31/87 exempt); A2 KPERS employee contributions (W-2 box 14); A3 expensing recapture; A4 K-70 scholarship contributions deducted federally; A5 § 163(j) carryforward interest; A6/A7 unqualified first-time-home-buyer / adoption savings withdrawals; A8 other (federal refund for a prior-year NOL carryback, pass-through adjustments, K-60 contributions, 529 nonqualified withdrawals, abortion-expense credits). SUBTRACTIONS: A10 SOCIAL SECURITY — 100% of federally taxable benefits (K.S.A. 79-32,117(c)(xix) as amended: 'For all taxable years beginning after December 31, 2023, amounts received as benefits under the federal social security act that are included in federal adjusted gross income' — the former $75,000 AGI cliff is gone); A11 KPERS lump sums rolled over; A12 US obligation interest (not FNMA/GNMA/FHLMC); A13 state/local tax refunds; A14 retirement benefits exempt from Kansas tax — federal civil service and military retirement (incl. TSP), Railroad Retirement, KPERS, Kansas Police & Fire, Kansas teachers' annuities, Highway Patrol, judges, Board of Public Utilities, Board of Regents annuity contracts, Washburn, certain first-class-city pensions, Overland Park police/fire; A15 nonresident military pay/spouse income; A16 Kansas or other-state 529 contributions up to $3,000 per beneficiary ($6,000 MFJ); A17 armed forces recruitment/retention bonuses and service-related student-loan repayments; A18 GILTI; A19 disallowed § 163(j) interest; A20 disallowed § 274 meals; A21 ABLE contributions $3,000/$6,000 per beneficiary; A22 Kansas expensing (K-120EX); A23 first-time home buyer savings $3,000/$6,000; A24 adoption savings $6,000/$12,000; A25 other (KPERS lump-sum contributions, Kansas turnpike bond gains, Native American reservation income, organ donor expenses ≤ $5,000, identity-fraud compensation). Whole dollars. Due April 15, 2026. FILING THRESHOLDS: KAGI over the standard deduction + exemption allowance (e.g. single under 65 $12,765; MFJ $26,560). TY2026: no rate change (Notice 25-06); 2025 HB 2231 disabled-veteran exemption $2,320 (already in the 2025 form); the 'unborn child' exemption ($2,320 for live births and stillbirths) continues; no 2026 act changed the rates, deduction, or exemptions (HB 2629's higher standard deduction died in committee); NEW for TY2026-2028 (2026 SB 82 § 1, Notice 26-06): a nonrefundable Lockable Gun and Ammunition Storage credit — 25% of the expenditure, at most $250, carryforward allowed — claimed on line 15 (transcribed); SB 368 health-care-sharing-ministry subtraction and HB 2602 portable-benefit subtraction start TY2027. MFS spouses must both use the tax table or both the worksheet (K.S.A. 79-32,115(g)). NOT ON THIS RETURN: Form K-40H/K-40PT/K-40SVR homestead and property tax refunds (separate claims; K-40SVR uses KAGI), Schedule S Part B nonresident allocation, Schedule K credits' mechanics, Form K-210 arithmetic. Federal conformity: rolling (Kansas AGI starts from federal AGI 'as amended'); OBBBA's below-the-line deductions do not reach Kansas AGI and Kansas grants no equivalent subtraction on Schedule S.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      lumpSumTaxPct: { value: "13", type: "int" },
      plan529CapPerBeneficiary: { value: "300000", type: "money" },
      plan529CapPerBeneficiaryMfj: { value: "600000", type: "money" },
      ableCapPerBeneficiary: { value: "300000", type: "money" },
      ableCapPerBeneficiaryMfj: { value: "600000", type: "money" },
      adoptionSavingsCap: { value: "600000", type: "money" },
      adoptionSavingsCapMfj: { value: "1200000", type: "money" },
      organDonorExpenseCap: { value: "500000", type: "money" },
      interestPctPerMonthTimes10000: { value: "6667", type: "int" }, // 0.6667%
      penaltyPctPerMonth: { value: "1", type: "int" },
      penaltyMaxPct: { value: "24", type: "int" },
      estimatedTaxPenaltyFloor: { value: "50000", type: "money" }, // $500
      filingThresholdSingle: { value: "1276500", type: "money" },
      filingThresholdMfj: { value: "2656000", type: "money" },
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: Kansas Form K-40 composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.ks.income_tax, us.ks.standard_deduction, us.ks.exemptions, us.ks.itemized_deductions, us.ks.eitc, and us.ks.child_care_credit",
    },
  },
];
