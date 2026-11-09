/**
 * Like-kind exchanges of real property — Form 8824 (2026) Part III and the
 * 2025 instructions, § 1031. Verified November 2026.
 *
 * Sources (verbatim excerpts in each rule): 26 U.S.C. §§ 1031(a)–(d), (f),
 * 1245(b)(4), 1250(d)(4), 1(h)(6); Reg. § 1.1031(d)-2; Form 8824 and the
 * Instructions for Form 8824 (2025); Pub. 544 (2025).
 *
 * Up to four exchanges made this year (likeKindExchanges). The realized gain
 * (line 19) is recognized to the extent of cash, other property and net
 * liabilities received (line 20); the § 1245 recapture is limited by
 * § 1245(b)(4) and the § 1250 recapture by § 1250(d)(4) (line 21); the rest
 * (line 22) is Schedule D (investment property) or Form 4797 § 1231 gain
 * (business property held more than 1 year); the deferred gain is line 24 and
 * the basis of the property received line 25 (25a / 25b by FMV). The
 * recognized § 1231 gain is unrecaptured § 1250 gain up to the § 1250
 * property's depreciation less its recapture (§ 1(h)(6)(A)).
 *
 * Not modeled (refused or out of the inputs): a related-party disposition
 * within 2 years (Part II), gain recognized on property depreciable to a
 * § 1239 related person (ordinary under § 1239(a)), exchanges of property used as a home (§ 121 with
 * § 1031), an installment obligation received (§ 453(f)(6)), multi-asset
 * exchanges with other like-kind groups, §§ 1252, 1254 and 1255 property,
 * depreciated investment property, Part IV (§ 1043 conflict-of-interest
 * sales), and the gain or loss on other property given up (line 14), which is
 * entered as its own sale.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";
const F = `${J}.form8824`;
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
const max = (...args: Expr[]): Expr => ({ kind: "max", args });
const mulDiv = (a: Expr, b: Expr, c: Expr): Expr => ({ kind: "mulDiv", a, b, c, round: "half-up" });
const cmp = (op: "lt" | "le" | "gt" | "ge" | "eq" | "ne", left: Expr, right: Expr): Expr => ({ kind: "cmp", op, left, right });
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const and = (...args: Expr[]): Expr => ({ kind: "and", args });
const or = (...args: Expr[]): Expr => ({ kind: "or", args });
const not = (arg: Expr): Expr => ({ kind: "not", arg });
const gt0 = (e: Expr): Expr => cmp("gt", e, zero);
const unsupported = (reason: string): Expr => ({ kind: "unsupported", reason });

const xf = (i: number, name: string): Expr => fact(`likeKindExchange${i}${name}`);
const active = (i: number): Expr => cmp("ge", fact("likeKindExchanges"), int(String(i)));
const onSlot = (i: number, cond: Expr): Expr => iff(active(i), cond, FALSE);
const amt = (i: number, name: string): Expr => iff(active(i), xf(i, name), zero);
const kindIs = (i: number, k: string): Expr => onSlot(i, cmp("eq", xf(i, "Kind"), enumV(k)));
const business = (i: number): Expr => onSlot(i, cmp("ne", xf(i, "Kind"), enumV("capital")));
const longTerm = (i: number): Expr => onSlot(i, xf(i, "HeldOverOneYear"));

const x = (i: number, name: string): string => `${F}.exchange${i}.${name}`;
const X = (i: number, name: string): Expr => ruleRef(x(i, name));

const URL = "https://www.irs.gov/forms-pubs/about-form-8824";

export const form8824RuleId = {
  capitalShortTerm: `${F}.capital_short_term`,
  capitalLongTerm: `${F}.capital_long_term`,
  section1231: `${F}.section1231`,
  ordinary: `${F}.ordinary`,
  unrecaptured1250: `${F}.unrecaptured_1250`,
  present: `${F}.present`,
  exchange: (i: number, name: string) => x(i, name),
};

function rule(id: string, title: string, section: string, excerpt: string, formula: Expr, extra: Partial<Rule> = {}, source = "26 U.S.C. § 1031; Form 8824 (2026); Instructions for Form 8824 (2025)"): Rule {
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

const scopeChecks = (i: number, value: Expr): Expr =>
  iff(
    and(active(i), not(gt0(xf(i, "LikeKindReceivedFmv")))),
    unsupported(`like-kind exchange ${i} has no like-kind property received (line 16): without it there is no exchange — report the disposition as a sale`),
    iff(
      and(not(kindIs(i, "section1250")), or(gt0(amt(i, "Section1250Depreciation")), gt0(amt(i, "Section1250AdditionalDepreciation")), gt0(amt(i, "Section1245Depreciation")))),
      unsupported(`like-kind exchange ${i} has depreciation but is kind capital or other: depreciated business real property is section1250, and depreciated investment property (Schedule D worksheet line 12) is not modeled`),
      iff(
        cmp("gt", amt(i, "Section1250AdditionalDepreciation"), amt(i, "Section1250Depreciation")),
        unsupported(`like-kind exchange ${i}: the additional depreciation can't be more than the depreciation on the § 1250 property`),
        iff(
          onSlot(i, iff(xf(i, "RelatedParty"), xf(i, "RelatedPartyDisposition"), FALSE)),
          unsupported(`like-kind exchange ${i}: a related party disposition within 2 years with no Form 8824 line 11 exception makes the exchange taxable as a sale (§ 1031(f)) — report it as a sale`),
          value,
        ),
      ),
    ),
  );

/** § 1239: gain recognized on property depreciable to a controlled transferee is ordinary — refused */
const s1239 = (i: number, value: Expr): Expr =>
  iff(
    gt0(X(i, "line23")),
    iff(
      iff(xf(i, "RelatedParty"), xf(i, "DepreciableToControlledParty"), FALSE),
      unsupported(`like-kind exchange ${i}: gain recognized on property depreciable in the hands of a § 1239 related person (a controlled entity or trust) is ordinary income (§ 1239(a)) — not modeled`),
      value,
    ),
    value,
  );

