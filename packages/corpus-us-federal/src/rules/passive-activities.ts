/**
 * § 469 by activity — Form 8582 Parts I–VIII, flowing into AGI, NIIT, QBI,
 * § 461(l) and the EITC investment-income test. Verified November 2026.
 *
 * Sources (verbatim excerpts in each rule): 26 U.S.C. § 469(a), (b), (d)(1),
 * (g), (i), (k); Reg. §§ 1.469-1T(f)(2) (ratable disallowance among and within
 * activities), 1.469-1(f)(4) (carryover by activity), 1.469-2T(f)(2)
 * (significant participation); Form 8582 (2025) and its instructions
 * (November 26, 2025); Pub. 925 (2025); Reg. §§ 1.1411-4(f)(2), (g)(9) and
 * 1.1411-5(b)(2)(i) (net investment income); Reg. § 1.199A-3(b)(1)(iv)
 * (previously disallowed losses in QBI); Pub. 596 (2025) Worksheet 1 lines
 * 11–13.
 *
 * Up to eight activities (passiveActivities), each with a kind:
 *   rental_active  rental real estate with active participation (Part IV)
 *   rental         any other rental activity (Part V)
 *   business       a trade or business without material participation (Part V)
 *   business_sp    a significant participation activity (Pub. 925 Worksheets
 *                  A and B; Part V unless the group nets to income)
 *   ptp            a publicly traded partnership (§ 469(k): its own netting,
 *                  never on Form 8582)
 *
 * Off Form 8582, every loss allowed: an entire interest disposed of in a
 * fully taxable transaction with an overall loss (§ 469(g)(1)(A); I8582
 * "Entire disposition ... overall loss"), a PTP, and the significant
 * participation group when it nets to income (Reg. § 1.469-1T(f)(2)(i)(C)).
 *
 * The special allowance's modified AGI is AGI computed without the Form 8582
 * activities (the rules contributing us.federal.passive.*.form8582), less
 * taxable social security, plus the IRA, student loan and ½-SE deductions and
 * real estate professional losses (I8582 line 6). The allocations use exact
 * ratios with cumulative rounding to the cent, so each part's column (c)
 * total equals the amount allocated.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";
const P = `${J}.passive`;
export const PASSIVE_SLOTS = 8;
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
const unsupported = (reason: string): Expr => ({ kind: "unsupported", reason });
/** round(a × b / c), $0 when c is $0 */
const ratio = (a: Expr, b: Expr, c: Expr): Expr => iff(cmp("eq", c, zero), zero, { kind: "mulDiv", a, b, c, round: "half-up" });

// --- facts of activity i -----------------------------------------------------

export const slotFact = (i: number, name: string): string => `passiveActivity${i}${name}`;
const sf = (i: number, name: string): Expr => fact(slotFact(i, name));
const active = (i: number): Expr => cmp("ge", fact("passiveActivities"), int(String(i)));
/** a money fact of activity i, $0 (and never read) when the slot is unused */
const amt = (i: number, name: string): Expr => iff(active(i), sf(i, name), zero);
const FALSE: Expr = { kind: "bool", value: false };
/** a condition on activity i, false (and nothing read) when the slot is unused — an `if`, so an
 *  unknown passiveActivities asks for that alone, not for every slot's facts */
const onSlot = (i: number, cond: Expr): Expr => iff(active(i), cond, FALSE);
const kindIs = (i: number, ...kinds: string[]): Expr => onSlot(i, or(...kinds.map((k) => cmp("eq", sf(i, "Kind"), enumV(k)))));
const disposedTaxable = (i: number): Expr => onSlot(i, cmp("eq", sf(i, "Disposition"), enumV("entire_taxable")));

const income = (i: number): Expr => amt(i, "Income");
const loss = (i: number): Expr => amt(i, "Loss");
const prior = (i: number): Expr => amt(i, "PriorUnallowed");
const dispGain = (i: number): Expr => amt(i, "DispositionGain");
const dispLoss = (i: number): Expr => amt(i, "DispositionLoss");
/** Form 8582 column (a): current-year net income, with gain on disposition */
const colA = (i: number): Expr => add(income(i), dispGain(i));
/** column (b): current-year net loss, with loss on disposition */
const colB = (i: number): Expr => add(loss(i), dispLoss(i));
/** all of the activity's losses (columns (b) and (c)) */
const losses = (i: number): Expr => add(colB(i), prior(i));

const r = (i: number, name: string): string => `${P}.activity${i}.${name}`;
const overall = (i: number): Expr => ruleRef(r(i, "overall"));
const mfsTogether: Expr = and(
  cmp("eq", fact("filingStatus"), enumV("mfs")),
  not(fact("mfsLivedApartAllYear")),
);

// --- citations ----------------------------------------------------------------

