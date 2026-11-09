/**
 * Installment sales — Form 6252 (2026, the instructions printed on the form),
 * § 453. Verified November 2026.
 *
 * Sources (verbatim excerpts in each rule): 26 U.S.C. §§ 453(a)–(c), (e), (f),
 * (g), (i), 453A; Form 6252 and its instructions; Pub. 537 (2025); the
 * Unrecaptured Section 1250 Gain Worksheet in the Instructions for Schedule D
 * (2025).
 *
 * Up to four sales (installmentSales). Each year of the agreement the sale's
 * Part I amounts give the gross profit (line 16) and the contract price
 * (line 18); the year's payments times the gross profit percentage are the
 * installment sale income (line 24). In the year of sale the § 1245 and
 * § 1250 recapture is taxed in full (§ 453(i), Form 4797 line 13) and the
 * mortgage in excess of basis is a payment (line 20). A related party's second
 * disposition is a payment (Part III, § 453(e)). The income goes to Schedule D
 * (capital assets), Form 4797 line 4 (§ 1231 property held more than 1 year)
 * or line 10 (held 1 year or less); its unrecaptured § 1250 gain is reported
 * first (worksheet line 4).
 *
 * Not modeled (refused or out of the inputs): a sale at a loss, dealer sales,
 * publicly traded stock, contingent payment sales, a reduced selling price
 * (Pub. 537 Worksheet B), §§ 1252, 1254 and 1255 recapture (line 25), § 453(g)
 * sales of depreciable property to a related person, § 453A interest on
 * deferred tax, § 453B dispositions of the obligation, repossessions, a
 * like-kind exchange with an installment obligation (§ 453(f)(6)), and
 * depreciated capital assets (worksheet line 12). § 453(g) (property depreciable
 * in the buyer's hands sold to a § 453(g)(3) related person — a controlled
 * entity or trust, not a family member) is asked on related-party sales.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";
const F = `${J}.form6252`;
const N = 4;
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
const mulInt = (base: Expr, count: Expr): Expr => ({ kind: "mulInt", base, count });
const mulDiv = (a: Expr, b: Expr, c: Expr): Expr => ({ kind: "mulDiv", a, b, c, round: "half-up" });
const cmp = (op: "lt" | "le" | "gt" | "ge" | "eq" | "ne", left: Expr, right: Expr): Expr => ({ kind: "cmp", op, left, right });
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const and = (...args: Expr[]): Expr => ({ kind: "and", args });
const or = (...args: Expr[]): Expr => ({ kind: "or", args });
const not = (arg: Expr): Expr => ({ kind: "not", arg });
const gt0 = (e: Expr): Expr => cmp("gt", e, zero);
const unsupported = (reason: string): Expr => ({ kind: "unsupported", reason });

const sf = (i: number, name: string): Expr => fact(`installmentSale${i}${name}`);
const active = (i: number): Expr => cmp("ge", fact("installmentSales"), int(String(i)));
const onSlot = (i: number, cond: Expr): Expr => iff(active(i), cond, FALSE);
const amt = (i: number, name: string): Expr => iff(active(i), sf(i, name), zero);
const kindIs = (i: number, k: string): Expr => onSlot(i, cmp("eq", sf(i, "Kind"), enumV(k)));
const business = (i: number): Expr => onSlot(i, cmp("ne", sf(i, "Kind"), enumV("capital")));
const longTerm = (i: number): Expr => onSlot(i, sf(i, "HeldOverOneYear"));
const yearOfSale = (i: number): Expr => onSlot(i, sf(i, "YearOfSale"));
const bpsGiven = (i: number): Expr => onSlot(i, cmp("gt", sf(i, "GrossProfitPercentageBps"), int("0")));

const s = (i: number, name: string): string => `${F}.sale${i}.${name}`;
const S = (i: number, name: string): Expr => ruleRef(s(i, name));

const URL = "https://www.irs.gov/forms-pubs/about-form-6252";

export const form6252RuleId = {
  capitalShortTerm: `${F}.capital_short_term`,
  capitalLongTerm: `${F}.capital_long_term`,
  section1231: `${F}.section1231`,
  ordinary: `${F}.ordinary`,
  recapture: `${F}.recapture`,
  unrecaptured1250: `${F}.unrecaptured_1250`,
  present: `${F}.present`,
  sale: (i: number, name: string) => s(i, name),
};

function rule(id: string, title: string, section: string, excerpt: string, formula: Expr, extra: Partial<Rule> = {}, source = "26 U.S.C. §§ 453, 453A; Form 6252 (2026) and its instructions; Pub. 537 (2025)"): Rule {
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

// --- per sale: Part I ------------------------------------------------------------

/** gain on the sale before recapture (Form 4797 Part III line 24): price − (basis − depreciation) − expenses */
const totalGain = (i: number): Expr => sub(amt(i, "SellingPrice"), add(sub(amt(i, "CostBasis"), amt(i, "Depreciation")), amt(i, "SellingExpenses")));

