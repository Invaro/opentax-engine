/**
 * Inputs for Form 6252 (installment sales, rules/form6252.ts) and Form 8824
 * (like-kind exchanges, rules/form8824.ts): up to four of each.
 */

import type { FactSpec } from "@invaro/opentax-core";

export const INSTALLMENT_SALE_SLOTS = 4;
export const LIKE_KIND_EXCHANGE_SLOTS = 4;
export const INSTALLMENT_SALE_KINDS = ["capital", "section1245", "section1250", "other"] as const;
export const LIKE_KIND_EXCHANGE_KINDS = ["capital", "section1250", "other"] as const;

const money0 = (id: string, description: string, rationale: string): FactSpec => ({
  id,
  type: "money",
  min: "0",
  description,
  default: { value: "0", rationale },
});

const sale = (i: number): FactSpec[] => {
  const s = (name: string) => `installmentSale${i}${name}`;
  const first = i === 1;
  return [
    {
      id: s("Kind"),
      type: "enum",
      enumValues: [...INSTALLMENT_SALE_KINDS],
      description: first
        ? "Installment sale 1 (when installmentSales ≥ 1): capital = a capital asset never depreciated (land or a home held for investment or personal use, stock that isn't publicly traded, a partnership interest is not modeled); section1245 = depreciable personal property used in a trade or business (machinery, equipment, vehicles, amortized intangibles, real property expensed under § 179); section1250 = a depreciated building used in a trade or business or as a rental; other = never-depreciated business property such as land used in the business. Sales of publicly traded stock or securities, sales by a dealer, sales at a loss and contingent payment sales (Form 6252 line 4 \"No\") can't use the installment method — enter those as ordinary sales."
        : `Installment sale ${i} (when installmentSales ≥ ${i}): capital, section1245, section1250 or other — as for installmentSale1Kind.`,
      // no default — a property's character is never guessed
    },
    {
      id: s("HeldOverOneYear"),
      type: "bool",
      description: first
        ? "Installment sale 1: the property was held more than 1 year when it was sold. A capital asset's gain is then long-term (Schedule D line 11; short-term on line 4 otherwise); business property's gain is § 1231 gain (Form 4797 line 4; ordinary on line 10 otherwise)."
        : `Installment sale ${i}: the property was held more than 1 year when it was sold.`,
      // no default — never guessed
    },
    {
      id: s("YearOfSale"),
      type: "bool",
      description: first
        ? "Installment sale 1: this tax year is the year of the sale. In the year of sale the § 1245 and § 1250 recapture is taxed in full (§ 453(i)) and the mortgage in excess of basis is a payment (line 20); in later years only the payments are taxed. Every year, enter the sale's Part I amounts as they were in the year of sale."
        : `Installment sale ${i}: this tax year is the year of the sale.`,
      // no default — never guessed
    },
    money0(
      s("SellingPrice"),
      first
        ? "Installment sale 1: selling price (Form 6252 line 5) — money, the face amount of the buyer's note, the FMV of other property, and any mortgage or debt the buyer assumed or took the property subject to. Don't include stated or unstated interest or original issue discount. In dollars."
        : `Installment sale ${i}: selling price including mortgages assumed, without interest (Form 6252 line 5). In dollars.`,
      `Assumed no selling price for installment sale ${i}`,
    ),
    money0(
      s("MortgagesAssumed"),
      first
        ? "Installment sale 1: mortgages, debts and other liabilities the buyer assumed or took the property subject to (Form 6252 line 6) — not a new mortgage the buyer got from a bank or from you. In dollars."
        : `Installment sale ${i}: mortgages and debts the buyer assumed or took the property subject to (Form 6252 line 6). In dollars.`,
      `Assumed the buyer took installment sale ${i}'s property free of debt`,
    ),
    money0(
      s("CostBasis"),
      first
        ? "Installment sale 1: cost or other basis of the property, plus improvements (Form 6252 line 8), before depreciation. In dollars."
        : `Installment sale ${i}: cost or other basis (Form 6252 line 8). In dollars.`,
      `Assumed no basis for installment sale ${i}`,
    ),
    money0(
      s("Depreciation"),
      first
        ? "Installment sale 1 (section1245 or section1250 only): depreciation and amortization allowed or allowable, including § 179 and any special allowance (Form 6252 line 9 / Form 4797 Part III). In dollars."
        : `Installment sale ${i} (section1245 or section1250 only): depreciation allowed or allowable (Form 6252 line 9). In dollars.`,
      `Assumed no depreciation on installment sale ${i}'s property`,
    ),
    money0(
      s("AdditionalDepreciation"),
      first
        ? "Installment sale 1 (section1250 held more than 1 year only): additional depreciation after 1975 — depreciation in excess of straight line (Form 4797 line 26a). Zero for MACRS buildings depreciated straight line. Held 1 year or less, all of a § 1250 property's depreciation is recaptured (§ 1250(b)(1)). In dollars."
        : `Installment sale ${i} (section1250 only): additional depreciation after 1975 (Form 4797 line 26a). In dollars.`,
      `Assumed straight-line depreciation on installment sale ${i}'s property (no additional depreciation)`,
    ),
    money0(
      s("SellingExpenses"),
      first
        ? "Installment sale 1: commissions and other expenses of sale (Form 6252 line 11). In dollars."
        : `Installment sale ${i}: commissions and other expenses of sale (Form 6252 line 11). In dollars.`,
      `Assumed no selling expenses for installment sale ${i}`,
    ),
    money0(
      s("ExcludedGain"),
      first
        ? "Installment sale 1 (capital only): gain excluded under § 121 because the property was your main home (Form 6252 line 15; Pub. 523). In dollars."
        : `Installment sale ${i} (capital only): § 121 main-home exclusion (Form 6252 line 15). In dollars.`,
      `Assumed no main-home exclusion for installment sale ${i}`,
    ),
    money0(
      s("PaymentsThisYear"),
      first
        ? "Installment sale 1: principal payments received this tax year (Form 6252 line 21) — money and the FMV of property received, including amounts withheld to pay off your debts or selling expenses, a note payable on demand or readily tradable, and the net proceeds of a debt secured by the installment obligation (the § 453A(d) pledge rule). Not interest, and not the buyer's own note. A payment already taxed as a deemed payment in an earlier year (a related party's second disposition or a pledge) goes in installmentSale1PaymentsPriorYears instead. In dollars."
        : `Installment sale ${i}: principal payments received this tax year, without interest (Form 6252 line 21). In dollars.`,
      `Assumed no payments received this year on installment sale ${i}`,
    ),
    money0(
      s("PaymentsPriorYears"),
      first
        ? "Installment sale 1 (years after the year of sale): payments received before this tax year (Form 6252 line 23), including the year of sale's line 20 (mortgage over basis) and any deemed payments (a related party's second disposition, the pledge rule). Zero in the year of sale. In dollars."
        : `Installment sale ${i}: payments received in prior years, including deemed payments (Form 6252 line 23). In dollars.`,
      `Assumed no payments before this year on installment sale ${i}`,
    ),
    {
      id: s("GrossProfitPercentageBps"),
      type: "int",
      min: "0",
      max: "10000",
      description: first
        ? "Installment sale 1: the gross profit percentage you used on line 19 in the year of sale, in hundredths of a percent (0.2500 = 2500; 100% = 10000), when you rounded it (\"rounded to at least 4 digits\") or figured it on a combined contract price for several assets sold together (Pub. 537 Sale of a Business — then also enter the whole installment payment). 0 = figure line 19 exactly as line 16 ÷ line 18."
        : `Installment sale ${i}: the line 19 gross profit percentage you used, in hundredths of a percent; 0 = figure it exactly.`,
      default: { value: "0", rationale: `Figured installment sale ${i}'s gross profit percentage exactly as line 16 ÷ line 18` },
    },
    {
      id: s("RelatedParty"),
      type: "bool",
      description: first
        ? "Installment sale 1 was to a related party (Form 6252 line 3; § 453(f)(1)): your spouse, child, grandchild, parent or sibling, or a related corporation, S corporation, partnership, estate or trust. A sale of depreciable property to a related person can't use the installment method (§ 453(g)) and is refused."
        : `Installment sale ${i} was to a related party (Form 6252 line 3).`,
      default: { value: false, rationale: `Assumed installment sale ${i} was not to a related party` },
    },
    {
      id: s("SecondDisposition"),
      type: "bool",
      description: first
        ? "Installment sale 1 (related party only): the related party resold or disposed of the property this tax year (Form 6252 line 28), within 2 years of your sale (line 29a), and none of the exceptions on lines 29b–29e applies. Then Part III treats what they realized as a payment to you."
        : `Installment sale ${i} (related party only): the related party made a second disposition this year with no line 29 exception (Form 6252 lines 28–29).`,
      // no default — asked when the sale was to a related party
    },
    {
      id: s("RelatedPartyAmountRealized"),
      type: "money",
      min: "0",
      description: first
        ? "Installment sale 1 (second disposition only): the amount the related party realized on the resale — cumulative if part was resold earlier — or the FMV if the property wasn't sold or exchanged (Form 6252 line 30). In dollars."
        : `Installment sale ${i} (second disposition only): amount realized by the related party (Form 6252 line 30). In dollars.`,
      // no default — asked when there was a second disposition
    },
    {
      id: s("Qbi"),
      type: "bool",
      description: first
        ? "Installment sale 1's property was used in a qualified trade or business for § 199A: its ordinary results (recapture, a sale of property held 1 year or less, or § 1231 gain when § 1231 nets to a loss) are QBI. Asked when the sale has an ordinary result."
        : `Installment sale ${i}'s property was used in a qualified trade or business for § 199A. Asked when it has an ordinary result.`,
      // no default — never guessed
    },
    {
      id: s("NetInvestmentIncome"),
      type: "bool",
      description: first
        ? "Installment sale 1's gain is net investment income (§ 1411(c)(1)(A)(iii)): true for property held for investment, in a passive activity or in a rental that isn't a § 162 trade or business; false for property used in a trade or business in which you materially participate (Form 8960 line 5b takes it out). Asked for business property when the net investment income tax can apply; a capital asset's gain is always included."
        : `Installment sale ${i}'s gain is net investment income (Form 8960 lines 5a/5b). Asked for business property when the NIIT can apply.`,
      // no default — never guessed
    },
  ];
};