const URL_8582 = "https://www.irs.gov/forms-pubs/about-form-8582";
const URL_469 = "https://www.law.cornell.edu/uscode/text/26/469";
const DEFS =
  'I8582 Definitions: "Net income. This is the excess of current year income over current year deductions from the activity. This includes any current year gains or losses from the disposition of assets or an interest in the activity." "Overall gain. This is the excess of the “net income” from the activity over the prior-year unallowed losses from the activity." "Overall loss. This is (a) the excess of the prior-year unallowed losses from the activity over the “net income” from the activity, or (b) the prior-year unallowed losses from the activity plus the “net loss” from the activity."';
const DISPOSITION =
  '§ 469(g)(1)(A): "If all gain or loss realized on such disposition is recognized, the excess of— (i) any loss from such activity for such taxable year (determined after the application of subsection (b)), over (ii) any net income or gain for such taxable year from all other passive activities (determined after the application of subsection (b)), shall be treated as a loss which is not from a passive activity." I8582: "If you have an overall loss when you combine the income and losses, don’t use Form 8582 for the activity. All losses (including prior-year unallowed losses) are allowed in full." [When the other activities net to income, Form 8582 line 3 is not a loss and nothing is limited, so taking the activity off the form gives the statute’s result.]';
const SPPA =
  'Pub. 925 Worksheet A: "Net income means the excess of the current-year net income from the activity over any prior-year unallowed losses from the activity." "If column (d) is a net loss, skip Worksheet B. ... Include the income and losses in Part V of Form 8582." Reg. § 1.469-1T(f)(2)(i)(C): if the gross income from significant participation passive activities exceeds their deductions, "such activities shall be treated, solely for purposes of applying this paragraph (f)(2)(i) for the taxable year, as a single activity that does not have a loss for such taxable year"; Worksheet B treats the excess as nonpassive income (§ 1.469-2T(f)(2)). An activity whose entire interest was sold with an overall loss is left out of the test: its losses are nonpassive under § 469(g), and "Passive activity deductions do not include ... A deduction that, under section 469(g) ... is treated as a deduction that is not a passive activity deduction" (Reg. § 1.469-2T(d)(2)(v)).';

function rule(
  id: string,
  title: string,
  citation: { source: string; section: string; url: string; excerpt: string },
  type: "money" | "bool",
  formula: Expr,
  extra: Partial<Rule> = {},
): Rule {
  return { id, version: 1, jurisdiction: J, title, citation, effectiveFrom: "2025-01-01", output: { type }, formula, ...extra };
}

// --- the activity ------------------------------------------------------------

/** refusals that apply to any used slot, checked where the slot's result is first read */
const scopeChecks = (i: number, value: Expr): Expr =>
  iff(
    kindIs(i, "former_passive"),
    unsupported(
      `passive activity ${i} is a former passive activity: its prior-year unallowed losses are allowed only against its own income (§ 469(f)) — not modeled`,
    ),
    iff(
      onSlot(i, cmp("eq", sf(i, "Disposition"), enumV("installment"))),
      unsupported(
        `passive activity ${i} was disposed of on the installment method: the losses allowed each year follow the gain recognized (§ 469(g)(3); Pub. 925) — not modeled`,
      ),
      iff(
        onSlot(i, cmp("eq", sf(i, "Disposition"), enumV("other"))),
        unsupported(
          `passive activity ${i} was disposed of by gift, at death or to a related party (§ 469(g)(1)(B), (g)(2), (j)(6)) — not modeled`,
        ),
        value,
      ),
    ),
  );

const sppaGroupNet = ruleRef(`${P}.significant_participation_net`);

