/**
 * General business credit — Form 3800 (2025) for individuals: Parts I and II
 * (Sections A, C, D), the § 38(c) limitation, to Schedule 3 line 6a.
 * Verified November 2026.
 *
 * Sources (verbatim excerpts in each rule): 26 U.S.C. §§ 38(a)–(c), 39(a);
 * Form 3800 (2025) and its instructions.
 *
 * Inputs are the component credits as Form 3800 Part III and Part IV total
 * them (after each credit's own form): nonpassive current-year credits and
 * § 39 carryforwards, each split between specified credits (§ 38(c)(4)(B),
 * allowed against the tentative minimum tax) and the rest; passive activities'
 * credits come from Form 8582-CR (rules/passive-credits.ts). The engine models
 * no foreign tax credit, so line 10a is zero and line 10b is every modeled
 * nonrefundable credit. Not modeled: the empowerment zone credit (Section B),
 * carrybacks from a later year, elective payment and transfer elections.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";
const G = `${J}.gbc`;
const PC = `${J}.passive_credit`;

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const zero = money("0");
const add = (...args: Expr[]): Expr => ({ kind: "add", args });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const min = (...args: Expr[]): Expr => ({ kind: "min", args });
const max = (...args: Expr[]): Expr => ({ kind: "max", args });
const cmp = (op: "lt" | "le" | "gt" | "ge" | "eq" | "ne", left: Expr, right: Expr): Expr => ({ kind: "cmp", op, left, right });
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const and = (...args: Expr[]): Expr => ({ kind: "and", args });
const quarter = (e: Expr): Expr => ({ kind: "mulRate", base: e, rate: { num: "25", den: "100" }, round: "half-up" });

const URL = "https://www.irs.gov/forms-pubs/about-form-3800";
const line = (n: string): string => `${G}.form3800.line${n}`;
const L = (n: string): Expr => ruleRef(line(n));

function rule(id: string, title: string, section: string, excerpt: string, formula: Expr, source = "26 U.S.C. § 38; Form 3800 (2025) and instructions"): Rule {
  return {
    id,
    version: 1,
    jurisdiction: J,
    title,
    citation: { source, section, url: URL, excerpt },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula,
  };
}

const LIMIT =
  '§ 38(c)(1): "The credit allowed under subsection (a) for any taxable year shall not exceed the excess (if any) of the taxpayer’s net income tax over the greater of— (A) the tentative minimum tax for the taxable year, or (B) 25 percent of so much of the taxpayer’s net regular tax liability as exceeds $25,000. For purposes of the preceding sentence, the term “net income tax” means the sum of the regular tax liability and the tax imposed by section 55, reduced by the credits allowable under subparts A and B of this part, and the term “net regular tax liability” means the regular tax liability reduced by the sum of the credits allowable under subparts A and B of this part."';

// the modeled nonrefundable credits (Form 1040 line 19; Schedule 3 lines 2–4, 5a, 5b and 7)
const otherCredits: Expr = add(
  ruleRef(`${J}.cdcc`),
  ruleRef(`${J}.education.nonrefundable`),
  ruleRef(`${J}.savers_credit`),
  ruleRef(`${J}.adoption.nonrefundable`),
  ruleRef(`${J}.schedule_r_credit`),
  ruleRef(`${J}.energy.home_improvement_credit`),
  ruleRef(`${J}.ctc`),
  ruleRef(`${J}.energy.clean_energy_credit`),
);

const isMfs: Expr = cmp("eq", fact("filingStatus"), { kind: "enum", value: "mfs" });
const line13Of = (threshold: string): Expr => quarter(max0(sub(L("12"), money(threshold))));

const rules: Rule[] = [
  rule(line("1"), "Form 3800 line 1 — nonpassive credits not allowed against TMT", "Part I line 1", 'I3800 line 1: "Non-passive credits from Part III, line 2: Combine column (e) with non-passive amounts from column (f)."', fact("generalBusinessCreditNonpassive")),
  rule(line("2"), "Form 3800 line 2 — passive credits not allowed against TMT", "Part I line 2", 'Form 3800 line 2: "Credits subject to the passive activity limit."', ruleRef(`${PC}.nonspecified`)),
  rule(line("3"), "Form 3800 line 3 — portion of line 2 allowed (Form 8582-CR)", "Part I line 3", 'I3800 line 3: "Enter the applicable passive activity credit amount allowed from Form 8582-CR ... Do not include specified credits on line 3."', ruleRef(`${PC}.nonspecified_allowed`)),
  rule(line("4"), "Form 3800 line 4 — carryforwards to this year (not specified credits)", "Part I line 4", 'I3800 line 4: "Enter the amount of non-passive carryforwards to 2025 of unused credits that are reported from line 6 of Part IV, column (f)."', fact("generalBusinessCreditCarryforward")),
  rule(line("6"), "Form 3800 line 6 — credits not allowed against TMT", "Part I line 6", 'Form 3800: "6 Add lines 1, 3, 4, and 5." [Line 5, a carryback from next year, is entered only on an amended return — not modeled.]', add(L("1"), L("3"), L("4"))),
  rule(
    line("7"),
    "Form 3800 line 7 — regular tax before credits (Form 1040 line 16 + Schedule 2 line 1z)",
    "Part II line 7",
    'I3800 line 7: "Individuals. Enter the sum of the amounts from Form 1040, 1040-SR, or 1040-NR, line 16; and Schedule 2 (Form 1040), line 1z." [Form 1040 line 18 less the AMT.]',
    sub(ruleRef(`${J}.tax_before_nonrefundable_credits`), ruleRef(`${J}.amt`)),
  ),
  rule(line("9"), "Form 3800 line 9 — regular tax plus AMT (lines 7 + 8)", "Part II lines 8–9", 'Form 3800: "8 Alternative minimum tax: Individuals. Enter the amount from Form 6251, line 11." "9 Add lines 7 and 8."', ruleRef(`${J}.tax_before_nonrefundable_credits`)),
  rule(
    line("10c"),
    "Form 3800 line 10c — foreign tax credit and certain allowable credits",
    "Part II lines 10a–10c",
    `I3800 line 10b: "Individuals. Enter the amount from Form 1040, 1040-SR, or 1040-NR, line 19; and Schedule 3 (Form 1040), lines 2 through 4, 5a, 5b, and 7. Don’t include any general business credit claimed on Form 3800, any credit for prior-year minimum tax, or any credit claimed on Form 8912". [The modeled credits: child tax credit and credit for other dependents, dependent care, education, saver’s, the two Form 5695 credits, adoption and Schedule R. The foreign tax credit (line 10a) is not modeled.] ${LIMIT}`,
    otherCredits,
  ),
  rule(line("11"), "Form 3800 line 11 — net income tax", "Part II line 11", `Form 3800: "11 Net income tax. Subtract line 10c from line 9." ${LIMIT}`, max0(sub(L("9"), L("10c")))),
  rule(line("12"), "Form 3800 line 12 — net regular tax", "Part II line 12", `Form 3800: "12 Net regular tax. Subtract line 10c from line 7. If zero or less, enter -0-." ${LIMIT}`, max0(sub(L("7"), L("10c")))),
  rule(
    line("13"),
    "Form 3800 line 13 — 25% of net regular tax over $25,000 ($12,500 married filing separately)",
    "Part II line 13; § 38(c)(6)(A)",
    `Form 3800: "13 Enter 25% (0.25) of the excess, if any, of line 12 ... over $25,000." § 38(c)(6)(A): "In the case of a husband or wife who files a separate return, the amount specified under subparagraph (B) of paragraph (1) shall be $12,500 in lieu of $25,000. This subparagraph shall not apply if the spouse of the taxpayer has no business credit carryforward or carryback to, and has no current year business credit for, the taxable year of such spouse which ends within or with the taxpayer’s taxable year." [Asked of every married person filing separately with a business credit.]`,
    iff(isMfs, iff(fact("spouseHasBusinessCredit"), line13Of("1250000"), line13Of("2500000")), line13Of("2500000")),
  ),
  rule(
    line("16"),
    "Form 3800 line 16 — net income tax over the greater of line 13 or the tentative minimum tax",
    "Part II lines 14–16",
    `Form 3800: "14 Tentative minimum tax: Individuals. Enter the amount from Form 6251, line 9." "15 Enter the greater of line 13 or line 14." "16 Subtract line 15 from line 11. If zero or less, enter -0-." ${LIMIT}`,
    max0(sub(L("11"), max(L("13"), ruleRef(`${J}.amt.tentative_minimum_tax`)))),
  ),
  rule(line("17"), "Form 3800 line 17 — credit allowed after the § 38(c)(1) limitation", "Part II line 17", 'Form 3800: "17 Enter the smaller of line 6 or line 16. This is the amount of your credit allowed after the limitation of section 38(c)(1)."', min(L("6"), L("16"))),
  rule(
    line("29"),
    "Form 3800 line 29 — limit for specified credits (net income tax over line 13, less line 17)",
    "Part II Section C lines 27–29",
    'Form 3800: "27 Subtract line 13 from line 11. If zero or less, enter -0-"; "28 Add lines 17 and 26"; "29 Subtract line 28 from line 27. If zero or less, enter -0-." § 38(c)(4)(A): for specified credits "the tentative minimum tax shall be treated as being zero". [Line 26, the empowerment zone credit, is not modeled.]',
    max0(sub(max0(sub(L("11"), L("13"))), L("17"))),
  ),
  rule(
    line("36"),
    "Form 3800 line 36 — specified credits (nonpassive, allowed passive, carryforwards)",
    "Part II lines 30–36",
    'Form 3800: "30 Enter the general business credit from line 5 of Part III: combine column (e) with non-passive amounts in column (f)"; "32 Passive activity credits from line 5 of Part III"; "33 Enter the applicable passive activity credits allowed for 2025"; "34 Carryforward of business credit to 2025"; "36 Add lines 30, 33, 34, and 35."',
    add(fact("specifiedCreditNonpassive"), ruleRef(`${PC}.specified_allowed`), fact("specifiedCreditCarryforward")),
  ),
  rule(line("37"), "Form 3800 line 37 — specified credits allowed", "Part II line 37", 'Form 3800: "37 Enter the smaller of line 29 or line 36. This is the amount allowed for specified credits."', min(L("29"), L("36"))),
  rule(
    `${G}.allowed`,
    "General business credit allowed — Form 3800 line 38 → Schedule 3 line 6a",
    "Part II line 38; Schedule 3 line 6a",
    `Form 3800: "38 Credit allowed for the current year. Add lines 28 and 37. ... Individuals. Schedule 3 (Form 1040), line 6a." § 38(a): "There shall be allowed as a credit against the tax imposed by this chapter for the taxable year an amount equal to the sum of— (1) the business credit carryforwards carried to such taxable year, (2) the amount of the current year business credit, plus (3) the business credit carrybacks carried to such taxable year." ${LIMIT}`,
    // nothing to limit, nothing asked
    iff(cmp("eq", add(L("6"), L("36")), zero), zero, add(L("17"), L("37"))),
  ),
  rule(
    `${G}.unused`,
    "General business credit not allowed this year (§ 39 carryback one year, carryforward 20)",
    "§ 39(a); Form 3800 line 38 instructions",
    '§ 39(a)(1): "If the sum of the business credit carryforwards to the taxable year plus the amount of the current year business credit for the taxable year exceeds the amount of the limitation imposed by subsection (c) of section 38 for such taxable year ... such excess ... shall be a business credit carryback to the taxable year preceding the unused credit year, and ... a business credit carryforward to each of the 20 taxable years following the unused credit year". I3800 line 38: "If the sum of Part II, line 38 ... is smaller than the sum of Part I, lines 1, 3, and 4; and Part II, lines 30, 33, and 34 ..., see Carryback and Carryforward of Unused Credit". [Lines 6 + 36 less line 38. Carryforwards are used before current-year credits (§ 38(a)); tracking each credit’s year is the caller’s. Passive credits Form 8582-CR disallows are not here: they stay with their activity.]',
    sub(add(L("6"), L("36")), ruleRef(`${G}.allowed`)),
    "26 U.S.C. §§ 38(a), 39(a); Form 3800 (2025) and instructions",
  ),
];

export const generalBusinessCreditRules: Rule[] = rules;