const exchange = (i: number): FactSpec[] => {
  const x = (name: string) => `likeKindExchange${i}${name}`;
  const first = i === 1;
  return [
    {
      id: x("Kind"),
      type: "enum",
      enumValues: [...LIKE_KIND_EXCHANGE_KINDS],
      description: first
        ? "Like-kind exchange 1 (when likeKindExchanges ≥ 1): the U.S. real property you gave up — capital = held for investment and never depreciated (investment land); section1250 = a depreciated building used in a trade or business or as a rental, with its land; other = business real property never depreciated (land used in the business). Since 2018 only real property qualifies (§ 1031(a)); real property held primarily for sale, foreign real property, and property used as your home don't (Form 8824 instructions)."
        : `Like-kind exchange ${i} (when likeKindExchanges ≥ ${i}): capital, section1250 or other — as for likeKindExchange1Kind.`,
      // no default — never guessed
    },
    {
      id: x("HeldOverOneYear"),
      type: "bool",
      description: first
        ? "Like-kind exchange 1: the property given up was held more than 1 year when you transferred it. Its recognized gain is then long-term (capital) or § 1231 gain (business); otherwise short-term or ordinary."
        : `Like-kind exchange ${i}: the property given up was held more than 1 year.`,
      // no default — never guessed
    },
    money0(
      x("LikeKindReceivedFmv"),
      first
        ? "Like-kind exchange 1: FMV of the like-kind real property received (Form 8824 line 16). In dollars."
        : `Like-kind exchange ${i}: FMV of the like-kind property received (Form 8824 line 16). In dollars.`,
      `Assumed no like-kind property received in exchange ${i}`,
    ),
    money0(
      x("AdjustedBasisGivenUp"),
      first
        ? "Like-kind exchange 1: adjusted basis of the like-kind real property given up (part of Form 8824 line 18), after depreciation. In dollars."
        : `Like-kind exchange ${i}: adjusted basis of the like-kind property given up (Form 8824 line 18). In dollars.`,
      `Assumed no basis in exchange ${i}'s property given up`,
    ),
    money0(
      x("CashReceived"),
      first
        ? "Like-kind exchange 1: cash the other party paid you (Form 8824 line 15), including cash you could get from a qualified intermediary. In dollars."
        : `Like-kind exchange ${i}: cash received (Form 8824 line 15). In dollars.`,
      `Assumed no cash received in exchange ${i}`,
    ),
    money0(
      x("OtherPropertyReceivedFmv"),
      first
        ? "Like-kind exchange 1: FMV of other (not like-kind) property received (Form 8824 line 15). In dollars."
        : `Like-kind exchange ${i}: FMV of other property received (Form 8824 line 15). In dollars.`,
      `Assumed no other property received in exchange ${i}`,
    ),
    money0(
      x("LiabilitiesRelieved"),
      first
        ? "Like-kind exchange 1: liabilities (including mortgages) the other party assumed or took your property subject to (Form 8824 line 15 instructions). In dollars."
        : `Like-kind exchange ${i}: liabilities the other party assumed (Form 8824 line 15). In dollars.`,
      `Assumed the other party assumed no liabilities in exchange ${i}`,
    ),
    money0(
      x("LiabilitiesAssumed"),
      first
        ? "Like-kind exchange 1: liabilities you assumed or took the property received subject to (Form 8824 lines 15 and 18 instructions). In dollars."
        : `Like-kind exchange ${i}: liabilities you assumed (Form 8824 lines 15 and 18). In dollars.`,
      `Assumed you assumed no liabilities in exchange ${i}`,
    ),
    money0(
      x("CashPaid"),
      first
        ? "Like-kind exchange 1: cash you paid the other party (Form 8824 lines 15 and 18 instructions). In dollars."
        : `Like-kind exchange ${i}: cash you paid (Form 8824 lines 15 and 18). In dollars.`,
      `Assumed you paid no cash in exchange ${i}`,
    ),
    money0(
      x("OtherPropertyGivenUpFmv"),
      first
        ? "Like-kind exchange 1: FMV of other (not like-kind) property you gave up (Form 8824 line 12). It offsets the liabilities on lines 15 and 18; enter its own gain or loss (line 14) as a sale of that property in the Form 4797 or capital gain facts. In dollars."
        : `Like-kind exchange ${i}: FMV of other property given up (Form 8824 line 12); enter its gain or loss as its own sale. In dollars.`,
      `Assumed no other property given up in exchange ${i}`,
    ),
    money0(
      x("ExchangeExpenses"),
      first
        ? "Like-kind exchange 1: exchange expenses (commissions, legal and qualified intermediary fees). They reduce line 15, and any not used there go on line 18. In dollars."
        : `Like-kind exchange ${i}: exchange expenses (Form 8824 lines 15 and 18). In dollars.`,
      `Assumed no exchange expenses in exchange ${i}`,
    ),
    money0(
      x("Section1250Depreciation"),
      first
        ? "Like-kind exchange 1 (section1250 only): depreciation allowed or allowable on the § 1250 property given up (the building and its structural components, not land or a § 1245 component). It sets the unrecaptured § 1250 gain in the recognized gain. In dollars."
        : `Like-kind exchange ${i} (section1250 only): depreciation on the § 1250 property given up. In dollars.`,
      `Assumed no depreciation on exchange ${i}'s § 1250 property`,
    ),
    money0(
      x("Section1250AdditionalDepreciation"),
      first
        ? "Like-kind exchange 1 (section1250 only): additional depreciation on the § 1250 property given up — the excess over straight line (Form 4797 line 26a). Zero for MACRS buildings depreciated straight line. Held 1 year or less, all of the depreciation is recaptured without this (§ 1250(b)(1)). In dollars."
        : `Like-kind exchange ${i} (section1250 only): additional depreciation on the § 1250 property given up. In dollars.`,
      `Assumed straight-line depreciation on exchange ${i}'s § 1250 property (no additional depreciation)`,
    ),
    {
      id: x("Section1250Fmv"),
      type: "money",
      min: "0",
      description: first
        ? "Like-kind exchange 1: FMV of the § 1250 property given up (the building, without land). With its adjusted basis it gives the gain you'd have had on Form 4797 line 24 had you sold it. Asked when it has depreciation and the exchange recognizes gain. In dollars."
        : `Like-kind exchange ${i}: FMV of the § 1250 property given up. In dollars.`,
      // no default — asked when needed
    },
    {
      id: x("Section1250AdjustedBasis"),
      type: "money",
      min: "0",
      description: first
        ? "Like-kind exchange 1: adjusted basis of the § 1250 property given up (the building, without land). Asked with likeKindExchange1Section1250Fmv. In dollars."
        : `Like-kind exchange ${i}: adjusted basis of the § 1250 property given up. In dollars.`,
      // no default — asked when needed
    },
    money0(
      x("Section1245Depreciation"),
      first
        ? "Like-kind exchange 1 (section1250 only): depreciation allowed or allowable on § 1245 property that is part of the real property given up (for example components a cost segregation study placed in a shorter MACRS class; Form 8824 instructions, line 21). In dollars."
        : `Like-kind exchange ${i} (section1250 only): depreciation on § 1245 real property given up. In dollars.`,
      `Assumed no § 1245 property in exchange ${i}'s property given up`,
    ),
    {
      id: x("Section1245Fmv"),
      type: "money",
      min: "0",
      description: first
        ? "Like-kind exchange 1: FMV of the § 1245 real property given up. Asked when it has depreciation. In dollars."
        : `Like-kind exchange ${i}: FMV of the § 1245 real property given up. In dollars.`,
      // no default — asked when needed
    },
    {
      id: x("Section1245AdjustedBasis"),
      type: "money",
      min: "0",
      description: first
        ? "Like-kind exchange 1: adjusted basis of the § 1245 real property given up. Asked when it has depreciation. In dollars."
        : `Like-kind exchange ${i}: adjusted basis of the § 1245 real property given up. In dollars.`,
      // no default — asked when needed
    },
    {
      id: x("Received1245Fmv"),
      type: "money",
      min: "0",
      description: first
        ? "Like-kind exchange 1: FMV of the like-kind § 1245 property received (part of line 16). It limits the § 1245 recapture (§ 1245(b)(4)) and sets line 25b. Asked when the property given up has § 1245 recapture. In dollars."
        : `Like-kind exchange ${i}: FMV of the like-kind § 1245 property received. In dollars.`,
      // no default — asked when needed
    },
    {
      id: x("Received1250Fmv"),
      type: "money",
      min: "0",
      description: first
        ? "Like-kind exchange 1: FMV of the like-kind § 1250 property received (part of line 16, the buildings without land). It limits the § 1250 recapture (§ 1250(d)(4)) and sets line 25a. Asked when the property given up has additional depreciation. In dollars."
        : `Like-kind exchange ${i}: FMV of the like-kind § 1250 property received. In dollars.`,
      // no default — asked when needed
    },
    {
      id: x("RelatedParty"),
      type: "bool",
      description: first
        ? "Like-kind exchange 1 was made with a related party, directly or through an intermediary (Form 8824 line 7; § 1031(f))."
        : `Like-kind exchange ${i} was made with a related party (Form 8824 line 7).`,
      default: { value: false, rationale: `Assumed like-kind exchange ${i} was not with a related party` },
    },
    {
      id: x("RelatedPartyDisposition"),
      type: "bool",
      description: first
        ? "Like-kind exchange 1 (related party only): you or the related party disposed of property received in the exchange this tax year, within 2 years of the last transfer, and no exception on Form 8824 line 11 applies. The exchange is then taxed as a sale — refused here."
        : `Like-kind exchange ${i} (related party only): a disposition within 2 years with no line 11 exception (Form 8824 lines 9–11).`,
      // no default — asked when the exchange was with a related party
    },
    {
      id: x("Qbi"),
      type: "bool",
      description: first
        ? "Like-kind exchange 1's property was used in a qualified trade or business for § 199A: its ordinary recognized gain (line 21, or a property held 1 year or less, or § 1231 gain when § 1231 nets to a loss) is QBI. Asked when it has an ordinary result."
        : `Like-kind exchange ${i}'s property was used in a qualified trade or business for § 199A. Asked when it has an ordinary result.`,
      // no default — never guessed
    },
    {
      id: x("NetInvestmentIncome"),
      type: "bool",
      description: first
        ? "Like-kind exchange 1's recognized gain is net investment income (§ 1411(c)(1)(A)(iii)): true for a rental that isn't a § 162 trade or business or a passive activity; false for property used in a trade or business in which you materially participate (Form 8960 line 5b). Asked for business property when the NIIT can apply; investment property's gain is always included."
        : `Like-kind exchange ${i}'s recognized gain is net investment income (Form 8960 lines 5a/5b). Asked for business property when the NIIT can apply.`,
      // no default — never guessed
    },
  ];
};