const activityRules = (i: number): Rule[] => [
  rule(
    r(i, "overall"),
    `Passive activity ${i}: overall gain (positive) or loss (negative) — Form 8582 Parts IV/V columns (d)/(e)`,
    { source: "Instructions for Form 8582 (2025)", section: "Definitions; Parts IV and V, columns (d) and (e)", url: URL_8582, excerpt: DEFS },
    "money",
    scopeChecks(i, sub(colA(i), losses(i))),
  ),
  rule(
    r(i, "off_form"),
    `Passive activity ${i} is off Form 8582 with every loss allowed (§ 469(g) disposition with an overall loss, or a significant participation group with net income)`,
    { source: "26 U.S.C. § 469(g)(1)(A); Reg. § 1.469-1T(f)(2)(i)(C); Instructions for Form 8582 (2025); Pub. 925", section: "§ 469(g)(1)(A); Pub. 925 Worksheets A and B", url: URL_469, excerpt: `${DISPOSITION} ${SPPA}` },
    "bool",
    onSlot(
      i,
      and(
        not(kindIs(i, "ptp")),
        or(
          and(disposedTaxable(i), lt0(overall(i))),
          and(kindIs(i, "business_sp"), gt0(sppaGroupNet)),
        ),
      ),
    ),
  ),
  rule(
    r(i, "part_iv"),
    `Passive activity ${i} is in Form 8582 Part IV (rental real estate with active participation)`,
    {
      source: "26 U.S.C. § 469(i)(1), (5)(B); Instructions for Form 8582 (2025), Part IV",
      section: "Part IV",
      url: URL_8582,
      excerpt:
        'I8582 Part IV: "Individuals and qualifying estates who actively participated in rental real estate activities must include the income or loss from those activities in Part IV". "Married individuals who file separate returns and lived with their spouses at any time during the tax year don’t qualify under the active participation rule and must use Part V instead of Part IV." "Don’t enter a prior-year unallowed loss in column (c) of Part IV unless you actively participated in the activity in both the year the loss arose and the current tax year." [A prior-year loss from a year without active participation goes in its own activity of kind rental.]',
    },
    "bool",
    and(kindIs(i, "rental_active"), not(mfsTogether), not(ruleRef(r(i, "off_form")))),
  ),
  rule(
    r(i, "part_v"),
    `Passive activity ${i} is in Form 8582 Part V (all other passive activities)`,
    {
      source: "Instructions for Form 8582 (2025), Part V",
      section: "Part V",
      url: URL_8582,
      excerpt:
        'I8582 Part V: "Use Part V to figure the amounts to enter on Part I, lines 2a through 2c, for: Passive trade or business activities, Passive rental real estate activities that don’t qualify for the special allowance, and Rental activities other than rental real estate activities."',
    },
    "bool",
    and(
      or(kindIs(i, "rental", "business", "business_sp"), and(kindIs(i, "rental_active"), mfsTogether)),
      not(ruleRef(r(i, "off_form"))),
    ),
  ),
  rule(
    r(i, "special_allowance"),
    `Passive activity ${i}: its share of the special allowance — Form 8582 Part VI column (c)`,
    {
      source: "Instructions for Form 8582 (2025), Part VI",
      section: "Part VI, columns (a)–(d)",
      url: URL_8582,
      excerpt:
        'I8582 Part VI: "Column (a). Enter the overall loss from column (e) of Part IV for each activity." "Column (b). Divide each of the individual losses shown in column (a) by the total of all the losses in column (a)". "Column (c). Multiply each ratio in column (b) by the amount on Part II, line 9". "Column (d). Subtract column (c) from column (a)". [Exact ratios; each share rounded to the cent cumulatively so column (c) totals line 9 exactly.]',
    },
    "money",
    cumulative(i, (j) => partVIcolA(j), ruleRef(`${P}.form8582.line9`)),
  ),
  rule(
    r(i, "unallowed"),
    `Passive activity ${i}: unallowed loss carried to next year (§ 469(b)) — Form 8582 Part VII column (c), or the PTP's excess loss`,
    {
      source: "26 U.S.C. § 469(b), (k); Reg. §§ 1.469-1T(f)(2)(i), 1.469-1(f)(4); Instructions for Form 8582 (2025), Part VII",
      section: "§ 469(b); Part VII, columns (a)–(c)",
      url: URL_8582,
      excerpt:
        'Reg. § 1.469-1T(f)(2)(i)(A): "a ratable portion of the loss (if any) from each passive activity of the taxpayer is disallowed. ... the ratable portion of a loss from an activity is computed by multiplying the passive activity loss that is disallowed for the taxable year by the fraction obtained by dividing— (1) The loss from the activity for the taxable year; by (2) The sum of the losses for the taxable year from all activities having losses for such year." I8582 Part VII: "Column (a). Enter the amounts, if any, from column (d) of Part VI ... Also enter the losses, if any, from column (e) of Part V." Column (c): "A. Enter as a positive amount Part I, line 3 ... B. Enter Part II, line 9 ... C. Subtract line B from line A. Multiply each ratio in column (b) by the amount on line C". PTPs (I8582): "If you have an overall loss ... the losses are allowed only to the extent of the income, and the excess loss is carried forward". Reg. § 1.469-1(f)(4): disallowed deductions "shall be treated as deductions from the activity for the succeeding taxable year". [Cumulative rounding to the cent. A loss on disposing of activity property that would be partly disallowed needs Part IX (Form 8949/4797 split) — refused.]',
    },
    "money",
    (() => {
      const ptpUnallowed = and(kindIs(i, "ptp"), not(disposedTaxable(i)));
      const value = iff(
        ptpUnallowed,
        max0(neg(overall(i))),
        iff(
          or(ruleRef(r(i, "part_iv")), ruleRef(r(i, "part_v"))),
          cumulative(i, (j) => partVIIcolA(j), ruleRef(`${P}.form8582.disallowed`)),
          zero,
        ),
      );
      return iff(
        and(gt0(dispLoss(i)), gt0(value)),
        unsupported(
          `passive activity ${i} has a loss on disposing of its property and part of its losses is disallowed: splitting the disallowed loss between Schedule E and Form 8949/4797 (Form 8582 Part IX) is not modeled`,
        ),
        value,
      );
    })(),
  ),
  rule(
    r(i, "net"),
    `Passive activity ${i}: ordinary income less allowed ordinary losses (Schedule E/C/F) — gains and losses on disposition stay in the capital facts`,
    {
      source: "Instructions for Form 8582 (2025), How To Report Allowed Losses",
      section: "Parts VIII; How To Report Allowed Losses",
      url: URL_8582,
      excerpt:
        'I8582 Part VIII: "Column (a). ... enter the net loss plus the prior-year unallowed loss for the activity." "Column (b). ... enter the amount from column (c) of Part VII for the activity." "Column (c). Subtract column (b) from column (a). These amounts are the losses allowed for 2025 under the passive loss rules." "Report the loss allowed from column (c) of Part VIII and the income, if any, for that activity from column (a) of Part IV or V on the form or schedule normally used." [Ordinary result = income − (current loss + prior-year unallowed loss − unallowed loss); a gain or loss on disposing of activity property is reported on Form 8949/4797 and is already in the capital facts.]',
    },
    "money",
    scopeChecks(i, sub(add(income(i), ruleRef(r(i, "unallowed"))), add(loss(i), prior(i)))),
  ),
];

