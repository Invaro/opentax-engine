/**
 * Passive activity credits — Form 8582-CR (Rev. December 2024; instructions
 * Rev. December 2025), by activity. Verified November 2026.
 *
 * Sources (verbatim excerpts in each rule): 26 U.S.C. § 469(a)(1)(B), (d)(2),
 * (i)(1)–(3), (5), (j)(5); Form 8582-CR and its instructions, Parts I–V and
 * Worksheets 1–9.
 *
 * Each passive activity (rules/passive-activities.ts) may carry one general
 * business credit and its prior-year unallowed credit, of one type:
 *   Worksheet 1  general credits from rental real estate with active participation
 *   Worksheet 2  rehabilitation credits from rental real estate, and pre-1990
 *                low-income housing credits
 *   Worksheet 3  low-income housing credits for property placed in service after 1989
 *   Worksheet 4  every other passive credit (and all of them for a married person
 *                filing separately who lived with the spouse)
 * Credits are allowed against the tax on net passive income (line 6), then under
 * the special allowance's tax equivalent (Parts II–IV); the allowed amounts go to
 * Form 3800 lines 3 and 33 (rules/general-business-credit.ts). Unallowed credits
 * carry forward per activity and, unlike losses, are not freed by a disposition.
 *
 * "Tax on" an amount is the regular tax by the return's own method (Tax Table,
 * Tax Computation Worksheet, Qualified Dividends and Capital Gain Tax Worksheet)
 * with its preferential income capped at that amount; a return whose regular tax
 * comes from another method (e.g. § 911(f) stacking) is refused. Not modeled:
 * credits from PTPs, the Part VI basis election, CRD.
 */

import type { Expr, Rule } from "@invaro/opentax-core";
import { regularTaxOnExpr, type TaxYear } from "./income-tax.js";
import { active, amt, cumulative, dispGain, disposedTaxable, kindIs, mfsTogether, onSlot, PASSIVE_SLOTS } from "./passive-activities.js";

const J = "us.federal";
const PC = `${J}.passive_credit`;
const SLOTS = Array.from({ length: PASSIVE_SLOTS }, (_, k) => k + 1);

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const int = (value: string): Expr => ({ kind: "int", value });
const enumV = (value: string): Expr => ({ kind: "enum", value });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const zero = money("0");
const add = (...args: Expr[]): Expr => (args.length === 0 ? zero : { kind: "add", args });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const min = (...args: Expr[]): Expr => ({ kind: "min", args });
const neg = (e: Expr): Expr => sub(zero, e);
const cmp = (op: "lt" | "le" | "gt" | "ge" | "eq" | "ne", left: Expr, right: Expr): Expr => ({ kind: "cmp", op, left, right });
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const and = (...args: Expr[]): Expr => ({ kind: "and", args });
const or = (...args: Expr[]): Expr => ({ kind: "or", args });
const not = (arg: Expr): Expr => ({ kind: "not", arg });
const gt0 = (e: Expr): Expr => cmp("gt", e, zero);
const lt0 = (e: Expr): Expr => cmp("lt", e, zero);
const half = (e: Expr): Expr => ({ kind: "mulRate", base: e, rate: { num: "50", den: "100" }, round: "half-up" });
const unsupported = (reason: string): Expr => ({ kind: "unsupported", reason });
const sf = (i: number, name: string): Expr => fact(`passiveActivity${i}${name}`);

const URL = "https://www.irs.gov/forms-pubs/about-form-8582-cr";
const URL_469 = "https://www.law.cornell.edu/uscode/text/26/469";
const r = (i: number, name: string): string => `${PC}.activity${i}.${name}`;
const line = (n: string): string => `${PC}.form8582cr.line${n}`;
const L = (n: string): Expr => ruleRef(line(n));