export const installmentSaleFacts: FactSpec[] = [
  {
    id: "installmentSales",
    type: "int",
    min: "0",
    max: String(INSTALLMENT_SALE_SLOTS),
    description:
      "How many installment sales you report this year (0–4) on Form 6252 — the year of the sale and every later year until the final payment — each in installmentSale1… through installmentSale4…. The engine figures the gross profit and contract price (Part I), the installment sale income (Part II), a related party's second disposition (Part III), the § 1245 and § 1250 recapture taxed in the year of sale, where the income goes (Schedule D lines 4 and 11, Form 4797 lines 4, 10 and 13) and the unrecaptured § 1250 gain in it. Don't also enter these sales in the capital gain or Form 4797 facts; report the interest you receive as interest income.",
    default: { value: "0", rationale: "Assumed no installment sales absent contrary input" },
  },
  ...Array.from({ length: INSTALLMENT_SALE_SLOTS }, (_, k) => sale(k + 1)).flat(),
  {
    id: "installmentSaleSection453AInterest",
    type: "bool",
    description:
      "Interest on deferred tax is owed under § 453A: an installment obligation from a sale over $150,000 is outstanding at the end of the year, and the face amount of your nondealer installment obligations that arose in its year and were outstanding at that year's end was over $5 million. The interest isn't figured on Form 6252 and is refused. Asked when a sale's selling price is over $150,000.",
    default: { value: false, rationale: "Assumed no § 453A interest on deferred tax (installment obligations of $5 million or less)" },
  },
];

export const likeKindExchangeFacts: FactSpec[] = [
  {
    id: "likeKindExchanges",
    type: "int",
    min: "0",
    max: String(LIKE_KIND_EXCHANGE_SLOTS),
    description:
      "How many like-kind exchanges of real property you made this year (0–4) on Form 8824, each in likeKindExchange1… through likeKindExchange4…. The engine figures the realized gain, the gain recognized to the extent of cash and other property received (lines 15–23), the § 1245 and § 1250 recapture in it (line 21), the deferred gain (line 24), the basis of the property received (line 25, with 25a and 25b), where the gain goes (Schedule D lines 4 and 11, Form 4797 lines 5 and 16) and its unrecaptured § 1250 gain. Don't also enter these exchanges in the capital gain or Form 4797 facts.",
    default: { value: "0", rationale: "Assumed no like-kind exchanges absent contrary input" },
  },
  ...Array.from({ length: LIKE_KIND_EXCHANGE_SLOTS }, (_, k) => exchange(k + 1)).flat(),
];