// Part VI column (a): a Part IV activity's overall loss
const partVIcolA = (j: number): Expr => iff(and(ruleRef(r(j, "part_iv")), lt0(overall(j))), neg(overall(j)), zero);
// Part VII column (a): Part VI column (d), or a Part V activity's overall loss
const partVIIcolA = (j: number): Expr =>
  add(
    sub(partVIcolA(j), ruleRef(r(j, "special_allowance"))),
    iff(and(ruleRef(r(j, "part_v")), lt0(overall(j))), neg(overall(j)), zero),
  );

/** activity i's share of `total`, by column (a) amounts: round(total × Σ≤i / Σ) − round(total × Σ<i / Σ) */
function cumulative(i: number, col: (j: number) => Expr, total: Expr): Expr {
  const all = add(...SLOTS.map(col));
  const upTo = (k: number): Expr => add(...SLOTS.filter((j) => j <= k).map(col));
  return sub(ratio(total, upTo(i), all), ratio(total, upTo(i - 1), all));
}

// --- Form 8582 Part I and II ---------------------------------------------------

const sumOver = (part: "part_iv" | "part_v", value: (i: number) => Expr): Expr =>
  add(...SLOTS.map((i) => iff(ruleRef(r(i, part)), value(i), zero)));

const line = (n: string): string => `${P}.form8582.line${n}`;
const L = (n: string): Expr => ruleRef(line(n));

const PART_I_EXCERPT =
  'Form 8582 (2025) Part I: "1a Activities with net income (enter the amount from Part IV, column (a))"; "1b Activities with net loss (enter the amount from Part IV, column (b))"; "1c Prior years’ unallowed losses (enter the amount from Part IV, column (c))"; "1d Combine lines 1a, 1b, and 1c"; lines 2a–2d the same from Part V; "3 Combine lines 1d and 2d ... If this line is zero or more, stop here ... all losses are allowed, including any prior year unallowed losses entered on line 1c or 2c."';

const MAGI_EXCERPT =
  '§ 469(i)(3)(E): "adjusted gross income shall be determined without regard to— (i) any amount includible in gross income under section 86, (ii) the amounts excludable from gross income under sections 85(c), 135, and 137, (iii) the amounts allowable as a deduction under sections 219, 221, and 250, and (iv) any passive activity loss or any loss allowable by reason of subsection (c)(7)." I8582 line 6: "combine all the amounts used to figure adjusted gross income, except don’t take into account: Any passive activity loss as defined in section 469(d)(1), Any rental real estate loss allowed to real estate professionals ..., The taxable amount of social security and tier 1 railroad retirement benefits, Deductible contributions to traditional individual retirement accounts (IRAs) ..., The deduction allowed for the deductible part of self-employment taxes, ... The student loan interest deduction". "When figuring modified adjusted gross income, include any overall loss from the entire disposition of a passive activity (considered a nonpassive loss)." [AGI evaluated without the Form 8582 activities’ results and without their gains on disposition (Part II is reached only when line 3 is a loss, so the passive income and loss on the form net to zero under either reading), less that pass’s taxable social security, plus its IRA, student loan and ½-SE deductions (the instructions list the last; § 469(i)(3)(E) does not) and nonpassiveScheduleELoss. The §§ 85(c), 135 and 137 exclusions and § 250 are not modeled anywhere in AGI. A Form 8582 activity’s gain on disposition alongside capital losses, or its loss on disposition, when Part II is reached, is refused: how much of it is in AGI depends on Schedule D netting.]';

const FORM8582 = [
  "us.federal.passive.business_net.form8582",
  "us.federal.passive.rental_net.form8582",
];
const without8582 = (ruleId: string): Expr => ({ kind: "rule", ruleId, excluding: FORM8582 });

