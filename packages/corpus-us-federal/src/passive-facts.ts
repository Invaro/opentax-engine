/**
 * Inputs for § 469 by activity (rules/passive-activities.ts): how many
 * activities, then each activity's kind, Form 8582 columns and disposition.
 */

import type { FactSpec } from "@invaro/opentax-core";

export const PASSIVE_ACTIVITY_SLOTS = 8;
export const PASSIVE_ACTIVITY_KINDS = ["rental_active", "rental", "business", "business_sp", "ptp", "former_passive"] as const;
export const PASSIVE_DISPOSITIONS = ["none", "entire_taxable", "installment", "other"] as const;
export const PASSIVE_CREDIT_TYPES = ["general", "rehabilitation", "lihc_pre1990", "lihc_post1989"] as const;

const slot = (i: number): FactSpec[] => [
  {
    id: `passiveActivity${i}Kind`,
    type: "enum",
    enumValues: [...PASSIVE_ACTIVITY_KINDS],
    description:
      i === 1
        ? "Passive activity 1 (when passiveActivities ≥ 1): rental_active = rental real estate in which you (or your spouse) actively participated this year with at least a 10% interest (Form 8582 Part IV; § 469(i)); rental = any other rental activity — no active participation, a limited partner's rental, or equipment or other non-real-estate rental (Part V); business = a trade or business you did not materially participate in (K-1 box 1 passive, Schedule C/F) (Part V); business_sp = a trade or business you participated in for more than 100 hours without materially participating (a significant participation activity, Pub. 925 Worksheets A and B); ptp = a publicly traded partnership (§ 469(k): its losses offset only its own income, never on Form 8582); former_passive = an activity that was passive when its losses were suspended but is not now (refused). A real estate professional's rental with material participation, and a rental to your own nonpassive business, are not passive: they do not belong here."
        : `Passive activity ${i} (when passiveActivities ≥ ${i}): rental_active, rental, business, business_sp, ptp or former_passive — as for passiveActivity1Kind.`,
    // no default — an activity's kind is never guessed
  },
  {
    id: `passiveActivity${i}Income`,
    type: "money",
    min: "0",
    description:
      i === 1
        ? "Passive activity 1: current-year NET INCOME from the activity's ordinary items (Schedule E line 21 or K-1 boxes 1–3 net, Schedule C/F net profit), after the basis and at-risk limits — Form 8582 Part IV/V column (a) without any gain on disposition (enter that in DispositionGain). Zero if the activity had a net loss. In dollars."
        : `Passive activity ${i}: current-year net income from its ordinary items (Form 8582 column (a) without gains on disposition). In dollars.`,
    default: { value: "0", rationale: `Assumed no current-year net income from passive activity ${i}` },
  },
  {
    id: `passiveActivity${i}Loss`,
    type: "money",
    min: "0",
    description:
      i === 1
        ? "Passive activity 1: current-year NET LOSS from the activity's ordinary items, as a positive number, after the basis (§ 704(d), § 1366(d)) and at-risk (§ 465) limits — Form 8582 Part IV/V column (b) without any loss on disposition (enter that in DispositionLoss). Zero if the activity had net income. In dollars."
        : `Passive activity ${i}: current-year net loss from its ordinary items, positive (Form 8582 column (b) without losses on disposition). In dollars.`,
    default: { value: "0", rationale: `Assumed no current-year net loss from passive activity ${i}` },
  },
  {
    id: `passiveActivity${i}PriorUnallowed`,
    type: "money",
    min: "0",
    description:
      i === 1
        ? "Passive activity 1: its prior years' unallowed losses carried to this year, positive (§ 469(b); last year's Form 8582 Part VII column (c) or Part VIII column (b) for this activity). For a rental_active activity, only losses from years you actively participated in: losses from other years go in a separate activity of kind rental (Form 8582 instructions, Part IV column (c)). Next year's amount is us.federal.passive.activity1.unallowed. In dollars."
        : `Passive activity ${i}: prior years' unallowed losses carried to this year, positive (last year's Form 8582 Part VII column (c)). Next year's amount is us.federal.passive.activity${i}.unallowed. In dollars.`,
    default: { value: "0", rationale: `Assumed no prior-year unallowed losses from passive activity ${i}` },
  },
  {
    id: `passiveActivity${i}DispositionGain`,
    type: "money",
    min: "0",
    description:
      i === 1
        ? "Passive activity 1: gain this year from disposing of property used in the activity or of an interest in it, which you ALSO entered in the capital-gain facts (Form 8949) or as a business property (Form 4797). Counted only as passive income on Form 8582 (column (a)) and in the overall gain or loss; it is not added to income again. In dollars."
        : `Passive activity ${i}: gain from disposing of its property or an interest in it, also entered in the capital-gain facts (Form 8582 column (a) only). In dollars.`,
    default: { value: "0", rationale: `Assumed no gain on disposition in passive activity ${i}` },
  },
  {
    id: `passiveActivity${i}DispositionLoss`,
    type: "money",
    min: "0",
    description:
      i === 1
        ? "Passive activity 1: loss this year from disposing of property used in the activity or of an interest in it, positive, which you ALSO entered in the capital-loss facts. Counted only in Form 8582 column (b) and the overall gain or loss. If part of the activity's losses ends up disallowed, the split between Schedule E and Form 8949/4797 (Form 8582 Part IX) is refused. In dollars."
        : `Passive activity ${i}: loss from disposing of its property or an interest in it, positive, also entered in the capital-loss facts (Form 8582 column (b) only). In dollars.`,
    default: { value: "0", rationale: `Assumed no loss on disposition in passive activity ${i}` },
  },
  {
    id: `passiveActivity${i}Disposition`,
    type: "enum",
    enumValues: [...PASSIVE_DISPOSITIONS],
    description:
      i === 1
        ? "Passive activity 1: none; entire_taxable = you disposed of your ENTIRE interest this year to an unrelated person in a fully taxable transaction (§ 469(g)(1)(A)) — with an overall loss every loss of the activity is allowed and nonpassive; with an overall gain it stays on Form 8582; installment = an entire disposition reported on the installment method (refused); other = a gift, a transfer at death or a sale to a related person (refused). Selling part of an interest is none (its gain or loss is ordinary activity income or loss)."
        : `Passive activity ${i}: none, entire_taxable, installment or other — as for passiveActivity1Disposition.`,
    default: { value: "none", rationale: `Assumed passive activity ${i} was not disposed of this year` },
  },
  {
    id: `passiveActivity${i}Qbi`,
    type: "bool",
    description:
      i === 1
        ? "Passive activity 1 is a qualified trade or business for § 199A (a passive K-1 business; a rental only if it rises to a § 162 trade or business or meets the Rev. Proc. 2019-38 safe harbor). Its ordinary result, prior-year losses allowed this year included (Reg. § 1.199A-3(b)(1)(iv)), joins the main business's QBI — above the threshold, list it as a separate business (qbiBusinessN) for its own W-2 wage and UBIA limit. It is not active QBI for the § 199A(i) minimum. Asked when the activity's result is not zero."
        : `Passive activity ${i} is a qualified trade or business for § 199A — as for passiveActivity1Qbi. Asked when its result is not zero.`,
    // no default — whether an activity is a qualified trade or business is never guessed
  },
  {
    id: `passiveActivity${i}Credit`,
    type: "money",
    min: "0",
    description:
      i === 1
        ? "Passive activity 1: its current-year general business credit (Form 3800 Part III column (d) — e.g. a K-1 box 15 rehabilitation, low-income housing, research or energy credit, after the credit's own form), limited by Form 8582-CR. One credit type per activity: an activity with two types of credit takes a second activity row with the same kind and no income or loss. In dollars."
        : `Passive activity ${i}: its current-year general business credit (Form 8582-CR column (a)). In dollars.`,
    default: { value: "0", rationale: `Assumed no current-year credit from passive activity ${i}` },
  },
  {
    id: `passiveActivity${i}PriorUnallowedCredit`,
    type: "money",
    min: "0",
    description:
      i === 1
        ? "Passive activity 1: its prior years' unallowed passive credits carried to this year (last year's Form 8582-CR Worksheet 9 column (b), or line 5 − line 37 with one credit). Unlike losses, they are not freed when the activity is sold (§ 469(g) covers losses only; the Part VI basis election is not modeled). Next year's amount is us.federal.passive_credit.activity1.unallowed. In dollars."
        : `Passive activity ${i}: prior years' unallowed passive credits carried to this year (Form 8582-CR column (b)). Next year's amount is us.federal.passive_credit.activity${i}.unallowed. In dollars.`,
    default: { value: "0", rationale: `Assumed no prior-year unallowed credits from passive activity ${i}` },
  },
  {
    id: `passiveActivity${i}CreditType`,
    type: "enum",
    enumValues: [...PASSIVE_CREDIT_TYPES],
    description:
      i === 1
        ? "Passive activity 1's credit, for Form 8582-CR: rehabilitation = the § 47 rehabilitation credit (from rental real estate it uses the special allowance phased out from $200,000 to $250,000, Worksheet 2; from a business it is Worksheet 4); lihc_pre1990 = a low-income housing credit for property placed in service before 1990 or through a pass-through interest acquired before 1990 (Worksheet 2); lihc_post1989 = any other low-income housing credit (Worksheet 3, no modified AGI limit); general = every other credit (Worksheet 1 from rental real estate with active participation, else Worksheet 4). Asked when the activity has a credit."
        : `Passive activity ${i}'s credit type: general, rehabilitation, lihc_pre1990 or lihc_post1989 — as for passiveActivity1CreditType.`,
    // no default — asked when the activity has a credit
  },
  {
    id: `passiveActivity${i}CreditSpecified`,
    type: "bool",
    description:
      i === 1
        ? "Passive activity 1's credit is a § 38(c)(4)(B) specified credit, allowed against the tentative minimum tax (Form 3800 Part III line 4): e.g. the low-income housing credit for buildings placed in service after 2007, the rehabilitation credit for expenditures after 2007, the § 48 energy credit, the work opportunity credit, the § 45R small employer health insurance credit, an eligible small business's research credit. Otherwise Part III line 1. Asked when the activity has a credit."
        : `Passive activity ${i}'s credit is a § 38(c)(4)(B) specified credit (Form 3800 Part III line 4). Asked when the activity has a credit.`,
    // no default — asked when the activity has a credit
  },
  {
    id: `passiveActivity${i}PriorUnallowedPre2018`,
    type: "money",
    min: "0",
    description:
      i === 1
        ? "Passive activity 1: the part of its prior-year unallowed losses suspended in taxable years ending before 2018 — never QBI (Reg. § 1.199A-3(b)(1)(iv)). With a QBI-flagged activity and some of its losses allowed, a nonzero amount is refused (the first-in, first-out split is not modeled). In dollars."
        : `Passive activity ${i}: the part of its prior-year unallowed losses suspended before 2018 (QBI). In dollars.`,
    default: { value: "0", rationale: `Assumed passive activity ${i} has no losses suspended before 2018` },
  },
];

