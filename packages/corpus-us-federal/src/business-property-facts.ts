/**
 * Inputs for Form 4797 (rules/form4797.ts): up to eight business properties
 * sold this year, the § 1231 lookback, and § 1231 / unrecaptured § 1250
 * amounts reported on K-1s and Forms 1099-DIV.
 */

import type { FactSpec } from "@invaro/opentax-core";

export const BUSINESS_PROPERTY_SLOTS = 8;
export const BUSINESS_PROPERTY_KINDS = ["section1245", "section1250", "other"] as const;

const property = (i: number): FactSpec[] => [
  {
    id: `businessProperty${i}Kind`,
    type: "enum",
    enumValues: [...BUSINESS_PROPERTY_KINDS],
    description:
      i === 1
        ? "Business property 1 (when businessProperties ≥ 1): section1245 = depreciable personal property (machinery, equipment, vehicles, furniture, amortized intangibles, and real property such as qualified improvement property expensed under § 179); section1250 = depreciable real property (buildings and their structural components); other = business property that was never depreciated (land, or § 1231 property such as timber or livestock entered without depreciation). Land and a building sold together are two properties, with the price and basis split by fair market value (Form 4797 instructions). § 1252, § 1254 and § 1255 property, casualties and thefts (Form 4684) and installment sales (Form 6252) are not modeled."
        : `Business property ${i} (when businessProperties ≥ ${i}): section1245, section1250 or other — as for businessProperty1Kind.`,
    // no default — a property's character is never guessed
  },
  {
    id: `businessProperty${i}HeldOverOneYear`,
    type: "bool",
    description:
      i === 1
        ? "Business property 1 was held more than 1 year (count from the day after acquisition through the day of sale). Held 1 year or less, its gain or loss is ordinary (Form 4797 Part II line 10); held longer, Parts I and III apply."
        : `Business property ${i} was held more than 1 year (Form 4797 Part I/III vs Part II).`,
    // no default — never guessed
  },
  {
    id: `businessProperty${i}SalesPrice`,
    type: "money",
    min: "0",
    description:
      i === 1
        ? "Business property 1: gross sales price — money, the fair market value of other property received, and any debt the buyer assumed or took the property subject to (Form 4797 line 20 / line 2 column (d)). In dollars."
        : `Business property ${i}: gross sales price (Form 4797 line 20 / column (d)). In dollars.`,
    default: { value: "0", rationale: `Assumed no sales price for business property ${i}` },
  },
  {
    id: `businessProperty${i}CostBasis`,
    type: "money",
    min: "0",
    description:
      i === 1
        ? "Business property 1: cost or other basis plus improvements and the expense of sale, before depreciation (Form 4797 line 21 / column (f)). In dollars."
        : `Business property ${i}: cost or other basis plus improvements and expense of sale (Form 4797 line 21). In dollars.`,
    default: { value: "0", rationale: `Assumed no basis for business property ${i}` },
  },
  {
    id: `businessProperty${i}Depreciation`,
    type: "money",
    min: "0",
    description:
      i === 1
        ? "Business property 1: depreciation and amortization allowed or allowable since acquisition, including the § 179 deduction and any special depreciation allowance, and the year of sale (Form 4797 line 22 / column (e)). In dollars."
        : `Business property ${i}: depreciation allowed or allowable, including § 179 and special allowances (Form 4797 line 22). In dollars.`,
    default: { value: "0", rationale: `Assumed no depreciation on business property ${i}` },
  },
  {
    id: `businessProperty${i}AdditionalDepreciation`,
    type: "money",
    min: "0",
    description:
      i === 1
        ? "Business property 1 (section1250 only): additional depreciation after 1975 — depreciation (including any special allowance) in excess of straight line (Form 4797 line 26a). Zero for 27.5-year residential and 39-year nonresidential MACRS property depreciated straight line. In dollars."
        : `Business property ${i} (section1250 only): additional depreciation after 1975 (Form 4797 line 26a). In dollars.`,
    default: { value: "0", rationale: `Assumed straight-line depreciation on business property ${i} (no additional depreciation)` },
  },
  {
    id: `businessProperty${i}Qbi`,
    type: "bool",
    description:
      i === 1
        ? "Business property 1 was used in a qualified trade or business for § 199A: its ordinary gain or loss (recapture, a sale within a year, or a § 1231 loss when § 1231 nets to a loss) is QBI (Reg. § 1.199A-3(b)(2)(ii)(A) excludes only capital gain and loss). Asked when the property has an ordinary result."
        : `Business property ${i} was used in a qualified trade or business for § 199A. Asked when it has an ordinary result.`,
    // no default — never guessed
  },
  {
    id: `businessProperty${i}NetInvestmentIncome`,
    type: "bool",
    description:
      i === 1
        ? "Business property 1's gain or loss is net investment income (§ 1411(c)(1)(A)(iii)): true for property held in a passive activity or a rental that isn't a § 162 trade or business; false for property used in a trade or business in which you materially participate (Form 8960 line 5b takes it out). Asked when the net investment income tax can apply."
        : `Business property ${i}'s gain or loss is net investment income (Form 8960 lines 5a/5b). Asked when the NIIT can apply.`,
    // no default — never guessed
  },
];