const onFormDispGain = add(...SLOTS.map((i) => iff(or(ruleRef(r(i, "part_iv")), ruleRef(r(i, "part_v"))), dispGain(i), zero)));
const onFormDispLoss = add(...SLOTS.map((i) => iff(or(ruleRef(r(i, "part_iv")), ruleRef(r(i, "part_v"))), dispLoss(i), zero)));
const capitalLossesPresent = or(
  gt0(fact("shortTermCapitalLoss")),
  gt0(fact("longTermCapitalLoss")),
  gt0(fact("netCapitalLoss")),
  gt0(fact("priorYearShortTermCapitalLossCarryover")),
  gt0(fact("priorYearLongTermCapitalLossCarryover")),
);

const formRules: Rule[] = [
  rule(
    `${P}.significant_participation_net`,
    "Significant participation passive activities: combined net income (positive) or net loss — Pub. 925 Worksheet A column (d)",
    { source: "Pub. 925 (2025); Reg. §§ 1.469-1T(f)(2)(i)(C), 1.469-2T(f)(2)", section: "Worksheets A and B", url: "https://www.irs.gov/publications/p925", excerpt: SPPA },
    "money",
    // an entire disposition with an overall loss is out: its deductions are not passive activity
    // deductions (Reg. § 1.469-2T(d)(2)(v)), and the test weighs only passive income and deductions
    add(
      ...SLOTS.map((i) =>
        iff(and(kindIs(i, "business_sp"), not(and(disposedTaxable(i), lt0(overall(i))))), overall(i), zero),
      ),
    ),
  ),
  rule(line("1a"), "Form 8582 line 1a — Part IV activities with net income", { source: "Form 8582 (2025)", section: "Part I line 1a", url: URL_8582, excerpt: PART_I_EXCERPT }, "money", sumOver("part_iv", colA)),
  rule(line("1b"), "Form 8582 line 1b — Part IV activities with net loss (positive)", { source: "Form 8582 (2025)", section: "Part I line 1b", url: URL_8582, excerpt: PART_I_EXCERPT }, "money", sumOver("part_iv", colB)),
  rule(line("1c"), "Form 8582 line 1c — Part IV prior years' unallowed losses (positive)", { source: "Form 8582 (2025)", section: "Part I line 1c", url: URL_8582, excerpt: PART_I_EXCERPT }, "money", sumOver("part_iv", prior)),
  rule(line("1d"), "Form 8582 line 1d — Part IV combined", { source: "Form 8582 (2025)", section: "Part I line 1d", url: URL_8582, excerpt: PART_I_EXCERPT }, "money", sub(L("1a"), add(L("1b"), L("1c")))),
  rule(line("2a"), "Form 8582 line 2a — Part V activities with net income", { source: "Form 8582 (2025)", section: "Part I line 2a", url: URL_8582, excerpt: PART_I_EXCERPT }, "money", sumOver("part_v", colA)),
  rule(line("2b"), "Form 8582 line 2b — Part V activities with net loss (positive)", { source: "Form 8582 (2025)", section: "Part I line 2b", url: URL_8582, excerpt: PART_I_EXCERPT }, "money", sumOver("part_v", colB)),
  rule(line("2c"), "Form 8582 line 2c — Part V prior years' unallowed losses (positive)", { source: "Form 8582 (2025)", section: "Part I line 2c", url: URL_8582, excerpt: PART_I_EXCERPT }, "money", sumOver("part_v", prior)),
  rule(line("2d"), "Form 8582 line 2d — Part V combined", { source: "Form 8582 (2025)", section: "Part I line 2d", url: URL_8582, excerpt: PART_I_EXCERPT }, "money", sub(L("2a"), add(L("2b"), L("2c")))),
  rule(line("3"), "Form 8582 line 3 — combined passive income or loss", { source: "Form 8582 (2025)", section: "Part I line 3", url: URL_8582, excerpt: PART_I_EXCERPT }, "money", add(L("1d"), L("2d"))),
  rule(
    `${P}.form8582.magi`,
    "Modified adjusted gross income for the special allowance — Form 8582 line 6 (§ 469(i)(3)(E))",
    { source: "26 U.S.C. § 469(i)(3)(E); Instructions for Form 8582 (2025), line 6; Pub. 925", section: "§ 469(i)(3)(E); Form 8582 line 6", url: URL_8582, excerpt: MAGI_EXCERPT },
    "money",
    iff(
      and(or(gt0(onFormDispGain), gt0(onFormDispLoss)), or(gt0(onFormDispLoss), capitalLossesPresent)),
      unsupported(
        "a Form 8582 activity has a gain or loss on disposing of its property alongside capital losses (or a loss on disposition): how much of it is in AGI depends on Schedule D netting, so the special allowance's modified AGI is not modeled",
      ),
      max0(
        add(
          sub(
            sub(without8582(`${J}.agi`), without8582(`${J}.taxable_social_security`)),
            onFormDispGain,
          ),
          without8582(`${J}.ira_deduction`),
          without8582(`${J}.student_loan_interest_deduction`),
          without8582(`${J}.se_tax_half_deduction`),
          fact("nonpassiveScheduleELoss"),
        ),
      ),
    ),
  ),
  rule(
    line("9"),
    "Form 8582 line 9 — special allowance for rental real estate with active participation (§ 469(i))",
    {
      source: "26 U.S.C. § 469(i)(1)–(3), (5); Form 8582 (2025) Part II and instructions",
      section: "§ 469(i); Part II lines 4–9",
      url: URL_8582,
      excerpt:
        'Form 8582 Part II: "4 Enter the smaller of the loss on line 1d or the loss on line 3"; "5 Enter $150,000. If married filing separately, see instructions"; "6 Enter modified adjusted gross income, but not less than zero"; "7 Subtract line 6 from line 5"; "8 Multiply line 7 by 50% (0.50). Do not enter more than $25,000. If married filing separately, see instructions"; "9 Enter the smaller of line 4 or line 8". Line 5: "Married persons filing separate returns who lived apart from their spouses at all times during the year must enter $75,000 on line 5 instead of $150,000." Line 8: "Don’t enter more than $12,500 on line 8 if you’re married filing a separate return and you and your spouse lived apart at all times during the year." Part I: "If line 3 is a loss and: Line 1d is a loss, go to Part II. Line 2d is a loss (and line 1d is zero or more), skip Part II". "Caution: If your filing status is married filing separately and you lived with your spouse at any time during the year, do not complete Part II." [Not modeled: prior-year commercial revitalization deductions; the rehabilitation and low-income housing credits’ own allowance (Form 8582-CR).]',
    },
    "money",
    (() => {
      const mfsApart = and(cmp("eq", fact("filingStatus"), enumV("mfs")), fact("mfsLivedApartAllYear"));
      const line5 = iff(mfsApart, money("7500000"), money("15000000"));
      const cap = iff(mfsApart, money("1250000"), money("2500000"));
      const line8 = min(cap, { kind: "mulRate", base: max0(sub(line5, ruleRef(`${P}.form8582.magi`))), rate: { num: "50", den: "100" }, round: "half-up" });
      return iff(
        and(lt0(L("3")), lt0(L("1d")), not(mfsTogether)),
        min(min(neg(L("1d")), neg(L("3"))), line8),
        zero,
      );
    })(),
  ),
  rule(
    `${P}.form8582.disallowed`,
    "Form 8582 passive activity loss disallowed this year — Part VII worksheet line C (line 3 loss less line 9)",
    {
      source: "26 U.S.C. § 469(a)(1), (d)(1); Instructions for Form 8582 (2025), Part VII",
      section: "§ 469(d)(1); Part VII column (c) lines A–C",
      url: URL_8582,
      excerpt:
        '§ 469(d)(1): "the term ‘passive activity loss’ means the amount (if any) by which— (A) the aggregate losses from all passive activities for the taxable year, exceed (B) the aggregate income from all passive activities for such year." I8582 Part VII column (c): "A. Enter as a positive amount Part I, line 3 ... B. Enter Part II, line 9 ... C. Subtract line B from line A."',
    },
    "money",
    max0(sub(neg(L("3")), L("9"))),
  ),
  rule(
    line("11"),
    "Form 8582 line 11 — total losses allowed from all passive activities on the form",
    {
      source: "Form 8582 (2025) Part III",
      section: "Part III lines 10–11",
      url: URL_8582,
      excerpt:
        'Form 8582: "10 Add the income, if any, on lines 1a and 2a and enter the total"; "11 Total losses allowed from all passive activities for 2025. Add lines 9 and 10." I8582: "Line 11 is the same as the total of Part I, lines 1b, 1c, 2b, 2c" when line 3 is income or zero. [When line 3 is income, every loss on the form is allowed, so line 11 is lines 1b + 1c + 2b + 2c.]',
    },
    "money",
    iff(cmp("ge", L("3"), zero), add(L("1b"), L("1c"), L("2b"), L("2c")), add(L("1a"), L("2a"), L("9"))),
  ),
  rule(
    `${P}.carryforward`,
    "Unallowed passive losses carried to next year, all activities (§ 469(b)) — next year's column (c) amounts",
    {
      source: "26 U.S.C. § 469(b); Reg. § 1.469-1(f)(4)",
      section: "§ 469(b)",
      url: URL_469,
      excerpt:
        '§ 469(b): "any loss or credit from an activity which is disallowed under subsection (a) shall be treated as a deduction or credit allocable to such activity in the next taxable year." [Per activity: us.federal.passive.activityN.unallowed.]',
    },
    "money",
    add(...SLOTS.map((i) => ruleRef(r(i, "unallowed")))),
  ),
];