const current = (i: number): Expr => amt(i, "Credit");
const prior = (i: number): Expr => amt(i, "PriorUnallowedCredit");
const credits = (i: number): Expr => add(current(i), prior(i));
const hasCredit = (i: number): Expr => onSlot(i, gt0(credits(i)));
const typeIs = (i: number, ...types: string[]): Expr => or(...types.map((t) => cmp("eq", sf(i, "CreditType"), enumV(t))));
const ws = (i: number): Expr => ruleRef(r(i, "worksheet"));
const onWs = (i: number, k: number): Expr => cmp("eq", ws(i), int(String(k)));
const wsUsed = (i: number): Expr => cmp("gt", ws(i), int("0"));

const mfsApart: Expr = and(cmp("eq", fact("filingStatus"), enumV("mfs")), fact("mfsLivedApartAllYear"));
const allowanceCap: Expr = iff(mfsApart, money("1250000"), money("2500000")); // $25,000 / $12,500

const sumWs = (k: number, value: (i: number) => Expr): Expr => add(...SLOTS.map((i) => iff(onWs(i, k), value(i), zero)));

function rule(
  id: string,
  title: string,
  section: string,
  excerpt: string,
  type: "money" | "int" | "bool",
  formula: Expr,
  extra: Partial<Rule> = {},
): Rule {
  return {
    id,
    version: 1,
    jurisdiction: J,
    title,
    citation: { source: "26 U.S.C. § 469; Form 8582-CR (Rev. December 2024) and instructions (Rev. December 2025)", section, url: URL, excerpt },
    effectiveFrom: "2025-01-01",
    output: { type },
    formula,
    ...extra,
  };
}

// --- per activity: worksheet -----------------------------------------------------

const WS_EXCERPT =
  'I8582-CR: "Worksheet 1 is for credits (other than rehabilitation credits and low-income housing credits) from passive rental real estate activities in which you actively participated." "Worksheet 2 is for rehabilitation credits from passive rental real estate activities and low-income housing credits for property placed in service before 1990. This worksheet is also used for low-income housing credits from a partnership, S corporation, or other pass-through entity if your interest in the pass-through entity was acquired before 1990". "Worksheet 3 is for low-income housing credits for property placed in service after 1989". "Worksheet 4 is for credits from passive trade or business activities in which you didn’t materially participate and passive rental real estate activities in which you didn’t actively participate (but not rehabilitation credits from passive rental real estate activities or low-income housing credits)." "If you are married filing a separate return and lived with your spouse at any time during the year, even if you actively participated in the rental real estate activity, include the credits in Worksheet 4". "Caution: Don’t enter credits from PTPs on the worksheets or on Form 8582-CR." [0 = no credit. A PTP’s credits (the Steps 1–10 computation) are refused. A prior-year credit of a rental_active activity from a year without active participation belongs on a separate activity of kind rental, as for losses.]';

const worksheetRule = (i: number): Rule =>
  rule(
    r(i, "worksheet"),
    `Passive activity ${i}: Form 8582-CR worksheet its credit is entered on (1–4; 0 = no credit)`,
    "Lines 1a–4b; Worksheets 1–4",
    WS_EXCERPT,
    "int",
    iff(
      hasCredit(i),
      iff(
        kindIs(i, "ptp"),
        unsupported(`passive activity ${i} is a PTP with a credit: the Form 8582-CR PTP computation (Steps 1–10) is not modeled`),
        iff(
          mfsTogether,
          int("4"),
          iff(
            typeIs(i, "lihc_post1989"),
            int("3"),
            iff(
              or(typeIs(i, "lihc_pre1990"), and(typeIs(i, "rehabilitation"), kindIs(i, "rental_active", "rental"))),
              int("2"),
              iff(and(typeIs(i, "general"), kindIs(i, "rental_active")), int("1"), int("4")),
            ),
          ),
        ),
      ),
      int("0"),
    ),
  );

// --- Part I ---------------------------------------------------------------------