/** the year's payments, the line 20 excess included, times line 19 */
const gpApply = (i: number, payments: Expr): Expr =>
  iff(
    bpsGiven(i),
    mulDiv(mulInt(payments, sf(i, "GrossProfitPercentageBps")), money("1"), money("10000")),
    mulDiv(payments, S(i, "line16"), S(i, "line18")),
  );

// a slot past installmentSales has no sale: $0, and nothing is asked or divided
const scopeChecks = (i: number, value: Expr): Expr =>
  iff(active(i), saleChecks(i, value), zero);

const saleChecks = (i: number, value: Expr): Expr =>
  iff(
    and(or(kindIs(i, "capital"), kindIs(i, "other")), gt0(amt(i, "Depreciation"))),
    unsupported(`installment sale ${i} has depreciation but is kind capital or other: depreciable business property is section1245 or section1250, and the unrecaptured § 1250 gain of depreciated investment property (Schedule D worksheet line 12) is not modeled`),
    iff(
      and(gt0(amt(i, "AdditionalDepreciation")), or(not(kindIs(i, "section1250")), cmp("gt", amt(i, "AdditionalDepreciation"), amt(i, "Depreciation")))),
      unsupported(`installment sale ${i}: additional depreciation applies only to § 1250 property and cannot exceed the depreciation`),
      iff(
        and(gt0(amt(i, "ExcludedGain")), not(kindIs(i, "capital"))),
        unsupported(`installment sale ${i}: a § 121 main-home exclusion (line 15) applies only to a capital asset — a home used partly for business is two sales`),
        iff(
          iff(sf(i, "RelatedParty"), sf(i, "DepreciableToControlledBuyer"), FALSE),
          unsupported(`installment sale ${i} is property depreciable in the buyer's hands sold to a § 453(g)(3) related person (a controlled entity or trust): § 453(g) denies the installment method (all payments are treated as received in the year of sale) unless the IRS agrees there was no tax-avoidance purpose — report it as a sale`),
          iff(
            cmp("le", S(i, "line14"), zero),
            unsupported(`installment sale ${i} is not at a gain (Form 6252 line 14 is zero or less): a loss can't use the installment method — report the sale in the Form 4797 or capital loss facts`),
            iff(
              cmp("gt", amt(i, "ExcludedGain"), S(i, "line14")),
              unsupported(`installment sale ${i}: the § 121 exclusion is more than the gain on line 14`),
              iff(
                iff(cmp("gt", amt(i, "SellingPrice"), money("15000000")), fact("installmentSaleSection453AInterest"), FALSE),
                unsupported("§ 453A interest on deferred tax applies (installment obligations over $5 million): the interest and its reporting (Pub. 537) are not modeled"),
                iff(
                  and(yearOfSale(i), gt0(amt(i, "PaymentsPriorYears"))),
                  unsupported(`installment sale ${i}: payments received in prior years (line 23) can't be entered in the year of sale`),
                  iff(
                    and(not(bpsGiven(i)), cmp("gt", add(S(i, "line20"), amt(i, "PaymentsThisYear"), amt(i, "PaymentsPriorYears")), S(i, "line18"))),
                    unsupported(`installment sale ${i}: the payments (lines 20, 21 and 23) are more than the contract price on line 18 — check the amounts, or a reduced selling price (Pub. 537 Worksheet B), which is not modeled`),
                    value,
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    ),
  );

const PART_I =
  'Form 6252 Part I: "5 Selling price including mortgages and other debts. Don’t include interest, whether stated or unstated"; "6 Mortgages, debts, and other liabilities the buyer assumed or took the property subject to"; "7 Subtract line 6 from line 5"; "8 Cost or other basis of property sold"; "9 Depreciation allowed or allowable"; "10 Adjusted basis. Subtract line 9 from line 8"; "11 Commissions and other expenses of sale"; "12 Income recapture from Form 4797, Part III"; "13 Add lines 10, 11, and 12"; "14 Subtract line 13 from line 5. If zero or less, don’t complete the rest of this form"; "15 If the property described on line 1 above was your main home, enter the amount of your excluded gain"; "16 Gross profit. Subtract line 15 from line 14"; "17 Subtract line 13 from line 6. If zero or less, enter -0-"; "18 Contract price. Add line 7 and line 17." "Complete this part for all years of the installment agreement."';

const saleRules = (i: number): Rule[] => [
  rule(
    s(i, "recapture_income"),
    `Installment sale ${i}: § 1245 / § 1250 recapture income — Form 6252 line 12 (Form 4797 Part III line 31)`,
    "§ 453(i); Form 6252 line 12; § 1245(a)(1); § 1250(a)(1), (b)(1)",
    'Form 6252 line 12 instructions: "Any ordinary income recapture under section 1245 or 1250 (including sections 179 and 291) is fully taxable in the year of sale even if no payments were received. To figure the recapture amount, complete Form 4797, Part III. The ordinary income recapture is the amount on line 31 of Form 4797. Enter it on line 12 of Form 6252 and also on line 13 of Form 4797." § 453(i)(1): "any recapture income shall be recognized in the year of the disposition". Form 4797 lines 25b and 26b: the smaller of the gain (line 24) and the depreciation (§ 1245) or the additional depreciation (§ 1250). Pub. 544: "If you hold section 1250 property for 1 year or less, all the depreciation is additional depreciation." [The amount is the same every year of the agreement (line 12 of each year’s Part I); it is taxed only in the year of sale (us.federal.form6252.recapture).]',
    iff(
      gt0(totalGain(i)),
      iff(
        kindIs(i, "section1245"),
        min(totalGain(i), amt(i, "Depreciation")),
        iff(
          kindIs(i, "section1250"),
          min(totalGain(i), iff(longTerm(i), amt(i, "AdditionalDepreciation"), amt(i, "Depreciation"))),
          zero,
        ),
      ),
      zero,
    ),
  ),
  rule(
    s(i, "line14"),
    `Installment sale ${i}: Form 6252 line 14 — selling price less installment sale basis (lines 10–13)`,
    "Form 6252 lines 5–14",
    PART_I,
    sub(amt(i, "SellingPrice"), add(sub(amt(i, "CostBasis"), amt(i, "Depreciation")), amt(i, "SellingExpenses"), S(i, "recapture_income"))),
  ),
  rule(s(i, "line16"), `Installment sale ${i}: Form 6252 line 16 — gross profit`, "Form 6252 lines 15–16", PART_I, sub(S(i, "line14"), amt(i, "ExcludedGain"))),
  rule(
    s(i, "line17"),
    `Installment sale ${i}: Form 6252 line 17 — mortgages assumed in excess of the installment sale basis`,
    "Form 6252 line 17",
    `${PART_I} Pub. 537: "If the buyer assumes a mortgage that’s more than your installment sale basis in the property, you recover your entire basis. The part of the mortgage greater than your basis is treated as a payment received in the year of sale."`,
    max0(sub(amt(i, "MortgagesAssumed"), add(sub(amt(i, "CostBasis"), amt(i, "Depreciation")), amt(i, "SellingExpenses"), S(i, "recapture_income")))),
  ),
  rule(
    s(i, "line18"),
    `Installment sale ${i}: Form 6252 line 18 — contract price`,
    "Form 6252 lines 7, 17, 18",
    PART_I,
    add(sub(amt(i, "SellingPrice"), amt(i, "MortgagesAssumed")), S(i, "line17")),
  ),
  rule(
    s(i, "line20"),
    `Installment sale ${i}: Form 6252 line 20 — line 17 in the year of sale`,
    "Form 6252 line 20",
    'Form 6252: "20 If this is the year of sale, enter the amount from line 17. Otherwise, enter -0-".',
    iff(yearOfSale(i), S(i, "line17"), zero),
  ),
  rule(
    s(i, "line24"),
    `Installment sale ${i}: Form 6252 line 24 — installment sale income (line 22 × line 19)`,
    "§ 453(c); Form 6252 lines 19–24",
    'Form 6252: "19 Gross profit percentage (expressed as a decimal amount). Divide line 16 by line 18. (For years after the year of sale, see instructions.)"; "21 Payments received during year"; "22 Add lines 20 and 21"; "23 Payments received in prior years"; "24 Installment sale income. Multiply line 22 by line 19. This amount cannot be less than zero." Line 19 instructions: "Enter the gross profit percentage determined for the year of sale even if you didn’t file Form 6252 for that year. Enter it as a decimal rounded to at least 4 digits". § 453(c): "the income recognized for any taxable year from a disposition is that proportion of the payments received in that year which the gross profit (realized or to be realized when payment is completed) bears to the total contract price." [Line 19 is line 16 ÷ line 18 exactly, or the percentage given in installmentSaleNGrossProfitPercentageBps; line 25 (§§ 1252, 1254, 1255 and pre-June 7, 1984 recapture) is not modeled, so line 26 is line 24.]',
    scopeChecks(i, max0(gpApply(i, add(S(i, "line20"), amt(i, "PaymentsThisYear"))))),
  ),
  rule(
    s(i, "line35"),
    `Installment sale ${i}: Form 6252 line 35 — related party second disposition treated as a payment (Part III)`,
    "§ 453(e); Form 6252 Part III lines 28–37",
    'Form 6252 Part III: "28 Did the related party resell or dispose of the property (“second disposition”) during this tax year?"; "30 Selling price of property sold by related party"; "31 Enter contract price from line 18 for year of first sale"; "32 Enter the smaller of line 30 or line 31"; "33 Total payments received by the end of this tax year"; "34 Subtract line 33 from line 32. If zero or less, enter -0-"; "35 Multiply line 34 by the gross profit percentage on line 19 for year of first sale". Line 33: "Enter the sum of lines 22 and 23 from Part II." § 453(e)(1): "the amount realized with respect to such second disposition shall be treated as received at the time of the second disposition by the person making the first disposition." Pub. 537 Example 1: "Lesser of: 1) Amount realized on second disposition, or 2) Contract price on first disposition ... $500,000 Subtract: Sum of payments from Adrian in 2024 and 2025 ... − 200,000 Amount treated as received because of second disposition ... $300,000". [Asked only when the sale was to a related party; installmentSaleNSecondDisposition already excludes the line 29 exceptions. Line 36 is not modeled, so line 37 is line 35.]',
    iff(
      onSlot(i, iff(sf(i, "RelatedParty"), sf(i, "SecondDisposition"), FALSE)),
      scopeChecks(
        i,
        max0(gpApply(i, max0(sub(min(sf(i, "RelatedPartyAmountRealized"), S(i, "line18")), add(S(i, "line20"), amt(i, "PaymentsThisYear"), amt(i, "PaymentsPriorYears")))))),
      ),
      zero,
    ),
  ),
  rule(
    s(i, "income"),
    `Installment sale ${i}: installment sale income this year — Form 6252 line 26 plus line 37`,
    "Form 6252 lines 26 and 37",
    'Form 6252: "26 Subtract line 25 from line 24. Enter here and on Schedule D or Form 4797"; "37 Subtract line 36 from line 35. Enter here and on Schedule D or Form 4797".',
    add(S(i, "line24"), S(i, "line35")),
  ),
  rule(
    s(i, "ordinary"),
    `Installment sale ${i}: ordinary income this year on business property — Form 4797 line 10 (held 1 year or less) and line 13 (recapture in the year of sale)`,
    "§ 453(i); Form 4797 lines 10 and 13",
    'Form 6252 line 26 instructions: "If the property was held 1 year or less or you have an ordinary gain from the sale of a noncapital asset ... enter this amount on Form 4797, line 10". Line 12 instructions: the recapture "is fully taxable in the year of sale even if no payments were received ... Enter it on line 12 of Form 6252 and also on line 13 of Form 4797."',
    iff(
      business(i),
      add(iff(longTerm(i), zero, S(i, "income")), iff(yearOfSale(i), scopeChecks(i, S(i, "recapture_income")), zero)),
      zero,
    ),
  ),
  rule(
    s(i, "section1231"),
    `Installment sale ${i}: § 1231 gain this year on business property held more than 1 year — Form 4797 line 4`,
    "§ 1231; Form 4797 line 4",
    'Form 6252 line 26 instructions: "For trade or business property held more than 1 year, enter this amount on Form 4797, line 4."',
    iff(and(business(i), longTerm(i)), S(i, "income"), zero),
  ),
  rule(
    s(i, "unrecaptured_1250"),
    `Installment sale ${i}: unrecaptured § 1250 gain in this year's installment income (Unrecaptured Section 1250 Gain Worksheet line 4)`,
    "§ 1(h)(6); Reg. § 1.453-12; Schedule D worksheet line 4",
    'Instructions for Schedule D, line 4: "Step 1. Figure the smaller of (a) the depreciation allowed or allowable, or (b) the total gain for the sale. This is the smaller of line 22 or line 24 of your 2025 Form 4797 (or the comparable lines of Form 4797 for the year of sale) for the property. Step 2. Reduce the amount figured in Step 1 by any section 1250 ordinary income recapture for the sale. ... The result is your total unrecaptured section 1250 gain that must be allocated to the installment payments received from the sale. Step 3. Generally, the entire amount of gain from the sale of trade or business property included in each installment payment is treated as unrecaptured section 1250 gain until the total unrecaptured section 1250 gain figured in Step 2 has been used in full. Figure the amount of gain treated as unrecaptured section 1250 gain for installment payments received in 2025 as the smaller of (a) the amount from line 26 or line 37 of your 2025 Form 6252, whichever applies; or (b) the amount of unrecaptured section 1250 gain remaining to be reported. This amount is generally the total unrecaptured section 1250 gain for the sale reduced by all gain reported in prior years (excluding section 1250 ordinary income recapture)." [Gain reported in prior years is line 23 times line 19.]',
    iff(
      and(kindIs(i, "section1250"), longTerm(i), gt0(S(i, "income"))),
      min(S(i, "income"), S(i, "unrecaptured_1250_start")),
      zero,
    ),
  ),
  rule(
    s(i, "unrecaptured_1250_start"),
    `Installment sale ${i}: unrecaptured § 1250 gain remaining to be reported at the start of the year`,
    "§ 1(h)(6); Schedule D worksheet line 4, Steps 1–3",
    'Instructions for Schedule D, line 4, Step 3: "the amount of unrecaptured section 1250 gain remaining to be reported. This amount is generally the total unrecaptured section 1250 gain for the sale reduced by all gain reported in prior years (excluding section 1250 ordinary income recapture)."',
    iff(
      and(kindIs(i, "section1250"), longTerm(i)),
      scopeChecks(i, max0(sub(sub(min(amt(i, "Depreciation"), max0(totalGain(i))), S(i, "recapture_income")), max0(gpApply(i, amt(i, "PaymentsPriorYears")))))),
      zero,
    ),
  ),
  rule(
    s(i, "unrecaptured_1250_remaining"),
    `Installment sale ${i}: unrecaptured § 1250 gain left to report after this year`,
    "§ 1(h)(6); Schedule D worksheet line 4, Step 3",
    'Instructions for Schedule D, line 4, Step 3: "the entire amount of gain ... included in each installment payment is treated as unrecaptured section 1250 gain until the total unrecaptured section 1250 gain figured in Step 2 has been used in full."',
    sub(S(i, "unrecaptured_1250_start"), S(i, "unrecaptured_1250")),
  ),
];

// --- where the income goes ----------------------------------------------------------

const sumWhere = (pick: (i: number) => Expr, value: (i: number) => Expr): Expr =>
  add(...SLOTS.map((i) => iff(pick(i), value(i), zero)));
const income = (i: number): Expr => S(i, "income");

const ROUTING =
  'Form 6252 line 26 instructions: "For trade or business property held more than 1 year, enter this amount on Form 4797, line 4. If the property was held 1 year or less or you have an ordinary gain from the sale of a noncapital asset (even if the holding period is more than 1 year), enter this amount on Form 4797, line 10, and enter “From Form 6252.” ... For capital assets, enter this amount on Schedule D as a short- or long-term gain on the lines identified as from Form 6252." Schedule D (2025): "4 Short-term gain from Form 6252"; "11 Gain from Form 4797, Part I; long-term gain from Forms 2439 and 6252". Form 4797 (2025): "4 Section 1231 gain from installment sales from Form 6252, line 26 or 37"; "15 Ordinary gain from installment sales from Form 6252, line 25 or 36". [Form 4797 (2026 draft): lines 4, 11 and 14.]';

const routeRules: Rule[] = [
  rule(form6252RuleId.capitalShortTerm, "Form 6252 short-term gain on capital assets → Schedule D line 4", "Schedule D line 4", ROUTING, sumWhere((i) => and(kindIs(i, "capital"), not(longTerm(i))), income)),
  rule(form6252RuleId.capitalLongTerm, "Form 6252 long-term gain on capital assets → Schedule D line 11", "Schedule D line 11", ROUTING, sumWhere((i) => and(kindIs(i, "capital"), longTerm(i)), income)),
  rule(form6252RuleId.section1231, "Form 6252 § 1231 gain on business property held more than 1 year → Form 4797 line 4", "Form 4797 line 4", ROUTING, add(...SLOTS.map((i) => S(i, "section1231")))),
  rule(form6252RuleId.ordinary, "Form 6252 ordinary gain on business property held 1 year or less → Form 4797 line 10 (2026: line 11)", "Form 4797 line 10", ROUTING, sumWhere((i) => and(business(i), not(longTerm(i))), income)),
  rule(
    form6252RuleId.recapture,
    "Form 6252 recapture income taxed in the year of sale → Form 4797 line 13 (2026: line 14)",
    "§ 453(i); Form 4797 lines 13 and 31",
    'Form 6252 line 12 instructions: "Any ordinary income recapture under section 1245 or 1250 ... is fully taxable in the year of sale even if no payments were received. ... Enter it on line 12 of Form 6252 and also on line 13 of Form 4797." Pub. 537: "you must report any depreciation recapture income in the year of sale, whether or not an installment payment was received that year."',
    sumWhere((i) => yearOfSale(i), (i) => scopeChecks(i, S(i, "recapture_income"))),
  ),
  rule(
    form6252RuleId.unrecaptured1250,
    "Form 6252 unrecaptured § 1250 gain — Unrecaptured Section 1250 Gain Worksheet line 4",
    "§ 1(h)(6); Schedule D worksheet line 4",
    'Unrecaptured Section 1250 Gain Worksheet: "4. Enter the total unrecaptured section 1250 gain included on line 26 or line 37 of Form(s) 6252 from installment sales of trade or business property held more than 1 year."',
    add(...SLOTS.map((i) => S(i, "unrecaptured_1250"))),
  ),
  rule(
    form6252RuleId.present,
    "Form 6252 has a sale",
    "Form 6252",
    "[A flag for the rules that refuse an installment sale they don’t model: $1 when installmentSales > 0.]",
    iff(cmp("gt", fact("installmentSales"), int("0")), money("100"), zero),
  ),
];

export const form6252Rules: Rule[] = [...SLOTS.flatMap(saleRules), ...routeRules];