// --- where the results go -------------------------------------------------------

const isBusinessKind = (i: number): Expr => kindIs(i, "business", "business_sp", "ptp");
const isRentalKind = (i: number): Expr => kindIs(i, "rental_active", "rental");
const onForm = (i: number): Expr => or(ruleRef(r(i, "part_iv")), ruleRef(r(i, "part_v")));
const netWhere = (cond: (i: number) => Expr): Expr => add(...SLOTS.map((i) => iff(cond(i), ruleRef(r(i, "net")), zero)));

const NET_EXCERPT =
  'I8582 How To Report Allowed Losses: Schedule E Part I: "Enter the allowed loss from the part on line 22 of Schedule E." Schedule E Parts II and III: "Any item of income shown on your Schedule K-1 that’s passive income must be entered as passive income in the appropriate column of Schedule E, Part II or III. Enter the passive loss allowed from Part VIII or IX of Form 8582 in the appropriate column for passive losses." Schedules C and F: "Enter on the net profit or loss line ... the allowed passive loss from the part."';

const QBI_URL = "https://www.law.cornell.edu/cfr/text/26/1.199A-3";

const flowRules: Rule[] = [
  rule(
    `${P}.business_net`,
    "Passive trade or business activities (business, significant participation, PTP): ordinary income less allowed losses — Schedule E Part II / Schedule C / F",
    { source: "26 U.S.C. § 469; Instructions for Form 8582 (2025)", section: "How To Report Allowed Losses", url: URL_8582, excerpt: `${NET_EXCERPT} [This total holds the activities off Form 8582; the Form 8582 activities contribute through us.federal.passive.business_net.form8582.]` },
    "money",
    // a former passive activity is read here so its refusal is reached
    netWhere((i) => and(or(isBusinessKind(i), kindIs(i, "former_passive")), not(onForm(i)))),
  ),
  rule(
    `${P}.business_net.form8582`,
    "Passive trade or business activities on Form 8582: ordinary income less allowed losses",
    { source: "26 U.S.C. § 469; Instructions for Form 8582 (2025)", section: "How To Report Allowed Losses", url: URL_8582, excerpt: `${NET_EXCERPT} [A contribution, so the special allowance’s modified AGI can be figured without it.]` },
    "money",
    netWhere((i) => and(isBusinessKind(i), onForm(i))),
    { contributesTo: `${P}.business_net` },
  ),
  rule(
    `${P}.rental_net`,
    "Passive rental activities: ordinary income less allowed losses — Schedule E Part I / Part II",
    { source: "26 U.S.C. § 469; Instructions for Form 8582 (2025)", section: "How To Report Allowed Losses", url: URL_8582, excerpt: `${NET_EXCERPT} [This total holds the activities off Form 8582; the Form 8582 activities contribute through us.federal.passive.rental_net.form8582.]` },
    "money",
    netWhere((i) => and(isRentalKind(i), not(onForm(i)))),
  ),
  rule(
    `${P}.rental_net.form8582`,
    "Passive rental activities on Form 8582: ordinary income less allowed losses",
    { source: "26 U.S.C. § 469; Instructions for Form 8582 (2025)", section: "How To Report Allowed Losses", url: URL_8582, excerpt: `${NET_EXCERPT} [A contribution, so the special allowance’s modified AGI can be figured without it.]` },
    "money",
    netWhere((i) => and(isRentalKind(i), onForm(i))),
    { contributesTo: `${P}.rental_net` },
  ),
  rule(
    `${P}.net`,
    "Passive activities' ordinary income less allowed losses, all activities — part of Schedule 1 line 3/5 (gross income)",
    { source: "26 U.S.C. §§ 61, 469; Instructions for Form 8582 (2025)", section: "How To Report Allowed Losses", url: URL_8582, excerpt: NET_EXCERPT },
    "money",
    add(ruleRef(`${P}.business_net`), ruleRef(`${P}.rental_net`)),
  ),
  rule(
    `${P}.nonpassive_recharacterized`,
    "Significant participation net income treated as nonpassive (Pub. 925 Worksheet B column (c) total) — out of net investment income",
    {
      source: "Reg. §§ 1.469-2T(f)(2), 1.1411-5(b)(2)(i); Pub. 925 (2025)",
      section: "§ 1.1411-5(b)(2)(i); Worksheet B",
      url: "https://www.law.cornell.edu/cfr/text/26/1.1411-5",
      excerpt: `${SPPA} Reg. § 1.1411-5(b)(2)(i): "To the extent that any income or gain from a trade or business is recharacterized as “not from a passive activity” by reason of § 1.469-2T(f)(2), § 1.469-2(f)(5), or § 1.469-2(f)(6), such trade or business does not constitute a passive activity ... solely with respect to such recharacterized income or gain."`,
    },
    "money",
    max0(sppaGroupNet),
  ),
  rule(
    `${P}.niit_net`,
    "Passive activities in net investment income — Form 8960 line 4a (and the § 469(g) losses allowed as properly allocable deductions)",
    {
      source: "26 U.S.C. § 1411(c)(1)(A), (c)(2)(A); Reg. § 1.1411-4(f)(2), (g)(9); Reg. § 1.1411-5(b)(2)(i); Instructions for Form 8960 (2025)",
      section: "§ 1411(c)(2)(A); Form 8960 line 4a",
      url: "https://www.law.cornell.edu/cfr/text/26/1.1411-4",
      excerpt:
        'I8960 line 4a: "In order to generally capture passive income from trades/businesses/farming that is subject to NIIT, total income from Schedules C, E, and F (Form 1040) is entered on line 4a." I8960: "If you dispose of an activity that’s always been a passive activity, the suspended passive losses from that activity are allowed in full as a properly allocable deduction." Reg. § 1.1411-4(g)(9): "Losses allowed in computing taxable income by reason of section 469(g) are taken into account ... as properly allocable deductions". Reg. § 1.1411-4(f)(2)(ii) Example: amounts suspended from prior years are treated "as deductions in the current year", so they are properly allocable deductions when allowed. [Each activity’s ordinary result; gains and losses on disposition are in the capital facts and so already in Form 8960 line 5a. Significant participation income recharacterized as nonpassive is taken out (Reg. § 1.1411-5(b)(2)(i)).]',
    },
    "money",
    sub(ruleRef(`${P}.net`), ruleRef(`${P}.nonpassive_recharacterized`)),
  ),
  rule(
    `${P}.eitc_income`,
    "Net income from passive activities for the EITC investment income limit (§ 32(i)(2)(D); Pub. 596 Worksheet 1 line 13)",
    {
      source: "26 U.S.C. § 32(i)(2)(D); Pub. 596 (2025) Worksheet 1",
      section: "§ 32(i)(2)(D); Worksheet 1 lines 11–13",
      url: "https://www.irs.gov/publications/p596",
      excerpt:
        '§ 32(i)(2)(D): "the excess (if any) of— (i) the aggregate income from all passive activities for the taxable year ..., over (ii) the aggregate losses from all passive activities for the taxable year". Pub. 596 Worksheet 1: "11. Enter the total of any net income from passive activities (such as income included on Schedule E, line 26, 29a (col. (h)), 34a (col. (d)), or 40 ...)"; "12. Enter the total of any losses from passive activities"; "13. Combine the amounts on lines 11 and 12 of this worksheet. (If the result is less than zero, enter -0-.)" [The activities as reported, after Form 8582; significant participation income recharacterized as nonpassive is not passive income.]',
    },
    "money",
    max0(sub(ruleRef(`${P}.net`), ruleRef(`${P}.nonpassive_recharacterized`))),
  ),
  rule(
    `${P}.qbi_net`,
    "Passive activities' qualified business income (QBI-flagged activities' ordinary result, allowed prior-year losses included)",
    {
      source: "26 U.S.C. § 199A(c); Reg. § 1.199A-3(b)(1)(iv)",
      section: "§ 1.199A-3(b)(1)(iv)",
      url: QBI_URL,
      excerpt:
        'Reg. § 1.199A-3(b)(1)(iv)(A): "Previously disallowed losses or deductions allowed in the taxable year generally are taken into account for purposes of computing QBI to the extent the disallowed loss or deduction is otherwise allowed by section 199A. These previously disallowed losses include, but are not limited to losses disallowed under sections 461(l), 465, 469, 704(d), and 1366(d). These losses are used ... in order from the oldest to the most recent on a first-in, first-out (FIFO) basis ... However, losses or deductions that were disallowed, suspended, limited, or carried over from taxable years ending before January 1, 2018 ... are not taken into account in a subsequent taxable year for purposes of computing QBI." [Each activity flagged passiveActivityNQbi adds its ordinary result to the main business’s QBI. An activity with pre-2018 unallowed losses and some loss allowed is refused (the FIFO split is not modeled), as is a QBI-flagged PTP (qualified PTP income is not modeled). Whether a released loss came from an SSTB is taken from the activity as it is now — disclosed.]',
    },
    "money",
    add(
      ...SLOTS.map((i) => {
        const net = ruleRef(r(i, "net"));
        const allowed = sub(losses(i), ruleRef(r(i, "unallowed")));
        return iff(
          onSlot(i, cmp("ne", net, zero)),
          iff(
            sf(i, "Qbi"),
            iff(
              kindIs(i, "ptp"),
              unsupported(`passive activity ${i} is a PTP whose income is qualified PTP income: the § 199A PTP component is not modeled`),
              iff(
                and(gt0(amt(i, "PriorUnallowedPre2018")), gt0(prior(i)), gt0(allowed)),
                unsupported(
                  `passive activity ${i} has losses suspended before 2018 and some of its losses are allowed: the first-in, first-out split between pre-2018 losses (never QBI) and later ones (Reg. § 1.199A-3(b)(1)(iv)) is not modeled`,
                ),
                net,
              ),
            ),
            zero,
          ),
          zero,
        );
      }),
    ),
  ),
];

export const passiveActivityRules: Rule[] = [...SLOTS.flatMap(activityRules), ...formRules, ...flowRules];
