/**
 * Sales of business property — Form 4797 (2025), Parts I–III, and the
 * Unrecaptured Section 1250 Gain Worksheet (Schedule D line 19). Verified
 * November 2026.
 *
 * Sources (verbatim excerpts in each rule): 26 U.S.C. §§ 1231, 1245(a),
 * 1250(a)–(b), 1(h)(1)(E), (h)(6); Form 4797 (2025) and its instructions;
 * Instructions for Schedule D (2025); Pub. 544 (2025).
 *
 * Up to eight properties (businessProperties), each § 1245, § 1250 or other
 * § 1231 property. A property held 1 year or less is Part II (ordinary). Held
 * longer: a gain on § 1245 property is ordinary up to the depreciation, on
 * § 1250 property up to the additional depreciation (Part III), and the rest
 * is § 1231 gain; a loss is § 1231 loss. § 1231 items net (Part I, K-1
 * amounts included): a net loss is ordinary; a net gain is ordinary up to the
 * nonrecaptured losses of the 5 preceding years and long-term capital gain
 * beyond (Schedule D line 11). Part II's total is Schedule 1 line 4.
 *
 * Not modeled: §§ 1252, 1254, 1255, casualties and thefts (Form 4684),
 * installment sales (Form 6252), like-kind exchanges (Form 8824), Part IV
 * (§ 179 / § 280F recapture), the § 291 corporate amount, pre-1976 additional
 * depreciation (line 26d), low-income housing applicable percentages, § 1250
 * gain from partnership interests and non-Form-4797 dispositions (worksheet
 * lines 10 and 12) and 28% rate gain.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";
const F = `${J}.form4797`;
const N = 8;
const SLOTS = Array.from({ length: N }, (_, k) => k + 1);

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const int = (value: string): Expr => ({ kind: "int", value });
const enumV = (value: string): Expr => ({ kind: "enum", value });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const zero = money("0");
const FALSE: Expr = { kind: "bool", value: false };
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
const unsupported = (reason: string): Expr => ({ kind: "unsupported", reason });

const pf = (i: number, name: string): Expr => fact(`businessProperty${i}${name}`);
const active = (i: number): Expr => cmp("ge", fact("businessProperties"), int(String(i)));
const onSlot = (i: number, cond: Expr): Expr => iff(active(i), cond, FALSE);
const amt = (i: number, name: string): Expr => iff(active(i), pf(i, name), zero);
const kindIs = (i: number, k: string): Expr => onSlot(i, cmp("eq", pf(i, "Kind"), enumV(k)));
const longTerm = (i: number): Expr => onSlot(i, pf(i, "HeldOverOneYear"));

const p = (i: number, name: string): string => `${F}.property${i}.${name}`;
const P = (i: number, name: string): Expr => ruleRef(p(i, name));
const line = (n: string): string => `${F}.line${n}`;
const L = (n: string): Expr => ruleRef(line(n));

const URL = "https://www.irs.gov/forms-pubs/about-form-4797";
const SD_URL = "https://www.irs.gov/forms-pubs/about-schedule-d-form-1040";

function rule(id: string, title: string, section: string, excerpt: string, formula: Expr, extra: Partial<Rule> = {}, source = "26 U.S.C. §§ 1231, 1245, 1250; Form 4797 (2025) and instructions"): Rule {
  return {
    id,
    version: 1,
    jurisdiction: J,
    title,
    citation: { source, section, url: URL, excerpt },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula,
    ...extra,
  };
}

// --- per property ----------------------------------------------------------------

const GAIN_EXCERPT =
  'Form 4797 Part III: "20 Gross sales price"; "21 Cost or other basis plus expense of sale"; "22 Depreciation (or depletion) allowed or allowable"; "23 Adjusted basis. Subtract line 22 from line 21"; "24 Total gain. Subtract line 23 from line 20". Part I line 2 column (g): "Gain or (loss) Subtract (f) from the sum of (d) and (e)". I4797 chart: depreciable property held 1 year or less goes in Part II; held more than 1 year, a gain in Part III and a loss in Part I.';

const scopeChecks = (i: number, value: Expr): Expr =>
  iff(
    and(kindIs(i, "other"), gt0(amt(i, "Depreciation"))),
    unsupported(`business property ${i} is kind other but has depreciation: depreciable property is § 1245 or § 1250 property`),
    iff(
      or(
        and(not(kindIs(i, "section1250")), gt0(amt(i, "AdditionalDepreciation"))),
        cmp("gt", amt(i, "AdditionalDepreciation"), amt(i, "Depreciation")),
      ),
      unsupported(`business property ${i}: additional depreciation applies only to § 1250 property and cannot exceed the depreciation`),
      value,
    ),
  );

const propertyRules = (i: number): Rule[] => [
  rule(
    p(i, "gain"),
    `Business property ${i}: gain or (loss) — Form 4797 line 24 / line 2 column (g)`,
    "Lines 20–24; line 2 (d)–(g)",
    GAIN_EXCERPT,
    scopeChecks(i, sub(amt(i, "SalesPrice"), sub(amt(i, "CostBasis"), amt(i, "Depreciation")))),
  ),
  rule(
    p(i, "recapture"),
    `Business property ${i}: ordinary income from depreciation — Form 4797 line 25b (§ 1245) or 26g (§ 1250)`,
    "§ 1245(a)(1); § 1250(a)(1); lines 25–26",
    'Form 4797: "25 If section 1245 property: a Depreciation allowed or allowable from line 22; b Enter the smaller of line 24 or 25a"; "26 If section 1250 property: If straight line depreciation was used, enter -0- on line 26g ... a Additional depreciation after 1975 ... b Applicable percentage multiplied by the smaller of line 24 or line 26a". I4797 line 26a: "Additional depreciation is the excess of actual depreciation (including any special depreciation allowance ...) over depreciation figured using the straight line method." Line 26b: "Generally, use 100% as the percentage for this line." Pub. 544: the § 1245 ordinary income is "the lesser of ... The depreciation and amortization allowed or allowable on the property [or] The gain realized on the disposition". [Gains only, held more than 1 year. Pre-1976 additional depreciation (26c–26e), the low-income housing percentages and § 291 are not modeled.]',
    iff(
      and(longTerm(i), gt0(P(i, "gain"))),
      iff(
        kindIs(i, "section1245"),
        min(P(i, "gain"), amt(i, "Depreciation")),
        iff(kindIs(i, "section1250"), min(P(i, "gain"), amt(i, "AdditionalDepreciation")), zero),
      ),
      zero,
    ),
  ),
  rule(
    p(i, "section1231"),
    `Business property ${i}: § 1231 gain or (loss) — Form 4797 Part I (line 2, or line 6 through line 32)`,
    "§ 1231(a), (b); lines 2, 6, 32",
    'I4797 Part I: "Section 1231 transactions. ... Sales or exchanges of real or depreciable property used in a trade or business and held for more than 1 year." Form 4797 line 32: "Subtract line 31 from line 30. ... Enter the portion from other than casualty or theft on Form 4797, line 6". Pub. 544: "Any gain recognized that is more than the part that is ordinary income from depreciation is a section 1231 gain."',
    iff(longTerm(i), sub(P(i, "gain"), P(i, "recapture")), zero),
  ),
  rule(
    p(i, "short_term"),
    `Business property ${i}: ordinary gain or (loss) held 1 year or less — Form 4797 line 10`,
    "Line 10",
    'I4797 line 10: "Report on line 10 ordinary gains and losses, not included on lines 11 through 16, including gains and losses from property held 1 year or less." I4797 chart: depreciable trade or business property held 1 year or less, sold at a gain or a loss: "Part II".',
    iff(and(active(i), not(longTerm(i))), P(i, "gain"), zero),
  ),
  rule(
    p(i, "unrecaptured_1250"),
    `Business property ${i}: unrecaptured § 1250 gain — Unrecaptured Section 1250 Gain Worksheet lines 1–3`,
    "§ 1(h)(6); Schedule D worksheet lines 1–3",
    'Instructions for Schedule D, Unrecaptured Section 1250 Gain Worksheet: "1. If you have a section 1250 property in Part III of Form 4797 for which you made an entry in Part I of Form 4797 (but not on Form 6252), enter the smaller of line 22 or line 24 of Form 4797 for that property." "2. Enter the amount from Form 4797, line 26g, for the property". "3. Subtract line 2 from line 1." § 1(h)(6)(A): "unrecaptured section 1250 gain" is "the amount of long-term capital gain (not otherwise treated as ordinary income) which would be treated as ordinary income if section 1250(b)(1) included all depreciation and the applicable percentage under section 1250(a) were 100 percent".',
    iff(
      and(kindIs(i, "section1250"), longTerm(i), gt0(P(i, "gain"))),
      sub(min(amt(i, "Depreciation"), P(i, "gain")), P(i, "recapture")),
      zero,
    ),
  ),
];

// --- the form ------------------------------------------------------------------------

const sum = (name: string): Expr => add(...SLOTS.map((i) => P(i, name)));
const k1Net: Expr = sub(fact("k1Section1231Gain"), fact("k1Section1231Loss"));

const LINE7_8_9 =
  'Form 4797: "7 Combine lines 2 through 6. ... If line 7 is zero or a loss, enter the amount from line 7 on line 11 below and skip lines 8 and 9. If line 7 is a gain and you didn’t have any prior year section 1231 losses, or they were recaptured in an earlier year, enter the gain from line 7 as a long-term capital gain on the Schedule D". "8 Nonrecaptured net section 1231 losses from prior years." "9 Subtract line 8 from line 7. If zero or less, enter -0-. If line 9 is zero, enter the gain from line 7 on line 12 below. If line 9 is more than zero, enter the amount from line 8 on line 12 below and enter the gain from line 9 as a long-term capital gain on the Schedule D". I4797 line 7: "enter any amounts from your Schedule K-1 (Form 1120-S), box 9, or Schedule K-1 (Form 1065), box 10, in Part I". § 1231(a)(1)–(2), (c)(1): a net § 1231 gain is long-term capital gain, a net § 1231 loss is ordinary, and "the net section 1231 gain for any taxable year shall be treated as ordinary income to the extent such gain does not exceed the non-recaptured net section 1231 losses."';

const formRules: Rule[] = [
  rule(line("7"), "Form 4797 line 7 — net § 1231 gain or (loss) (Part I, K-1 amounts included)", "Part I lines 2–7", LINE7_8_9, add(sum("section1231"), k1Net)),
  rule(line("12"), "Form 4797 line 12 — net § 1231 gain treated as ordinary under the 5-year lookback (§ 1231(c))", "Lines 8, 9, 12", LINE7_8_9, iff(gt0(L("7")), min(L("7"), fact("section1231LookbackLosses")), zero)),
  rule(line("9"), "Form 4797 line 9 — net § 1231 gain to Schedule D line 11 as long-term capital gain", "Line 9; Schedule D line 11", LINE7_8_9, max0(sub(L("7"), L("12")))),
  rule(
    line("17"),
    "Form 4797 line 17 — ordinary gain or (loss), Part II (lines 10–13) → Schedule 1 line 4",
    "Part II lines 10–18b; Schedule 1 line 4",
    `Form 4797: "11 Loss, if any, from line 7"; "12 Gain, if any, from line 7 or amount from line 8, if applicable"; "13 Gain, if any, from line 31"; "17 Combine lines 10 through 16"; "18 ... b Redetermine the gain or (loss) on line 17 excluding the loss, if any, on line 18a. Enter here and on Schedule 1 (Form 1040), Part I, line 4". ${LINE7_8_9} [Lines 14–16 and 18a (Forms 4684, 6252, 8824) are not modeled.]`,
    add(sum("short_term"), iff(gt0(L("7")), zero, L("7")), L("12"), sum("recapture")),
  ),
  rule(
    `${F}.lookback_remaining`,
    "Nonrecaptured § 1231 losses left after this year (next year's Form 4797 line 8, before dropping years older than 5)",
    "§ 1231(c); line 8 instructions",
    'I4797 line 8 example: "the $4,000 loss from 2020 is all recaptured ($3,000 in 2024 and $1,000 in 2025), and you have $5,000 of section 1231 losses from 2021 left to recapture". [This year’s line 8 less what line 12 used, plus this year’s net § 1231 loss; the losses are used oldest first, so dropping those more than 5 years old is yours.]',
    add(sub(fact("section1231LookbackLosses"), L("12")), max0(neg(L("7")))),
  ),
  rule(
    `${J}.schedule_d.unrecaptured_1250`,
    "Unrecaptured § 1250 gain — Schedule D line 19 (Unrecaptured Section 1250 Gain Worksheet line 18)",
    "§ 1(h)(1)(E), (h)(6); Schedule D line 19",
    'Unrecaptured Section 1250 Gain Worksheet: "5. Enter the total of any amounts reported to you on a Schedule K-1 from a partnership or an S corporation as “unrecaptured section 1250 gain”"; "6. Add lines 3 through 5"; "7. Enter the smaller of line 6 or the gain from Form 4797, line 7"; "8. Enter the amount, if any, from Form 4797, line 8"; "9. Subtract line 8 from line 7"; "11. Enter the total of any amounts reported to you as “unrecaptured section 1250 gain” on a Schedule K-1, Form 1099-DIV, or Form 2439 from an estate, a trust, a real estate investment trust, or a mutual fund"; "13. Add lines 9 through 12"; "15. Enter the (loss), if any, from Schedule D, line 7"; "16. Enter your long-term capital loss carryovers from Schedule D, line 14"; "17. Combine lines 14 through 16. If the result is a (loss), enter it as a positive amount"; "18. Unrecaptured section 1250 gain. Subtract line 17 from line 13. If zero or less, enter -0-." [Lines 4, 10, 12 and 14 (installment sales, partnership interests, other dispositions, 28% rate gain) are not modeled.]',
    (() => {
      const line7ws = min(add(sum("unrecaptured_1250"), fact("k1UnrecapturedSection1250Gain")), max0(L("7")));
      const line9ws = iff(gt0(L("7")), max0(sub(line7ws, fact("section1231LookbackLosses"))), zero);
      const line13 = add(line9ws, fact("unrecapturedSection1250GainDistributions"));
      const line17 = max0(neg(add(min(ruleRef(`${J}.schedule_d.net_short_term`), zero), neg(fact("priorYearLongTermCapitalLossCarryover")))));
      return max0(sub(line13, line17));
    })(),
    {},
    "26 U.S.C. § 1(h)(1)(E), (h)(6); Instructions for Schedule D (2025)",
  ),
  rule(
    `${F}.present`,
    "Form 4797 has any amount (a property, a K-1 § 1231 item or a lookback loss in use)",
    "Form 4797",
    "[A flag for the rules that refuse a Form 4797 item they don’t model: $1 when any property is entered or a K-1 § 1231 amount is given, $0 otherwise.]",
    iff(or(cmp("gt", fact("businessProperties"), int("0")), gt0(fact("k1Section1231Gain")), gt0(fact("k1Section1231Loss"))), money("100"), zero),
  ),
];

// --- where the results go ------------------------------------------------------------

const ordinaryOf = (i: number): Expr => add(P(i, "short_term"), P(i, "recapture"), iff(gt0(L("7")), zero, P(i, "section1231")));

const flowRules: Rule[] = [
  rule(
    `${F}.qbi_net`,
    "Form 4797 ordinary gains and losses of properties used in qualified trades or businesses (§ 199A)",
    "§ 199A(c)(3)(B)(i); Reg. § 1.199A-3(b)(2)(ii)(A)",
    'Reg. § 1.199A-3(b)(2)(ii)(A): QBI excludes "Any item of short-term capital gain, short-term capital loss, long-term capital gain, or long-term capital loss, including any item treated as one of such items under any other provision of the Code". [A property’s ordinary result — sold within a year, recapture, or its § 1231 amount when § 1231 nets to a loss — is QBI when the property was used in a qualified trade or business (businessPropertyNQbi). § 1231(c) lookback income alongside such a property is refused: how it is attributed among properties is not settled. K-1 § 1231 items are not added: Statement A reports the K-1’s QBI.]',
    add(
      ...SLOTS.map((i) =>
        iff(
          onSlot(i, cmp("ne", ordinaryOf(i), zero)),
          iff(
            pf(i, "Qbi"),
            iff(
              and(gt0(L("12")), cmp("ne", P(i, "section1231"), zero)),
              unsupported(`business property ${i} is QBI property and part of the net § 1231 gain is ordinary under the § 1231(c) lookback: attributing that income among properties is not modeled`),
              ordinaryOf(i),
            ),
            zero,
          ),
          zero,
        ),
      ),
    ),
    {},
    "26 U.S.C. § 199A; Reg. § 1.199A-3(b)(2)(ii)(A)",
  ),
  rule(
    `${F}.niit_excluded`,
    "Form 4797 gains and losses that aren't net investment income — Form 8960 line 5b",
    "§ 1411(c)(1)(A)(iii); Form 8960 line 5b",
    'I8960 line 5b: "Net Gain or Loss From Disposition of Property That Isn’t Subject to Net Investment Income Tax". § 1411(c)(1)(A)(iii): net investment income includes "net gain (to the extent taken into account in computing taxable income) attributable to the disposition of property other than property held in a trade or business not described in paragraph (2)". [Each property marked not net investment income (businessPropertyNNetInvestmentIncome false) leaves out its whole gain or loss, and the K-1 § 1231 amount when k1Section1231NetInvestmentIncome is false. A § 1231 gain partly absorbed by Schedule D losses is refused: how much of it is in taxable income is not split by property.]',
    (() => {
      const props = add(...SLOTS.map((i) => iff(onSlot(i, cmp("ne", P(i, "gain"), zero)), iff(pf(i, "NetInvestmentIncome"), zero, P(i, "gain")), zero)));
      const k1 = iff(cmp("ne", k1Net, zero), iff(fact("k1Section1231NetInvestmentIncome"), zero, k1Net), zero);
      return iff(
        and(gt0(L("9")), cmp("lt", ruleRef(`${J}.schedule_d.preferential_lt_gain`), L("9"))),
        unsupported("the net § 1231 gain is partly absorbed by capital losses on Schedule D: which property's gain is left in taxable income for Form 8960 line 5b is not modeled"),
        add(props, k1),
      );
    })(),
    {},
    "26 U.S.C. § 1411(c)(1)(A)(iii); Instructions for Form 8960 (2025)",
  ),
];

export const form4797Rules: Rule[] = [...SLOTS.flatMap(propertyRules), ...formRules, ...flowRules];