const PART_I =
  'Form 8582-CR Part I: lines 1a/1b credits and prior year unallowed credits from Worksheet 1, columns (a) and (b); 2a/2b from Worksheet 2; 3a/3b from Worksheet 3; 4a/4b from Worksheet 4; "5 Add lines 1c, 2c, 3c, and 4c"; "6 Enter the tax attributable to net passive income"; "7 Subtract line 6 from line 5. If line 6 is more than or equal to line 5, enter -0-". I8582-CR line 7: "If line 7 is zero because the tax on the net passive income on line 6 is greater than your credits from passive activities on line 5, all your credits from passive activities are allowed."';

const partIRules: Rule[] = [1, 2, 3, 4].flatMap((k) => [
  rule(line(`${k}a`), `Form 8582-CR line ${k}a — Worksheet ${k} current-year credits`, `Part I line ${k}a`, PART_I, "money", sumWs(k, current)),
  rule(line(`${k}b`), `Form 8582-CR line ${k}b — Worksheet ${k} prior year unallowed credits`, `Part I line ${k}b`, PART_I, "money", sumWs(k, prior)),
  rule(line(`${k}c`), `Form 8582-CR line ${k}c — Worksheet ${k} total`, `Part I line ${k}c`, PART_I, "money", add(L(`${k}a`), L(`${k}b`))),
]);
partIRules.push(rule(line("5"), "Form 8582-CR line 5 — passive activity credits, all worksheets", "Part I line 5", PART_I, "money", add(L("1c"), L("2c"), L("3c"), L("4c"))));

// --- tax computations (year-specific) ------------------------------------------------

const P = `${J}.passive`;
const TI = ruleRef(`${J}.taxable_income`);

/** net passive income for line 6: Form 8582 line 3, less overall losses on entire dispositions */
const dispositionLosses = add(
  ...SLOTS.map((i) =>
    iff(
      and(disposedTaxable(i), lt0(ruleRef(`${P}.activity${i}.overall`)), ruleRef(`${P}.activity${i}.off_form`)),
      neg(ruleRef(`${P}.activity${i}.overall`)),
      zero,
    ),
  ),
);
const onFormDispGain = add(
  ...SLOTS.map((i) => iff(or(ruleRef(`${P}.activity${i}.part_iv`), ruleRef(`${P}.activity${i}.part_v`)), dispGain(i), zero)),
);

const LINE6_EXCERPT =
  'I8582-CR line 6: "If Form 8582, line 3, shows net income or you didn’t complete Form 8582 because you had net passive income, you must figure the tax on the net passive income. If you have an overall loss on an entire disposition of your interest in a passive activity, reduce net passive income, if any, on Form 8582, line 3, to the extent of the loss (but not below zero) ... If you had a net passive activity loss, enter -0- on line 6". "A. Taxable income including net passive income ... B. Tax on line A* ... C. Taxable income without net passive income ... D. Tax on line C* ... E. Subtract line D from line B". "* For Form 1040 or 1040-SR, use the Tax Table, Tax Computation Worksheet, or other appropriate method you used to figure your tax." "When using taxable income in the above computation, it isn’t necessary to refigure items that are based on a percentage of adjusted gross income." [Line C is taxable income less net passive income, with the preferential income capped at it. Net passive income that includes a gain on disposing of activity property is refused: whether that gain is ordinary or preferential decides line D, and Form 8582 does not say.]';