// --- per exchange: Part III ---------------------------------------------------------

const offsets = (i: number): Expr => add(amt(i, "LiabilitiesAssumed"), amt(i, "CashPaid"), amt(i, "OtherPropertyGivenUpFmv"));
const line15Gross = (i: number): Expr => add(amt(i, "CashReceived"), amt(i, "OtherPropertyReceivedFmv"), max0(sub(amt(i, "LiabilitiesRelieved"), offsets(i))));
const expensesOn15 = (i: number): Expr => min(amt(i, "ExchangeExpenses"), line15Gross(i));

const LINES_15_20 =
  'Form 8824: "15 Cash received, FMV of other property received, plus net liabilities assumed by other party, reduced (but not below zero) by any exchange expenses incurred"; "16 FMV of like-kind property received"; "17 Add lines 15 and 16"; "18 Adjusted basis of like-kind property you gave up, net amounts paid to other party, plus any exchange expenses not used on line 15"; "19 Realized gain or (loss). Subtract line 18 from line 17"; "20 Enter the smaller of line 15 or line 19, but not less than zero". I8824 lines 15 and 18: "Net liabilities assumed by the other party—the excess, if any, of liabilities (including mortgages) assumed by the other party over the total of (a) any liabilities you assumed, (b) cash you paid to the other party, and (c) the FMV of the other (non-like-kind) property you gave up. Reduce the sum of the above amounts (but not below zero) by any exchange expenses you incurred." "The net amount paid to the other party—the excess, if any, of the total of (a) any liabilities you assumed, (b) cash you paid to the other party, and (c) the FMV of the other (non-like-kind) property you gave up over any liabilities assumed by the other party." Example: "Taylor enters $40,000 on line 20, the lesser of line 15 or line 19." § 1031(b): gain "shall be recognized, but in an amount not in excess of the sum of such money and the fair market value of such other property."';

const LINE_21 =
  'Pub. 544: "If you hold section 1250 property for 1 year or less, all the depreciation is additional depreciation." I8824 line 21: "Section 1245 real property. Enter the smaller of: 1. The total adjustments for deductions ... allowed or allowable ... for depreciation or amortization (up to the amount of gain shown on line 19); or 2. The gain shown on line 20, if any, plus the FMV of non-section 1245 like-kind property received. Section 1250 property. Enter the smaller of: 1. The gain you would have had to report as ordinary income because of additional depreciation if you had sold the property (see the Form 4797 instructions for line 26); or 2. The larger of: a. The gain shown on line 20, if any; or b. The excess, if any, of the gain in (1) above over the FMV of the section 1250 property received." Example: "The section 1245(a)(1) ordinary income recapture amount is $35,000 (the lesser of the property\'s depreciable basis of $35,000 or the amount realized of $55,000)." "Finley computes the section 1250(d)(4)(A) recapture limit as the greater of the gain recognized on line 20 of $30,000, and $0 (the section 1250(a)(1)(A) recapture amount of $35,000 less the FMV of section 1250 property received of $165,000)."';