export const businessPropertyFacts: FactSpec[] = [
  {
    id: "businessProperties",
    type: "int",
    min: "0",
    max: "8",
    description:
      "How many business properties were sold or exchanged this year (0–8), each in businessProperty1… through businessProperty8… (Form 4797). The engine figures each gain or loss, the § 1245 and § 1250 recapture (Part III), the § 1231 netting with the five-year lookback (Part I), the ordinary total for Schedule 1 line 4 (Part II) and the unrecaptured § 1250 gain taxed at up to 25% (Schedule D line 19). Don't also enter these sales in the capital gain facts.",
    default: { value: "0", rationale: "Assumed no sales of business property absent contrary input" },
  },
  ...Array.from({ length: 8 }, (_, k) => property(k + 1)).flat(),
  {
    id: "section1231LookbackLosses",
    type: "money",
    min: "0",
    description:
      "Nonrecaptured net § 1231 losses from the 5 preceding years (Form 4797 line 8): net § 1231 losses deducted in those years not yet applied against a net § 1231 gain. This year's net § 1231 gain is ordinary income up to this amount (§ 1231(c)). Next year's amount is us.federal.form4797.lookback_remaining (drop losses more than 5 years old yourself). In dollars.",
    default: { value: "0", rationale: "Assumed no nonrecaptured § 1231 losses from the 5 preceding years" },
  },
  {
    id: "k1Section1231Gain",
    type: "money",
    min: "0",
    description:
      "Net § 1231 gain reported on Schedule K-1 (Form 1065 box 10 / Form 1120-S box 9), entered in Form 4797 Part I. Enter a loss in k1Section1231Loss. In dollars.",
    default: { value: "0", rationale: "Assumed no § 1231 gain from K-1s" },
  },
  {
    id: "k1Section1231Loss",
    type: "money",
    min: "0",
    description:
      "Net § 1231 loss reported on Schedule K-1 (Form 1065 box 10 / Form 1120-S box 9), as a positive number, after the basis, at-risk and passive limits. In dollars.",
    default: { value: "0", rationale: "Assumed no § 1231 loss from K-1s" },
  },
  {
    id: "k1Section1231NetInvestmentIncome",
    type: "bool",
    description:
      "The K-1 § 1231 gain or loss is net investment income (the partnership's or S corporation's activity is passive to you, or isn't a § 162 trade or business). Asked when the net investment income tax can apply.",
    // no default — never guessed
  },
  {
    id: "k1UnrecapturedSection1250Gain",
    type: "money",
    min: "0",
    description:
      "Unrecaptured § 1250 gain reported on Schedule K-1 from a partnership or S corporation (Unrecaptured Section 1250 Gain Worksheet line 5) — part of the K-1's § 1231 gain. In dollars.",
    default: { value: "0", rationale: "Assumed no unrecaptured § 1250 gain from K-1s" },
  },
  {
    id: "unrecapturedSection1250GainDistributions",
    type: "money",
    min: "0",
    description:
      "Unrecaptured § 1250 gain reported on Form 1099-DIV box 2b or Form 2439, or on a K-1 from an estate or trust (worksheet line 11). It is part of the capital gain distributions already in longTermCapitalGains — this only marks how much is taxed at up to 25%. In dollars.",
    default: { value: "0", rationale: "Assumed no unrecaptured § 1250 gain in capital gain distributions" },
  },
];