function taxRules(year: TaxYear, version: number, from: string, to: string): Rule[] {
  const taxOn = (x: Expr): Expr => regularTaxOnExpr(max0(x), year);
  const attributable = (minus: Expr): Expr => sub(taxOn(TI), taxOn(sub(TI, minus)));
  const guard = (value: Expr): Expr =>
    iff(
      cmp("ne", taxOn(TI), ruleRef(`${J}.income_tax_before_credits`)),
      unsupported(
        "the return's regular tax is not the Tax Table / Qualified Dividends and Capital Gain Tax Worksheet amount on its taxable income (e.g. § 911(f) stacking): Form 8582-CR's tax on taxable income without an amount is not modeled for it",
      ),
      value,
    );
  const yr = { version, effectiveFrom: from, effectiveTo: to };
  const npi = max0(sub(ruleRef(`${P}.form8582.line3`), dispositionLosses));
  return [
    rule(
      line("6"),
      `Form 8582-CR line 6 — tax attributable to net passive income (TY${year})`,
      "Part I line 6",
      LINE6_EXCERPT,
      "money",
      iff(
        gt0(npi),
        iff(
          gt0(onFormDispGain),
          unsupported("net passive income includes a gain on disposing of activity property: its ordinary/preferential split for Form 8582-CR line 6 is not modeled"),
          guard(attributable(npi)),
        ),
        zero,
      ),
      yr,
    ),
    rule(
      line("15"),
      `Form 8582-CR line 15 — tax attributable to the special allowance left after Form 8582 (TY${year})`,
      "Part II line 15",
      'I8582-CR line 15: "A. Taxable income ... B. Tax on line A* ... C. Enter amount from Form 8582-CR, line 14 ... D. Subtract line C from line A ... E. Tax on line D* ... F. Subtract line E from line B and enter the result on Form 8582-CR, line 15".',
      "money",
      guard(attributable(L("14"))),
      yr,
    ),
    rule(
      line("27"),
      `Form 8582-CR line 27 — tax attributable to the rehabilitation / pre-1990 low-income housing allowance (TY${year})`,
      "Part III line 27",
      'I8582-CR line 27: "A. Taxable income ... B. Tax on line A* ... C. Enter amount from Form 8582-CR, line 26 ... D. Subtract line C from line A ... E. Tax on line D* ... F. Subtract line E from line B and enter the result on Form 8582-CR, line 27".',
      "money",
      guard(attributable(L("26"))),
      yr,
    ),
    rule(
      line("35"),
      `Form 8582-CR line 35 — tax attributable to the remaining special allowance for post-1989 low-income housing credits (TY${year})`,
      "Part IV line 35",
      'I8582-CR line 35: "A. Taxable income ... B. Tax on line A* ... C. Enter $25,000 ($12,500 if married filing a separate return and you and your spouse lived apart at all times during the year) ... D. Enter amount, if any, from Form 8582, line 9 ... E. Subtract line D from line C ... F. Subtract line E from line A ... G. Tax on line F* ... H. Subtract line G from line B ... I. Add lines 16 and 30 of Form 8582-CR and enter the total ... J. Tax attributable to the remaining special allowance. Subtract line I from line H." [J floored at zero.]',
      "money",
      guard(max0(sub(attributable(max0(sub(allowanceCap, ruleRef(`${P}.form8582.line9`)))), add(L("16"), L("30"))))),
      yr,
    ),
  ];
}

// --- Parts II–V ----------------------------------------------------------------------

const MAGI_EXCERPT =
  'I8582-CR line 10: "To figure modified adjusted gross income, combine all the amounts used to figure adjusted gross income, except don’t take into account: Any passive activity loss as defined in section 469(d)(1), Any rental real estate loss allowed to real estate professionals ..., The taxable amount of social security and tier 1 railroad retirement benefits, Deductible contributions to traditional individual retirement accounts (IRAs) ..., The deduction allowed for self-employment taxes, ... The student loan interest deduction". "When figuring modified adjusted gross income, any overall loss from an entire disposition of an interest in a passive activity is taken into account as a nonpassive loss if you don’t have any net passive income ... If you do have net passive income ..., the overall loss from the disposition is taken into account as a nonpassive loss only to the extent that it exceeds that net passive income." [With Form 8582 line 3 zero or more there is no passive activity loss to disregard: AGI as computed, less taxable Social Security, plus the IRA, student loan and ½-SE deductions and real estate professional losses (the disposition loss and the net passive income both stay, which nets to the instructions’ result). With line 3 a loss: the Form 8582 line 6 amount.]';

const magiFull = max0(
  add(
    sub(ruleRef(`${J}.agi`), ruleRef(`${J}.taxable_social_security`)),
    ruleRef(`${J}.ira_deduction`),
    ruleRef(`${J}.student_loan_interest_deduction`),
    ruleRef(`${J}.se_tax_half_deduction`),
    fact("nonpassiveScheduleELoss"),
  ),
);