/** § 1250(b)(1): held 1 year or less, all the depreciation is additional depreciation */
const additional1250 = (i: number): Expr => iff(longTerm(i), amt(i, "Section1250AdditionalDepreciation"), amt(i, "Section1250Depreciation"));

/** § 1250 property's gain had it been sold for its FMV (Form 4797 line 24) */
const gain1250 = (i: number): Expr => max0(sub(xf(i, "Section1250Fmv"), xf(i, "Section1250AdjustedBasis")));

const exchangeRules = (i: number): Rule[] => [
  rule(x(i, "line15"), `Like-kind exchange ${i}: Form 8824 line 15 — cash, other property and net liabilities received, less exchange expenses`, "Reg. § 1.1031(d)-2; Form 8824 line 15", LINES_15_20, scopeChecks(i, sub(line15Gross(i), expensesOn15(i)))),
  rule(
    x(i, "line18"),
    `Like-kind exchange ${i}: Form 8824 line 18 — adjusted basis given up, net amounts paid and unused exchange expenses`,
    "Form 8824 line 18",
    LINES_15_20,
    add(amt(i, "AdjustedBasisGivenUp"), sub(amt(i, "ExchangeExpenses"), expensesOn15(i)), max0(sub(offsets(i), amt(i, "LiabilitiesRelieved")))),
  ),
  rule(x(i, "line17"), `Like-kind exchange ${i}: Form 8824 line 17 — lines 15 and 16`, "Form 8824 line 17", LINES_15_20, add(X(i, "line15"), X(i, "line16"))),
  rule(x(i, "line19"), `Like-kind exchange ${i}: Form 8824 line 19 — realized gain or (loss)`, "§ 1001; Form 8824 lines 17–19", LINES_15_20, sub(X(i, "line17"), X(i, "line18"))),
  rule(x(i, "line20"), `Like-kind exchange ${i}: Form 8824 line 20 — gain recognized before recapture`, "§ 1031(b); Form 8824 line 20", LINES_15_20, max0(min(X(i, "line15"), X(i, "line19")))),
  rule(
    x(i, "recapture_1245"),
    `Like-kind exchange ${i}: § 1245 recapture on § 1245 real property given up (§ 1245(b)(4))`,
    "§ 1245(a)(1), (b)(4); Form 8824 line 21",
    LINE_21,
    iff(
      and(gt0(amt(i, "Section1245Depreciation")), gt0(X(i, "line19"))),
      iff(
        cmp("gt", xf(i, "Received1245Fmv"), amt(i, "LikeKindReceivedFmv")),
        unsupported(`like-kind exchange ${i}: the § 1245 property received is worth more than all the like-kind property received (line 16)`),
        min(
          amt(i, "Section1245Depreciation"),
          max0(sub(xf(i, "Section1245Fmv"), xf(i, "Section1245AdjustedBasis"))),
          X(i, "line19"),
          add(X(i, "line20"), sub(amt(i, "LikeKindReceivedFmv"), xf(i, "Received1245Fmv"))),
        ),
      ),
      zero,
    ),
  ),
  rule(
    x(i, "recapture_1250"),
    `Like-kind exchange ${i}: § 1250 recapture of additional depreciation (§ 1250(d)(4))`,
    "§ 1250(a)(1), (d)(4); Form 8824 line 21",
    LINE_21,
    iff(
      and(gt0(additional1250(i)), gt0(X(i, "line19"))),
      iff(
        cmp("gt", xf(i, "Received1250Fmv"), amt(i, "LikeKindReceivedFmv")),
        unsupported(`like-kind exchange ${i}: the § 1250 property received is worth more than all the like-kind property received (line 16)`),
        (() => {
          const ifSold = min(additional1250(i), gain1250(i));
          return min(ifSold, max(X(i, "line20"), max0(sub(ifSold, xf(i, "Received1250Fmv")))));
        })(),
      ),
      zero,
    ),
  ),
  rule(
    x(i, "line21"),
    `Like-kind exchange ${i}: Form 8824 line 21 — ordinary income under the recapture rules`,
    "§§ 1245(b)(4), 1250(d)(4); Form 8824 line 21",
    LINE_21,
    min(add(X(i, "recapture_1245"), X(i, "recapture_1250")), max0(X(i, "line19"))),
  ),
  rule(
    x(i, "line22"),
    `Like-kind exchange ${i}: Form 8824 line 22 — recognized gain other than recapture`,
    "Form 8824 line 22",
    'Form 8824: "22 Subtract line 21 from line 20. If zero or less, enter -0-. If more than zero, enter here and on Schedule D or Form 4797"; "23 Recognized gain. Add lines 21 and 22". Example: "Taylor enters the sum of lines 21 and 22, $50,000, on line 23."',
    max0(sub(X(i, "line20"), X(i, "line21"))),
  ),
  rule(x(i, "line23"), `Like-kind exchange ${i}: Form 8824 line 23 — recognized gain`, "Form 8824 line 23", 'Form 8824: "23 Recognized gain. Add lines 21 and 22".', add(X(i, "line21"), X(i, "line22"))),
  rule(
    x(i, "line24"),
    `Like-kind exchange ${i}: Form 8824 line 24 — deferred gain or (loss)`,
    "§ 1031(a), (c); Form 8824 line 24",
    'I8824 line 24: "If line 19 is a loss, enter it on line 24. Otherwise, subtract the amount on line 23 from the amount on line 19 and enter the result." § 1031(c): "no loss from the exchange shall be recognized."',
    iff(cmp("lt", X(i, "line19"), zero), X(i, "line19"), sub(X(i, "line19"), X(i, "line23"))),
  ),
  rule(
    x(i, "line25"),
    `Like-kind exchange ${i}: Form 8824 line 25 — basis of the like-kind property received`,
    "§ 1031(d); Form 8824 line 25",
    'Form 8824: "25 Basis of like-kind property received. Subtract line 15 from the sum of lines 18 and 23." § 1031(d): the basis "shall be the same as that of the property exchanged, decreased in the amount of any money received by the taxpayer and increased in the amount of gain or decreased in the amount of loss to the taxpayer that was recognized on such exchange." Example: "Taylor subtracts line 15 from the sum of lines 18 and 23 and enters $170,000 on line 25."',
    sub(add(X(i, "line18"), X(i, "line23")), X(i, "line15")),
  ),
  rule(
    x(i, "line25a"),
    `Like-kind exchange ${i}: Form 8824 line 25a — basis of like-kind § 1250 property received`,
    "Form 8824 line 25a",
    'I8824 lines 25a–25c: "On line 25a, enter the amount from line 25 that is allocated to the like-kind section 1250 property received in the exchange." "Amounts entered on lines 25a, 25b, and 25c must be proportionate to their FMVs." Example: "Finley allocates $131,250 ($165,000/$220,000 × $175,000) from line 25 to the basis of the like-kind section 1250 property".',
    iff(gt0(X(i, "line16")), mulDiv(X(i, "line25"), xf(i, "Received1250Fmv"), X(i, "line16")), zero),
  ),
  rule(
    x(i, "line25b"),
    `Like-kind exchange ${i}: Form 8824 line 25b — basis of like-kind § 1245 property received`,
    "Form 8824 line 25b",
    'I8824 lines 25a–25c: "On line 25b, enter the amount from line 25 that is allocated to the like-kind section 1245, 1252, 1254, and 1255 property received in the exchange." Example: "Finley allocates $43,750 ($55,000/$220,000 × $175,000) from line 25 to the basis of the like-kind section 1245 property".',
    iff(gt0(X(i, "line16")), mulDiv(X(i, "line25"), xf(i, "Received1245Fmv"), X(i, "line16")), zero),
  ),
  rule(x(i, "line16"), `Like-kind exchange ${i}: Form 8824 line 16 — FMV of like-kind property received`, "Form 8824 line 16", LINES_15_20, scopeChecks(i, amt(i, "LikeKindReceivedFmv"))),
  rule(
    x(i, "ordinary"),
    `Like-kind exchange ${i}: ordinary recognized gain on business property — Form 4797 line 16`,
    "Form 4797 line 16",
    'I8824 line 22: "Report a gain from the exchange of property used in a trade or business (and other noncapital assets) on Form 4797, line 5 or line 16." Form 8824 line 21: "Ordinary income under recapture rules. Enter here and on Form 4797". [Held 1 year or less, all of it is ordinary.]',
    iff(business(i), s1239(i, iff(longTerm(i), X(i, "line21"), X(i, "line23"))), zero),
  ),
  rule(
    x(i, "section1231"),
    `Like-kind exchange ${i}: § 1231 recognized gain on business property held more than 1 year — Form 4797 line 5`,
    "§ 1231; Form 4797 line 5",
    'Form 4797 (2025): "5 Section 1231 gain or (loss) from like-kind exchanges from Form 8824".',
    iff(and(business(i), longTerm(i)), s1239(i, X(i, "line22")), zero),
  ),
  rule(
    x(i, "unrecaptured_1250"),
    `Like-kind exchange ${i}: unrecaptured § 1250 gain in the recognized gain`,
    "§ 1(h)(6)(A); Schedule D worksheet lines 1–3",
    '§ 1(h)(6)(A): "unrecaptured section 1250 gain" is "the amount of long-term capital gain (not otherwise treated as ordinary income) which would be treated as ordinary income if section 1250(b)(1) included all depreciation and the applicable percentage under section 1250(a) were 100 percent". Unrecaptured Section 1250 Gain Worksheet line 1: "the smaller of line 22 or line 24 of Form 4797 for that property"; line 2: "the amount from Form 4797, line 26g, for the property"; "3. Subtract line 2 from line 1." I8824 line 21: § 1250 recapture is the smaller of the additional-depreciation gain if sold or the larger of "The gain shown on line 20" and its excess "over the FMV of the section 1250 property received." [With all depreciation treated as additional, that limit is never below line 20, so the § 1231 gain on line 22 is unrecaptured § 1250 gain up to the smaller of the depreciation and the § 1250 property’s gain had it been sold, less the § 1250 recapture.]',
    iff(
      and(kindIs(i, "section1250"), longTerm(i), gt0(amt(i, "Section1250Depreciation")), gt0(X(i, "line22"))),
      min(X(i, "line22"), max0(sub(min(amt(i, "Section1250Depreciation"), gain1250(i)), X(i, "recapture_1250")))),
      zero,
    ),
  ),
];