export const generalBusinessCreditFacts: FactSpec[] = [
  {
    id: "generalBusinessCreditNonpassive",
    type: "money",
    min: "0",
    description:
      "Current-year general business credits NOT from passive activities and not specified credits — Form 3800 Part III line 2, column (e): the total of the component credit forms (e.g. Form 6765 research credit of a business that is not an eligible small business, Form 8881, Form 8994, Form 8826), each after its own limits. Passive activities' credits go on the activity (passiveActivityNCredit). In dollars.",
    default: { value: "0", rationale: "Assumed no nonpassive general business credit" },
  },
  {
    id: "specifiedCreditNonpassive",
    type: "money",
    min: "0",
    description:
      "Current-year § 38(c)(4)(B) specified credits NOT from passive activities — Form 3800 Part III line 5, column (e): credits allowed against the tentative minimum tax (e.g. the work opportunity credit, § 45R small employer health insurance credit, an eligible small business's research credit, the § 48 energy credit, the low-income housing credit for post-2007 buildings). In dollars.",
    default: { value: "0", rationale: "Assumed no nonpassive specified credit" },
  },
  {
    id: "generalBusinessCreditCarryforward",
    type: "money",
    min: "0",
    description:
      "Carryforwards to this year of general business credits unused in earlier years under the § 38(c) limit (§ 39) that are not specified credits — Form 3800 Part I line 4 (Part IV line 6, column (f)). Passive credits disallowed by § 469 are not this: they stay on their activity (passiveActivityNPriorUnallowedCredit). In dollars.",
    default: { value: "0", rationale: "Assumed no general business credit carryforward" },
  },
  {
    id: "specifiedCreditCarryforward",
    type: "money",
    min: "0",
    description:
      "Carryforwards to this year of unused specified credits (§ 39) — Form 3800 Part II line 34 (Part IV line 5, column (f)). In dollars.",
    default: { value: "0", rationale: "Assumed no specified credit carryforward" },
  },
  {
    id: "spouseHasBusinessCredit",
    type: "bool",
    description:
      "Married filing separately: the spouse has a general business credit for the year, or a carryforward or carryback to it (§ 38(c)(6)(A)). If so, the $25,000 in Form 3800 line 13 is $12,500. Asked of a married person filing separately with a business credit.",
    // no default — asked only when it matters
  },
];