const partRules: Rule[] = [
  rule(line("7"), "Form 8582-CR line 7 — passive activity credit over the tax on net passive income", "Part I line 7", PART_I, "money", max0(sub(L("5"), L("6")))),
  rule(
    line("10"),
    "Form 8582-CR line 10 (and 22) — modified adjusted gross income",
    "Part II line 10",
    MAGI_EXCERPT,
    "money",
    iff(cmp("ge", ruleRef(`${P}.form8582.line3`), zero), magiFull, ruleRef(`${P}.form8582.magi`)),
  ),
  rule(
    line("14"),
    "Form 8582-CR line 14 — special allowance left after Form 8582's (lines 9–14)",
    "Part II lines 9–14",
    'Form 8582-CR: "9 Enter $150,000. If married filing separately, see instructions"; "10 Enter modified adjusted gross income, but not less than zero"; "11 Subtract line 10 from line 9"; "12 Multiply line 11 by 50% (0.50). Do not enter more than $25,000. If married filing separately, see instructions"; "13 Enter the amount, if any, from line 9 of Form 8582"; "14 Subtract line 13 from line 12". I8582-CR: "Married persons filing separate returns who lived apart from their spouses at all times during the year must enter $75,000 on line 9 instead of $150,000." "Don’t enter more than $12,500 on line 12 if you are married filing a separate return and you and your spouse lived apart at all times during the year."',
    "money",
    max0(sub(min(allowanceCap, half(max0(sub(iff(mfsApart, money("7500000"), money("15000000")), L("10"))))), ruleRef(`${P}.form8582.line9`))),
  ),
  rule(
    line("16"),
    "Form 8582-CR line 16 — credits allowed under the special allowance (rental real estate with active participation)",
    "Part II lines 8, 15, 16",
    'Form 8582-CR Part II: "Complete this part only if you have an amount on line 1c." "8 Enter the smaller of line 1c or line 7"; "15 Enter the tax attributable to the amount on line 14"; "16 Enter the smaller of line 8 or line 15". "If your filing status is married filing separately and you lived with your spouse at any time during the year, do not complete Part II, III, or IV."',
    "money",
    iff(and(gt0(L("1c")), gt0(L("7")), not(mfsTogether)), min(min(L("1c"), L("7")), L("15")), zero),
  ),
  rule(
    line("26"),
    "Form 8582-CR line 26 — special allowance for rehabilitation and pre-1990 low-income housing credits, left after Form 8582's (lines 21–26)",
    "Part III lines 21–26",
    'Form 8582-CR: "21 Enter $250,000. If married filing separately, see instructions"; "22 Enter modified adjusted gross income, but not less than zero. (See instructions for line 10.)"; "23 Subtract line 22 from line 21"; "24 Multiply line 23 by 50% (0.50). Do not enter more than $25,000. If married filing separately, see instructions"; "25 Enter the amount, if any, from line 9 of Form 8582"; "26 Subtract line 25 from line 24". I8582-CR: "Married persons filing separate returns who lived apart from their spouses at all times during the year must enter $125,000 on line 21, instead of $250,000." "Don’t enter more than $12,500 on line 24". [The instructions’ shortcut (line 27 = line 15 when modified AGI is $100,000 or less) gives the same amount.]',
    "money",
    max0(sub(min(allowanceCap, half(max0(sub(iff(mfsApart, money("12500000"), money("25000000")), L("10"))))), ruleRef(`${P}.form8582.line9`))),
  ),
  rule(
    line("30"),
    "Form 8582-CR line 30 — rehabilitation and pre-1990 low-income housing credits allowed under the special allowance",
    "Part III lines 17–30",
    'Form 8582-CR Part III: "Complete this part only if you have an amount on line 2c." "17 Enter the amount from line 7"; "18 Enter the amount from line 16"; "19 Subtract line 18 from line 17. If zero, enter -0- here and on lines 30 and 36"; "20 Enter the smaller of line 2c or line 19"; "27 Enter the tax attributable to the amount on line 26"; "28 Enter the amount, if any, from line 18"; "29 Subtract line 28 from line 27"; "30 Enter the smaller of line 20 or line 29".',
    "money",
    iff(
      and(gt0(L("2c")), not(mfsTogether)),
      min(min(L("2c"), max0(sub(L("7"), L("16")))), max0(sub(L("27"), L("16")))),
      zero,
    ),
  ),
  rule(
    line("36"),
    "Form 8582-CR line 36 — post-1989 low-income housing credits allowed under the special allowance",
    "Part IV lines 31–36",
    'Form 8582-CR Part IV: "Complete this part only if you have an amount on line 3c." "31 If you completed Part III, enter the amount from line 19. Otherwise, subtract line 16 from line 7"; "32 Enter the amount from line 30"; "33 Subtract line 32 from line 31"; "34 Enter the smaller of line 3c or line 33"; "35 Tax attributable to the remaining special allowance"; "36 Enter the smaller of line 34 or line 35". I8582-CR: "No modified adjusted gross income limitation applies when figuring the special allowance for low-income housing credits for property placed in service after 1989".',
    "money",
    iff(
      and(gt0(L("3c")), not(mfsTogether)),
      min(min(L("3c"), max0(sub(max0(sub(L("7"), L("16"))), L("30")))), L("35")),
      zero,
    ),
  ),
  rule(
    line("37"),
    "Form 8582-CR line 37 — passive activity credit allowed",
    "Part V line 37",
    'Form 8582-CR: "37 Passive Activity Credit Allowed. Add lines 6, 16, 30, and 36." I8582-CR line 7: "all your credits from passive activities are allowed. In this case, enter the amount from line 5 on line 37". § 469(a)(1)(B), (d)(2): the passive activity credit — the credits from passive activities over "the regular tax liability of the taxpayer for the taxable year allocable to all passive activities" — is disallowed.',
    "money",
    iff(cmp("eq", L("5"), zero), zero, iff(cmp("eq", L("7"), zero), L("5"), add(L("6"), L("16"), L("30"), L("36")))),
  ),
];