// --- where the recognized gain goes ---------------------------------------------------

const sumWhere = (pick: (i: number) => Expr, value: (i: number) => Expr): Expr =>
  add(...SLOTS.map((i) => iff(pick(i), value(i), zero)));

const ROUTING =
  'I8824 line 22: "Report a gain from the exchange of property used in a trade or business (and other noncapital assets) on Form 4797, line 5 or line 16. Report a gain from the exchange of capital assets according to the Schedule D (Form 1040) instructions for your tax return. Be sure to use the date of the exchange as the date for reporting the gain." Form 8824 line 21: "Ordinary income under recapture rules. Enter here and on Form 4797". Schedule D (2025): "4 Short-term gain from Form 6252 and short-term gain or (loss) from Forms 4684, 6781, and 8824"; "11 ... long-term gain or (loss) from Forms 4684, 6781, and 8824". Form 4797 (2025): "5 Section 1231 gain or (loss) from like-kind exchanges from Form 8824"; "16 Ordinary gain or (loss) from like-kind exchanges from Form 8824". [Form 4797 (2026 draft): lines 5 and 17. Property held 1 year or less is not § 1231 property, so all its recognized gain is ordinary.]';

const routeRules: Rule[] = [
  rule(form8824RuleId.capitalShortTerm, "Form 8824 short-term recognized gain on investment property → Schedule D line 4", "Schedule D line 4", ROUTING, sumWhere((i) => and(kindIs(i, "capital"), not(longTerm(i))), (i) => s1239(i, X(i, "line23")))),
  rule(form8824RuleId.capitalLongTerm, "Form 8824 long-term recognized gain on investment property → Schedule D line 11", "Schedule D line 11", ROUTING, sumWhere((i) => and(kindIs(i, "capital"), longTerm(i)), (i) => s1239(i, X(i, "line23")))),
  rule(form8824RuleId.section1231, "Form 8824 § 1231 gain on business property held more than 1 year → Form 4797 line 5", "Form 4797 line 5", ROUTING, add(...SLOTS.map((i) => X(i, "section1231")))),
  rule(
    form8824RuleId.ordinary,
    "Form 8824 ordinary gain → Form 4797 line 16 (2026: line 17)",
    "Form 4797 line 16",
    ROUTING,
    add(...SLOTS.map((i) => X(i, "ordinary"))),
  ),
  rule(
    form8824RuleId.unrecaptured1250,
    "Form 8824 unrecaptured § 1250 gain (with Unrecaptured Section 1250 Gain Worksheet line 3)",
    "§ 1(h)(6); Schedule D worksheet lines 1–3",
    '§ 1(h)(6)(A) and the Unrecaptured Section 1250 Gain Worksheet, lines 1–3 (see each exchange’s rule).',
    add(...SLOTS.map((i) => X(i, "unrecaptured_1250"))),
  ),
  rule(
    form8824RuleId.present,
    "Form 8824 has an exchange",
    "Form 8824",
    "[A flag for the rules that refuse a like-kind exchange they don’t model: $1 when likeKindExchanges > 0.]",
    iff(cmp("gt", fact("likeKindExchanges"), int("0")), money("100"), zero),
  ),
];

export const form8824Rules: Rule[] = [...SLOTS.flatMap(exchangeRules), ...routeRules];
