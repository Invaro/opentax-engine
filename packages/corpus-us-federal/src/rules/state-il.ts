import type { Rule } from "@invaro/opentax-core";
import { fact, ruleRef } from "./state-helpers.js";

export const ilRules: Rule[] = [
  {
    id: "us.il.income_tax",
    version: 3, // v1 lacked the age/blind exemptions, AGI caps, ICR/1299-C credit parameters, and line 9/11 floors; v2 (unlabeled) preceded this comment; v3 cross-references us.il.eitc for the 18-24/65+ childless age-decoupling (35 ILCS 5/212(b-5)/(b-10)) — the flat "20% of federal EITC" line below is INCOMPLETE for that population
    jurisdiction: "us.il",
    title: "Illinois income tax — flat 4.95% of net income (IL-1040 line 12)",
    citation: {
      source: "35 ILCS 5/201(b)(5.4); 2025 Form IL-1040 instructions",
      section: "IL-1040 line 12",
      url: "https://tax.illinois.gov/content/dam/soi/en/web/tax/forms/incometax/documents/currentyear/individual/il-1040-instr.pdf",
      excerpt:
        "Residents: Multiply Line 11 by 4.95% (.0495). Cannot be less than zero (2025 IL-1040 line 12, verbatim). LINE FLOORS (2025 instructions): line 9 base income AND line 11 net income 'may not be less than zero — if the result is a negative number, enter 0'. Related 2025 parameters (IDOR 2025 IL-1040 + Schedule ICR + Schedule 1299-C instructions + Pub-132, web-verified July 2026): exemption allowance $2,850 per exemption PLUS $1,000 per age-65+ box and $1,000 per blind box (taxpayer/spouse, per box — 65 AND blind = $2,000); the ENTIRE line 10 allowance is $0 if federal AGI exceeds $500,000 MFJ / $250,000 all others. Schedule ICR (nonrefundable, total cannot exceed tax due, same AGI caps): property tax credit = 5% of IL property tax on the principal residence (exclude business-use portion); K-12 education expense credit = 25% of qualified expenses OVER $250, max $750 — HOME-SCHOOL expenses are NOT qualified (35 ILCS 5/201(m): public/nonpublic school tuition, book and lab fees only; exclude school_type home entries before summing). Schedule 1299-C K-12 Instructional Materials & Supplies credit (900+ hour educators): up to $500 ($1,000 MFJ both educators). Illinois EITC = 20% of the federal EITC (refundable) — BUT for a taxpayer age 18-24 or 65+ with NO qualifying children, 35 ILCS 5/212(b-5)/(b-10) (P.A. 102-700) decouples from the federal § 32(c)(1)(A)(ii) childless age floor: use the us.il.eitc target (20% of us.federal.eitc_no_age_gate) instead of 20% x the ordinary federal EITC, which is correctly $0 for that population and would understate line 29. Illinois Child Tax Credit (TY2025) = 40% of the Illinois EITC for taxpayers with a dependent child under 12. [Input: IL net income (line 11 — base income minus exemptions), computed by the preparer; worked example: 30,485 × 4.95% = 1,509.] ESTIMATED TAX (IL-2210, 2025): required if IL tax after withholding/credits will exceed $1,000. SCHEDULE NR: part-year and nonresidents apportion base income on Schedule NR — this target computes RESIDENT tax on already-apportioned net income only; the Schedule NR apportionment worksheet itself is not modeled (refuses/agent-composed).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      exemptionAllowance: { value: "285000", type: "money" }, // $2,850 (2025)
      exemptionAge65: { value: "100000", type: "money" }, // $1,000 per box
      exemptionBlind: { value: "100000", type: "money" }, // $1,000 per box
      exemptionAgiCapJoint: { value: "50000000", type: "money" }, // $500,000
      exemptionAgiCapOther: { value: "25000000", type: "money" }, // $250,000
      propertyTaxCreditPct: { value: "5", type: "int" },
      k12CreditPct: { value: "25", type: "int" },
      k12ExpenseFloor: { value: "25000", type: "money" }, // first $250 excluded
      k12CreditMax: { value: "75000", type: "money" }, // $750
      teacherMaterialsCreditMax: { value: "50000", type: "money" }, // $500 ($1,000 MFJ both)
      eicPctOfFederal: { value: "20", type: "int" },
      ctcPctOfIlEic: { value: "40", type: "int" },
      estimatedTaxThreshold: { value: "100000", type: "money" }, // $1,000 (IL-2210)
    },
    formula: {
      kind: "mulRate",
      base: { kind: "max0", arg: fact("stateTaxableIncome") },
      rate: { num: "495", den: "10000" },
      round: "half-up",
    },
  },
  {
    id: "us.il.eitc",
    version: 1,
    jurisdiction: "us.il",
    title: "Illinois Earned Income Credit — age-decoupled from the federal childless age gate (35 ILCS 5/212(a)(vi), (b-5), (b-10))",
    citation: {
      source: "35 ILCS 5/212; 2025 Schedule IL-E/EITC instructions (R-12/25); Illinois Pub. 132 (2025)",
      section: "35 ILCS 5/212(a)(vi), (b-5), (b-10)",
      url: "https://www.ilga.gov/legislation/ilcs/fulltext.asp?DocName=003500050K212",
      excerpt:
        "35 ILCS 5/212(a)(vi), verbatim: each individual taxpayer is entitled to a credit of '20% of the federal tax credit for each taxable year beginning on or after January 1, 2023.' DECOUPLING (verbatim, unmodified since P.A. 102-700, eff. 4-19-22 — confirmed current for TY2025, R-12/25 revision stamp): '(b-5) ... each individual taxpayer who has attained the age of 18 ... but has not yet attained the age of 25 is entitled to the credit under paragraph (a) based on the federal tax credit for which the taxpayer would have been eligible without regard to any age requirements that would otherwise apply to individuals without a qualifying child in Section 32(c)(1)(A)(ii) of the federal Internal Revenue Code.' '(b-10) ... each individual taxpayer who has attained the age of 65 or older ... is entitled to the credit under paragraph (a) based on the federal tax credit for which the taxpayer would have been eligible without regard to any age requirements ... in Section 32(c)(1)(A)(ii).' MECHANICS (Schedule IL-E/EITC 2025, Step 4 / Illinois Expanded EITC Worksheet Part 6, verbatim): 'Multiply the amount on Line 6 by 20% (0.2)' where Line 6 is 'the amount of federal Earned Income Tax Credit ... or the amount from the Illinois Expanded EITC Worksheet' — for an 18-24 or 65+ CHILDLESS filer, Line 6 is NOT the (correctly $0) ordinary federal EITC but the EIC-Table/AGI 'smaller of' amount the filer WOULD have received absent the § 32(c)(1)(A)(ii) age floor, i.e. this rule = 20% x us.federal.eitc_no_age_gate. A filer WITH qualifying children, or a childless filer already 25-64, gets the identical answer either way (the no-age-gate rule and the ordinary federal EITC agree outside the decoupled population) — this target is safe to use for ALL Illinois EITC claimants, not just the 18-24/65+ childless group. Nonresident/part-year apportionment (Schedule IL-E/EITC line 8 decimal) is NOT applied here (parameters-only elsewhere); apply it to this rule's answer if claiming a part-year/nonresident return.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      pctOfFederal: { value: "20", type: "int" },
    },
    formula: {
      kind: "roundToDollar",
      value: {
        kind: "mulRate",
        base: ruleRef("us.federal.eitc_no_age_gate"),
        rate: { num: "20", den: "100" },
        round: "half-up",
      },
      mode: "half-up",
    },
  },
  {
    id: "us.il.subtractions",
    version: 1,
    jurisdiction: "us.il",
    title:
      "Illinois Schedule M — retirement-income subtraction (line 5) and related AGI modifications (35 ILCS 5/203(a)(2))",
    citation: {
      source: "35 ILCS 5/203(a)(2); 2025 Form IL-1040 instructions (Schedule M line instructions); Publication 120, Retirement Income",
      section: "IL-1040 lines 2, 5, 6, 7; Schedule M line 22",
      url: "https://tax.illinois.gov/content/dam/soi/en/web/tax/research/publications/pubs/documents/pub-120.pdf",
      excerpt:
        "LINE 5 (verbatim, 2025 IL-1040 instructions), 'Social Security benefits and certain retirement plans': 'Enter the amount of federally taxed Social Security and retirement income included in your adjusted gross income on Form IL-1040, Line 1 that you received from qualified employee benefit plans (including railroad retirement and 401(K) plans) and Individual Retirement Accounts or self-employed retirement plans reported on federal Form 1040 or 1040-SR, Line 4b and 5b; Social Security and railroad retirement benefits reported on federal Form 1040 or 1040-SR, Line 6b; government retirement and government disability plans and group term life insurance premiums paid by a qualified retirement plan reported as wages… Line 1z; state or local government deferred compensation plans… Line 1z and 5b; certain capital gains on employer securities… Line 7a.' SCOPE: ALL federally-taxed retirement income is subtracted, Social Security INCLUDED inside line 5 (not a separate line) — exclusions per Publication 120: third-party sick pay, non-government disability income, and Form 4972 lump-sum-distribution averaging amounts are NOT subtractable. LINE 2 addition (verbatim): 'Enter the amount of federally tax-exempt interest and dividend income reported on federal Form 1040… Line 2a.' LINE 6 CORRECTION: line 6 is the ILLINOIS income tax overpayment (a subtraction of last year's state refund), NOT US-government interest — US Treasury/agency obligation interest is a DIFFERENT item, entered on Schedule M line 22 and carried to IL-1040 LINE 7 'other subtractions' (35 ILCS 5/203(a)(2)(N)); do not put US-govt interest on line 6. 2025 Schedule M NEW line 18: medical debt relief subtraction (medical debt cancelled/forgiven and included in federal AGI). Parameters-only: no oracle formula — these are Schedule M/1040-line transcription facts, agent-composed onto IL-1040 lines 2/5/7.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: IL Schedule M subtractions/additions are agent-transcribed from federal Form 1040/Schedule 1 line references cited above — no formula to evaluate; use lookup_tax_parameter / read the citation",
    },
  },
  {
    id: "us.il.use_tax",
    version: 1,
    jurisdiction: "us.il",
    title: "Illinois Use Tax (UT) Table — estimated liability by AGI when no purchase records exist (IL-1040 line 21)",
    citation: {
      source: "35 ILCS 105/3-10; 2025 Form IL-1040 instructions, Use Tax (UT) Table",
      section: "IL-1040 line 21; UT Table",
      url: "https://tax.illinois.gov/content/dam/soi/en/web/tax/forms/incometax/documents/currentyear/individual/il-1040-instr.pdf",
      excerpt:
        "'If you had no major purchases and you do not have receipts to figure your purchases, use this table to estimate your annual Illinois Use Tax liability.' AGI (from Form IL-1040, Line 1) → Use Tax (2025 UT Table, verbatim): $0–$10,000 → $3; $10,001–$20,000 → $8; $20,001–$30,000 → $13; $30,001–$40,000 → $18; $40,001–$50,000 → $23; $50,001–$75,000 → $31; $75,001–$100,000 → $44; above $100,000 → AGI × 0.05% (0.0005). This is the NO-RECEIPTS ESTIMATE only — a taxpayer with actual purchase records instead completes the UT Worksheet (6.25% general merchandise / 1% qualifying food-drug-medical, less other-state sales tax paid), which is a different (higher-precision) computation not modeled here. Note: if annual use tax liability exceeds $600 ($1,200 MFJ), Form ST-44 must be filed separately (the $1,000-flat rows below the ST-44 threshold are unaffected by this rule).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      tier1Max: { value: "1000000", type: "money" }, // $10,000
      tier2Max: { value: "2000000", type: "money" }, // $20,000
      tier3Max: { value: "3000000", type: "money" }, // $30,000
      tier4Max: { value: "4000000", type: "money" }, // $40,000
      tier5Max: { value: "5000000", type: "money" }, // $50,000
      tier6Max: { value: "7500000", type: "money" }, // $75,000
      tier7Max: { value: "10000000", type: "money" }, // $100,000
      tier1Tax: { value: "300", type: "money" }, // $3
      tier2Tax: { value: "800", type: "money" }, // $8
      tier3Tax: { value: "1300", type: "money" }, // $13
      tier4Tax: { value: "1800", type: "money" }, // $18
      tier5Tax: { value: "2300", type: "money" }, // $23
      tier6Tax: { value: "3100", type: "money" }, // $31
      tier7Tax: { value: "4400", type: "money" }, // $44
    },
    formula: {
      kind: "if",
      cond: { kind: "cmp", op: "le", left: ruleRef("us.federal.agi"), right: { kind: "param", name: "tier1Max" } },
      then: { kind: "param", name: "tier1Tax" },
      else: {
        kind: "if",
        cond: { kind: "cmp", op: "le", left: ruleRef("us.federal.agi"), right: { kind: "param", name: "tier2Max" } },
        then: { kind: "param", name: "tier2Tax" },
        else: {
          kind: "if",
          cond: { kind: "cmp", op: "le", left: ruleRef("us.federal.agi"), right: { kind: "param", name: "tier3Max" } },
          then: { kind: "param", name: "tier3Tax" },
          else: {
            kind: "if",
            cond: { kind: "cmp", op: "le", left: ruleRef("us.federal.agi"), right: { kind: "param", name: "tier4Max" } },
            then: { kind: "param", name: "tier4Tax" },
            else: {
              kind: "if",
              cond: { kind: "cmp", op: "le", left: ruleRef("us.federal.agi"), right: { kind: "param", name: "tier5Max" } },
              then: { kind: "param", name: "tier5Tax" },
              else: {
                kind: "if",
                cond: { kind: "cmp", op: "le", left: ruleRef("us.federal.agi"), right: { kind: "param", name: "tier6Max" } },
                then: { kind: "param", name: "tier6Tax" },
                else: {
                  kind: "if",
                  cond: { kind: "cmp", op: "le", left: ruleRef("us.federal.agi"), right: { kind: "param", name: "tier7Max" } },
                  then: { kind: "param", name: "tier7Tax" },
                  else: {
                    kind: "roundToDollar",
                    value: { kind: "mulRate", base: ruleRef("us.federal.agi"), rate: { num: "5", den: "10000" }, round: "half-up" },
                    mode: "half-up",
                  },
                },
              },
            },
          },
        },
      },
    },
  },
];