// --- Worksheets 5–9: allowed and unallowed by activity ------------------------------------

const ALLOC_EXCERPT =
  'I8582-CR Worksheets 5–7: "Column (a). Enter the credits from Worksheet 1 [2, 3], column (c)". "Column (c). Multiply Form 8582-CR, line 16 [30, 36] by the ratios in column (b)". "Column (d). Subtract column (c) from column (a)". Worksheet 8: "Column (a). Enter the amounts, if any, from column (c) of Worksheet 4 and column (d) of Worksheets 5, 6, and 7." "A. Enter Form 8582-CR, line 5 ... B. Enter Form 8582-CR, line 37 ... C. Subtract line B from line A. Multiply line C by the ratios in column (b)". Worksheet 9: "Column (b). Enter the amounts from column (c) of Worksheet 8 ... These are your unallowed credits for the current year. Column (c). Subtract column (b) from column (a). These are the allowed credits for the current year." [Exact ratios, each share rounded to the cent cumulatively so every column totals exactly.]';

const allowanceShare = (i: number): Expr => {
  const share = (k: number, total: Expr): Expr => cumulative(i, (j) => iff(onWs(j, k), credits(j), zero), total);
  return iff(onWs(i, 1), share(1, L("16")), iff(onWs(i, 2), share(2, L("30")), iff(onWs(i, 3), share(3, L("36")), zero)));
};
/** Worksheet 8 column (a): a Worksheet 4 credit, or a Worksheet 5–7 column (d) */
const ws8ColA = (j: number): Expr =>
  iff(onWs(j, 4), credits(j), iff(wsUsed(j), sub(credits(j), ruleRef(r(j, "special_allowance"))), zero));