export const passiveActivityFacts: FactSpec[] = [
  {
    id: "passiveActivities",
    type: "int",
    min: "0",
    max: String(PASSIVE_ACTIVITY_SLOTS),
    description:
      "How many passive activities to enter (0–8), each in passiveActivity1… through passiveActivity8… (Form 8582, one activity per row; Reg. § 1.469-4 grouping as you report it). The engine applies § 469: income absorbs losses, the $25,000 special allowance for actively managed rental real estate phases out from $100,000 of modified AGI, the disallowed loss is spread over the loss activities in proportion (Parts VI–VIII) and carried forward per activity (us.federal.passive.activityN.unallowed), and an entire disposition frees the activity's losses. Each activity's result then flows into AGI (Schedule E/C/F), net investment income, QBI, the excess business loss and the EITC investment income test. Do not also net these amounts into scheduleENetIncome, k1OrdinaryBusinessIncome or the standalone passiveActivityIncome/passiveActivityLosses facts. Not computed: a general partner's self-employment tax on a passive share, and the AMT's refigured passive loss (Form 6251 line 2m — a positive difference goes in amtOtherPreferences; a negative one is not modeled).",
    default: { value: "0", rationale: "Assumed no passive activities absent contrary input" },
  },
  ...Array.from({ length: PASSIVE_ACTIVITY_SLOTS }, (_, k) => slot(k + 1)).flat(),
];