const allocationRules = (i: number): Rule[] => [
  worksheetRule(i),
  rule(r(i, "special_allowance"), `Passive activity ${i}: credit allowed under the special allowance — Worksheet 5, 6 or 7 column (c)`, "Worksheets 5–7", ALLOC_EXCERPT, "money", allowanceShare(i)),
  rule(
    r(i, "unallowed"),
    `Passive activity ${i}: unallowed passive credit carried to next year — Worksheet 8 column (c) / Worksheet 9 column (b)`,
    "Worksheets 8 and 9",
    `${ALLOC_EXCERPT} § 469(b): a credit disallowed "shall be treated as a deduction or credit allocable to such activity in the next taxable year."`,
    "money",
    iff(wsUsed(i), cumulative(i, ws8ColA, sub(L("5"), L("37"))), zero),
  ),
  rule(
    r(i, "allowed"),
    `Passive activity ${i}: passive credit allowed this year — Worksheet 9 column (c)`,
    "Worksheet 9",
    ALLOC_EXCERPT,
    "money",
    sub(credits(i), ruleRef(r(i, "unallowed"))),
  ),
];

// --- totals for Form 3800 ---------------------------------------------------------

const specified = (i: number): Expr => iff(wsUsed(i), sf(i, "CreditSpecified"), { kind: "bool", value: false });
const TOTAL_EXCERPT =
  'I3800 line 2: "Report on line 2 the total of all passive activity credit amounts included on Part III, line 2, column (d) ... and Part IV, line 6, column (d)." Line 3: "Enter the applicable passive activity credit amount allowed from Form 8582-CR ... The passive activity credit amount allowed on Part I, line 3, only applies to the general business credits not allowed against TMT from Part I, line 2. Do not include specified credits on line 3." Line 32: "Enter the sum of passive activity credits from Part III, line 5 ... Also, include passive specified credit carryovers". Line 33: "Enter the applicable current-year and carryover passive activity credit amount for general business credits allowed against TMT from Form 8582-CR".';

const totalRules: Rule[] = [
  rule(`${PC}.nonspecified`, "Passive credits that are not specified credits, current and prior-year — Form 3800 line 2", "Form 3800 line 2", TOTAL_EXCERPT, "money", add(...SLOTS.map((i) => iff(and(wsUsed(i), not(specified(i))), credits(i), zero)))),
  rule(`${PC}.nonspecified_allowed`, "Passive credits allowed that are not specified credits — Form 3800 line 3", "Form 3800 line 3", TOTAL_EXCERPT, "money", add(...SLOTS.map((i) => iff(and(wsUsed(i), not(specified(i))), ruleRef(r(i, "allowed")), zero)))),
  rule(`${PC}.specified`, "Passive specified credits, current and prior-year — Form 3800 line 32", "Form 3800 line 32", TOTAL_EXCERPT, "money", add(...SLOTS.map((i) => iff(specified(i), credits(i), zero)))),
  rule(`${PC}.specified_allowed`, "Passive specified credits allowed — Form 3800 line 33", "Form 3800 line 33", TOTAL_EXCERPT, "money", add(...SLOTS.map((i) => iff(specified(i), ruleRef(r(i, "allowed")), zero)))),
  rule(
    `${PC}.carryforward`,
    "Unallowed passive credits carried to next year, all activities (§ 469(b))",
    "Worksheet 9 column (b)",
    `${ALLOC_EXCERPT} [Per activity: us.federal.passive_credit.activityN.unallowed.]`,
    "money",
    add(...SLOTS.map((i) => ruleRef(r(i, "unallowed")))),
  ),
];

export const passiveCreditRules: Rule[] = [
  ...SLOTS.flatMap(allocationRules),
  ...partIRules,
  ...partRules,
  ...taxRules("2025", 1, "2025-01-01", "2026-01-01"),
  ...taxRules("2026", 2, "2026-01-01", "2027-01-01"),
  ...taxRules("2027", 3, "2027-01-01", "2028-01-01"),
  ...totalRules,
];
