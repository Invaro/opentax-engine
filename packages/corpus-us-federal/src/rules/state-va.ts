import type { Rule } from "@invaro/opentax-core";
import { fact } from "./state-helpers.js";

export const vaRules: Rule[] = [
  {
    id: "us.va.income_tax",
    version: 3, // v1 used the raw rate schedule with half-up rounding; v2 encodes the VA Tax Table convention; v3 bounds the table at its printed $100,000 ceiling — at/above it the rate schedule (half-up) applies per the form's own method instruction
    jurisdiction: "us.va",
    title: "Virginia income tax — Va. Code § 58.1-320 via the VA Tax Table convention (Form 760 line 16)",
    citation: {
      source: "Va. Code § 58.1-320; 2025 Form 760 instructions (tax.virginia.gov PDF)",
      section: "§ 58.1-320; Form 760 line 16",
      url: "https://www.tax.virginia.gov/sites/default/files/vatax-pdf/2025-760-instructions.pdf",
      excerpt:
        "2% on the first $3,000; 3% over $3,000 to $5,000; 5% over $5,000 to $17,000; 5.75% over $17,000 (Va. Code § 58.1-320, single schedule for all statuses). THE TABLE CONVENTION (this rule's default): the published VA Tax Table's rows are back-solved from clean whole-dollar tax increments — $2 per row above $5,000 on an ODD-dollar grid — so table tax = the nearest odd dollar to the rate-schedule value (ties up); verified against the printed row 44,026–44,061 → $2,275 (2024/2023 booklets; the 2025 booklet points to the same online table). useFormulaMethod=true gives the raw schedule with half-up rounding instead (the 2025 instructions' own $90,000 example: 4,917.50 → 4,918). Related 2025 parameters (2025 Form 760 instructions, web-verified July 2026): standard deduction $8,750 single/MFS / $17,500 MFJ (TY2025–2026, see us.va.standard_deduction for the enacted TY2027+ windows); exemption $930/person + $800 each age-65-or-blind (taxpayer/spouse only); AGE DEDUCTION (Va. Code § 58.1-322.03(2)): $12,000 per person 65+, UNREDUCED if born on/before 1/1/1939, else reduced $1-for-$1 by AFAGI over $50,000 single / $75,000 married (joint AFAGI); Credit for Low Income Individuals: $300 × (personal + dependent exemptions, EXCLUDING 65/blind extras), nonrefundable, gated on family VAGI ≤ poverty guideline (2025: $15,650 for 1 + $5,500 each additional person) — mutually exclusive with the Virginia EITC; Virginia EITC 2025: 20% of federal EITC, REFUNDABLE at 20% for TY2025–2029 (Va. Code § 58.1-339.8, as amended by the 2026 Appropriation Act — the refundable 20% rate was extended through TY2029, superseding the earlier TY2026 sunset; do not use the stale 15% or a TY2026 cutoff) or nonrefundable 20%. VA has no HOH status: federal HOH files as single-column. NONRESIDENT/PART-YEAR RETURNS: Form 763 (nonresident) and 760PY (part-year) compute Virginia-source-income allocation on their own worksheets — NOT modeled here (refuses/agent-composed); this target is the RESIDENT Form 760 computation on already-determined Virginia taxable income only. [Input: Virginia taxable income (Form 760 line 15); worked examples: tax(44,060) = 2,275 (table); tax(34,030) = 1,699 (both methods agree).]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      standardDeductionSingle: { value: "875000", type: "money" }, // $8,750
      standardDeductionJoint: { value: "1750000", type: "money" }, // $17,500
      exemptionPerPerson: { value: "93000", type: "money" }, // $930
      exemptionAge65OrBlind: { value: "80000", type: "money" }, // $800
      ageDeductionBase: { value: "1200000", type: "money" }, // $12,000
      ageDeductionThresholdSingle: { value: "5000000", type: "money" }, // $50,000 AFAGI
      ageDeductionThresholdMarried: { value: "7500000", type: "money" }, // $75,000 AFAGI
      lowIncomeCreditPerExemption: { value: "30000", type: "money" }, // $300
      povertyGuidelineFirstPerson: { value: "1565000", type: "money" }, // $15,650 (2025)
      povertyGuidelinePerAdditional: { value: "550000", type: "money" }, // $5,500
      eicPctOfFederal: { value: "20", type: "int" },
      eicRefundablePctOfFederal: { value: "20", type: "int" }, // TY2025-2029 (was 15%, extended by 2026 Appropriation Act)
    },
    formula: {
      kind: "if",
      cond: fact("useFormulaMethod"),
      then: {
        kind: "roundToDollar",
        value: {
          kind: "brackets",
          base: { kind: "max0", arg: fact("stateTaxableIncome") },
          table: [
            { threshold: "0", rate: { num: "2", den: "100" } },
            { threshold: "300000", rate: { num: "3", den: "100" } },
            { threshold: "500000", rate: { num: "5", den: "100" } },
            { threshold: "1700000", rate: { num: "575", den: "10000" } },
          ],
        },
        mode: "half-up",
      },
      else: {
        kind: "if",
        // $1-step table rows below $5,000 taxable income: nearest dollar
        cond: {
          kind: "cmp",
          op: "le",
          left: { kind: "max0", arg: fact("stateTaxableIncome") },
          right: { kind: "money", cents: "500000" },
        },
        then: {
          kind: "roundToDollar",
          value: {
            kind: "brackets",
            base: { kind: "max0", arg: fact("stateTaxableIncome") },
            table: [
              { threshold: "0", rate: { num: "2", den: "100" } },
              { threshold: "300000", rate: { num: "3", den: "100" } },
            ],
          },
          mode: "half-up",
        },
        // the printed VA Tax Table ends at $100,000 taxable income — at or
        // above it the form's own instruction is the RATE SCHEDULE, exact and
        // rounded to the nearest dollar (worked example: 440,857 →
        // 25,092, the half-up schedule value, NOT the $2-grid's 25,091)
        else: {
          kind: "if",
          cond: {
            kind: "cmp",
            op: "ge",
            left: { kind: "max0", arg: fact("stateTaxableIncome") },
            right: { kind: "money", cents: "10000000" }, // $100,000
          },
          then: {
            kind: "roundToDollar",
            value: {
              kind: "brackets",
              base: { kind: "max0", arg: fact("stateTaxableIncome") },
              table: [
                { threshold: "0", rate: { num: "2", den: "100" } },
                { threshold: "300000", rate: { num: "3", den: "100" } },
                { threshold: "500000", rate: { num: "5", den: "100" } },
                { threshold: "1700000", rate: { num: "575", den: "10000" } },
              ],
            },
            mode: "half-up",
          },
          // $2-step table rows $5,000-$100,000 on the odd-dollar grid: T = 2·⌊u/2⌋ + 1
          else: {
            kind: "add",
            args: [
              {
                kind: "mulInt",
                base: { kind: "money", cents: "200" }, // $2
                count: {
                  kind: "stepUnits",
                  value: {
                    kind: "brackets",
                    base: { kind: "max0", arg: fact("stateTaxableIncome") },
                    table: [
                      { threshold: "0", rate: { num: "2", den: "100" } },
                      { threshold: "300000", rate: { num: "3", den: "100" } },
                      { threshold: "500000", rate: { num: "5", den: "100" } },
                      { threshold: "1700000", rate: { num: "575", den: "10000" } },
                    ],
                  },
                  unitCents: "200", // $2 grid
                  mode: "floor",
                },
              },
              { kind: "money", cents: "100" }, // + $1 → odd-dollar grid
            ],
          },
        },
      },
    },
  },
  {
    id: "us.va.subtractions",
    version: 1,
    jurisdiction: "us.va",
    title: "Virginia Form 760 subtractions (Va. Code § 58.1-322.02) — state refund, US govt interest, Social Security, 529, military, National Guard",
    citation: {
      source: "Va. Code § 58.1-322.02; 2025 Form 760 instructions",
      section: "§ 58.1-322.02; Form 760 lines 6-8",
      url: "https://www.tax.virginia.gov/sites/default/files/vatax-pdf/2025-760-instructions.pdf",
      excerpt:
        "2025 Virginia subtractions (§ 58.1-322.02, web-verified July 2026): state income tax refund (included in federal AGI, not taxable to VA); interest on US government obligations (Treasury bills/notes/bonds — federal law bars state taxation); Social Security and Tier 1 railroad retirement benefits, FULLY (§ 58.1-322.02(1) — VA does not conform to the federal 0/50/85% inclusion, all of it is subtracted); Virginia529/ABLE contributions up to $4,000 PER ACCOUNT per year (excess carries forward indefinitely), UNLIMITED (no $4,000 cap) if the account owner is age 70 or older; military benefits subtraction up to $40,000 (2025 and later — the age-55-or-older gate that applied through TY2023 was repealed; available regardless of age); Virginia National Guard income subtraction = the LESSER of (a) basic pay for up to 39 calendar days of service, or (b) $5,500, available only to a member whose grade is O-6 (colonel) or below. Parameters-only: agent-transcribed onto Form 760 lines 6-8 (Schedule ADJ where applicable) from the federal-return line references above.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      section529PerAccount: { value: "400000", type: "money" }, // $4,000/account (unlimited if owner 70+)
      militaryBenefitsMax: { value: "4000000", type: "money" }, // $40,000 (2025+, no age gate)
      nationalGuardMaxDays: { value: "39", type: "int" },
      nationalGuardMax: { value: "550000", type: "money" }, // $5,500
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: VA Form 760 subtractions (state refund, US govt interest, Social Security, 529, military, National Guard) are agent-transcribed per the citation above — no formula to evaluate; use lookup_tax_parameter",
    },
  },
  {
    id: "us.va.spouse_tax_adjustment",
    version: 2, // v1 stated only the gating conditions and the $259 cap, disclosing the per-spouse allocation as agent-composed/form-published with no further prescription; v2 carries the COMPLETE verbatim worksheet (Parts 1-2 of the STA worksheet, the Separate-VAGI worksheet steps 1-2, and the age-deduction 50/50 split rule) so the allocation is fully prescribed income-source attribution, not an agent-invented ratio — 2025 Form 760 instructions p.12-13, web-verified July 2026
    jurisdiction: "us.va",
    title: "Virginia Spouse Tax Adjustment (Va. Code § 58.1-320, STA worksheet) — up to $259, MFJ only",
    citation: {
      source: "Va. Code § 58.1-320; 2025 Form 760 instructions, Spouse Tax Adjustment worksheet (p.12-13)",
      section: "Form 760 line 17",
      url: "https://www.tax.virginia.gov/sites/default/files/vatax-pdf/2025-760-instructions.pdf",
      excerpt:
        "2025 Spouse Tax Adjustment (STA): available ONLY on a joint (MFJ) return where BOTH spouses have income and their COMBINED Virginia taxable income exceeds $3,000; maximum credit $259 (footer statement + Line 5 shortcut, both confirmed in the TY2025 booklet). NARRATIVE (p.13, verbatim): 'Couples filing jointly under Filing Status 2 may reduce their tax by up to $259 with the STA if both have taxable income to report and their combined taxable income on Line 15 is more than $3,000 ... Using the STA, couples filing joint returns will not pay higher taxes than if they had filed separate returns.' HOW IT WORKS (verbatim): 'Virginia tax rates increase with income: 2% up to $3,000; 3% from $3,001 to $5,000; 5% from $5,001 to $17,000; and 5.75% for income over $17,000. The STA lets both incomes reported on jointly filed returns benefit from the lower tax rates.'"
        + "\n\nTHE ALLOCATION IS PRESCRIBED, NOT DISCRETIONARY — built on income-SOURCE attribution, never a proportional wage-ratio or a benefit-maximizing choice. VERBATIM WORKSHEET, PART 1: SEPARATE YOUR INCOME AND EXEMPTIONS (per spouse): '1. Enter the portion of the Virginia Adjusted Gross Income (VAGI) on Line 9 of Form 760 that is related to each spouse. Use the worksheet at the bottom of the page to compute the separate VAGI for each spouse.' '2. Enter separate personal exemption amounts. Enter a 1 in the boxes that apply and multiply the total by $800. Add $930 to the total to compute the personal exemptions for you and spouse. You: 65 or over + Blind = Total x $800 + $930 = ___. Spouse: 65 or over + Blind = Total x $800 + $930 = ___.' (i.e., PER SPOUSE: $930 + $800 x that spouse's own 65-or-over/blind box count — a fixed formula, never proportional to income.) '3. Subtract Line 2 from Line 1. If either amount is 0 or less, stop here; you do not qualify for this credit.'"
        + "\n\nVERBATIM WORKSHEET, PART 2: CALCULATE YOUR TAX ADJUSTMENT: '4. Enter the taxable income from Line 15 on Form 760.' '5. Enter the smaller amount from Line 3 above. If this amount is larger than $17,000 and Line 4 is larger than $34,000, skip to Line 12 and enter $259 as the credit.' '6. Subtract Line 5 from Line 4 (if $0 or less, enter $0).' '7. Divide the amount on Line 4 by 2.' '8. Enter the tax on the smaller amount from Line 5 or Line 7. Refer to the tax table or rate schedule.' '9. Enter the tax on the larger amount from Line 6 or Line 7. Refer to the tax table or rate schedule.' (Lines 8-9 use us.va.income_tax's own rate schedule/table on the stated amount — NOT a fresh computation.) '10. Add Lines 8 and 9.' '11. Enter the tax from Line 16 on Form 760.' '12. TAX ADJUSTMENT: Subtract Line 10 from Line 11. Enter this amount on Line 17 of Form 760.' 'The Spouse Tax Adjustment cannot exceed $259.'"
        + "\n\nVERBATIM 'WORKSHEET FOR DETERMINING SEPARATE VIRGINIA ADJUSTED GROSS INCOME' (bottom of p.12) — feeds Part 1 Line 1 above: STEP 1 - Determine Separate Federal Adjusted Gross Income (You / Spouse columns, LITERAL income-source attribution — each spouse's OWN items, never a ratio): '1. Wages, salaries, etc. 2. Taxable interest and dividend income. 3. Taxable refunds, adjustments, or offsets of state and local income tax. 4. Business income. 5. Capital gains/losses and other gains/losses. 6. Taxable pensions, annuities, and IRA distributions. 7. Rents, royalties, partnerships, estates, trusts, etc. 8. Other income (farm income, taxable social security, etc.). 9. Gross income - add Lines 1 through 8. 10. Adjustments to gross income. 11. FAGI - subtract Line 10 from Line 9. (The total of both columns should equal your joint FAGI reported on your 1040)' STEP 2 - Determine Separate Virginia Adjusted Gross Income: '12. Total additions to FAGI (Form 760, Line 2). 13. Subtotal - add Lines 11 and 12. 14. Age Deduction (Form 760, Line 4). 15. Social Security Act and Tier 1 Railroad Retirement Act Benefits (Form 760, Line 5). 16. State income tax refund or overpayment credit reported as income on your federal return (Form 760, Line 6). 17. Other Subtractions (Form 760, Line 7). 18. Total Subtractions from FAGI - add Lines 14, 15, 16, and 17. 19. Subtract Line 18 from Line 13. These are your separate VAGI amounts to be used on Line 1 of the Spouse Tax Adjustment Worksheet. (The total of both columns should equal your combined VAGI reported on Line 9 of your 760)'"
        + "\n\nAGE DEDUCTION 50/50 SPLIT RULE (feeds Step 2 Line 14 above — the ONE genuinely joint item on this worksheet, verbatim): 'If both spouses are claiming an income-based age deduction, regardless of whether filing jointly or separately, the married taxpayers must compute a joint age deduction first, then allocate half of the joint deduction to each spouse.' (Compute the joint age deduction once via us.va.income_tax's ageDeductionBase/threshold parameters on COMBINED AFAGI, then split it exactly 50/50 — not proportional to either spouse's income or age-deduction eligibility share.)"
        + "\n\nOWNERSHIP ATTRIBUTION FOR STEP 1: a document belongs to the spouse the STRUCTURED INTAKE's ownership tag names (who_applies_to / whose-account fields: taxpayer | spouse | joint) — the intake tag CONTROLS over the name printed on the PDF (a 1099-B may print only the primary's name yet be intake-tagged joint). taxpayer/spouse-tagged items go WHOLE to that spouse; joint-tagged items (interest, dividends INCLUDING their capital-gain distributions, jointly-tagged 1099-Bs) split 50/50 with the ODD DOLLAR TO THE PRIMARY. Adjustments follow their owner: each spouse's own ½-SE-tax (from their own Schedule SE), own educator cap, and the student-loan interest to the named 1098-E borrower. (Worked example: primary = SchC 16,391 + own crypto LT 999 + joint splits 2,778 + 426 + 44 + 425 − ½SE 1,158 − SL 2,500 − educator 300 = 17,105; spouse = 55,123; STA = 245.)"
        + "\n\nSUMMARY OF WHAT IS AND ISN'T DISCRETIONARY: (1) Separate-VAGI Step 1 items are attributed by literal ownership (each spouse's own wages/interest/business/capital-gain/pension/rent/other-income line, cross-checked to equal the joint FAGI). (2) Personal exemptions use the fixed $930+$800-per-box formula, per spouse — NOT proportional to income. (3) The age deduction (a genuinely joint item) is computed once, jointly, then split EXACTLY 50/50 — not proportional to either spouse's income or share of the joint deduction. (4) The standard/itemized deduction is NEVER split on this worksheet — VAGI is computed pre-deduction, and Part 2's Lines 4-12 arithmetic (min/max sequence below) handles the deduction's effect implicitly through the FIXED sequence: Line 5 = smaller of the two Line-3 (exemption-adjusted VAGI) amounts; Line 6 = Line 4 minus Line 5 (floored at 0); Line 7 = Line 4 divided by 2; tax is computed on min(Line 5, Line 7) and max(Line 6, Line 7) via us.va.income_tax and summed (Line 10), then subtracted from the actual joint tax (Line 11 = Form 760 Line 16) for the STA (Line 12), capped at $259. There is NO discretionary maximization step anywhere in this sequence — given the source-attributed Step-1/Step-2 inputs, the worksheet produces exactly one number. DISCLOSED SCOPE: this rule still does not COMPUTE the worksheet end-to-end (the per-spouse Separate-VAGI Step-1 income-source figures are themselves agent-transcribed facts, not derived by this corpus) — it now states the COMPLETE prescription (every line, every allocation rule) rather than only the gating conditions and cap, so an agent following it mechanically reaches the one correct number instead of inventing a wage-ratio or benefit-maximizing allocation.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      maxCredit: { value: "25900", type: "money" }, // $259
      combinedTaxableIncomeFloor: { value: "300000", type: "money" }, // $3,000
      line5ShortcutThreshold: { value: "1700000", type: "money" }, // $17,000 (Line 5 shortcut test)
      line4ShortcutThreshold: { value: "3400000", type: "money" }, // $34,000 (Line 5 shortcut test)
      personalExemptionBase: { value: "93000", type: "money" }, // $930 (Part 1 Line 2, per spouse)
      personalExemptionPerBox: { value: "80000", type: "money" }, // $800 per 65-or-over/blind box, per spouse
    },
    formula: {
      kind: "unsupported",
      reason:
        "Spouse Tax Adjustment worksheet (2025 Form 760 instructions p.12-13): MFJ only, combined VA taxable income > $3,000, credit capped at $259. The full worksheet is now stated verbatim in this rule's citation (Separate-VAGI Steps 1-2 income-source attribution, the $930+$800-per-box exemption formula per spouse, the age-deduction 50/50 split, and the Lines 4-12 min/max tax sequence) — but the per-spouse Separate-VAGI Step-1 income figures are inherently agent-attested facts (this corpus has no per-spouse income split), so the worksheet is not executed as a formula here; follow the citation's prescription exactly and disclose the per-spouse inputs used.",
    },
  },
  {
    id: "us.va.standard_deduction",
    version: 1, // TY2025-2026: unchanged from the long-standing $8,750/$17,500 (matches us.va.income_tax's documentation parameters)
    jurisdiction: "us.va",
    title: "Virginia standard deduction by filing status (Va. Code § 58.1-322.03(1)) — TY2025-2026",
    citation: {
      source: "Va. Code § 58.1-322.03(1); 2025 Form 760 instructions",
      section: "§ 58.1-322.03(1); Form 760 line 11",
      url: "https://www.tax.virginia.gov/sites/default/files/vatax-pdf/2025-760-instructions.pdf",
      excerpt:
        "For taxable years 2025 and 2026, the Virginia standard deduction is $8,750 for single filers/MFS and $17,500 for married filing jointly (VA has no separate HOH column — federal HOH files the single column). See us.va.standard_deduction v2/v3 for the TY2027+ enacted increases (2026 Appropriation Act).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: {
        kind: "or",
        args: [
          { kind: "cmp", op: "eq", left: fact("filingStatus"), right: { kind: "enum", value: "mfj" } },
          { kind: "cmp", op: "eq", left: fact("filingStatus"), right: { kind: "enum", value: "qss" } },
        ],
      },
      then: { kind: "money", cents: "1750000" }, // $17,500
      else: { kind: "money", cents: "875000" }, // $8,750
    },
  },
  {
    id: "us.va.standard_deduction",
    version: 2,
    jurisdiction: "us.va",
    title: "Virginia standard deduction by filing status (Va. Code § 58.1-322.03(1), as amended) — TY2027 enacted increase",
    citation: {
      source: "Va. Code § 58.1-322.03(1), as amended by the 2026 Appropriation Act (HB30, Sp. Sess. I, c. 1); 2026 Legislative Summary",
      section: "2026 Legislative Summary, 'Standard Deduction' (Item 4-14)",
      url: "https://www.tax.virginia.gov/sites/default/files/inline-files/2026-legislative-summary.pdf",
      excerpt:
        "The third enactment clause of the 2026 Appropriation Act (House Bill 30, Special Session I, Chapter 1) increases the standard deduction from $8,750 to $9,200 for single filers and from $17,500 to $18,400 for married filers filing jointly, effective for taxable years beginning on and after January 1, 2027, but before January 1, 2028. NOTE: the 2025 Form 760 booklet's prose ('the increased amount sunsets after 2026') is STALE relative to this later enactment — the statute now controls a TY2027 increase, not a TY2026 sunset. VA has no HOH column (single applies).",
    },
    effectiveFrom: "2027-01-01",
    effectiveTo: "2028-01-01",
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: {
        kind: "or",
        args: [
          { kind: "cmp", op: "eq", left: fact("filingStatus"), right: { kind: "enum", value: "mfj" } },
          { kind: "cmp", op: "eq", left: fact("filingStatus"), right: { kind: "enum", value: "qss" } },
        ],
      },
      then: { kind: "money", cents: "1840000" }, // $18,400
      else: { kind: "money", cents: "920000" }, // $9,200
    },
  },
  {
    id: "us.va.standard_deduction",
    version: 3,
    jurisdiction: "us.va",
    title: "Virginia standard deduction by filing status (Va. Code § 58.1-322.03(1), as amended) — TY2028-2029 enacted increase",
    citation: {
      source: "Va. Code § 58.1-322.03(1), as amended by the 2026 Appropriation Act (HB30, Sp. Sess. I, c. 1); 2026 Legislative Summary",
      section: "2026 Legislative Summary, 'Standard Deduction' (Item 4-14)",
      url: "https://www.tax.virginia.gov/sites/default/files/inline-files/2026-legislative-summary.pdf",
      excerpt:
        "The same enactment further increases the standard deduction to $9,300 for single filers and $18,600 for married filers filing jointly, effective for taxable years beginning on and after January 1, 2028, but before January 1, 2030. SUNSET (not encoded — out of this window): the increased amounts are scheduled to sunset after TY2029 and revert to the PRE-2019 standard deduction of $3,000 single / $6,000 MFJ starting TY2030; this rule does not cover TY2030+ (refuses/no applicable version beyond 2030-01-01).",
    },
    effectiveFrom: "2028-01-01",
    effectiveTo: "2030-01-01",
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: {
        kind: "or",
        args: [
          { kind: "cmp", op: "eq", left: fact("filingStatus"), right: { kind: "enum", value: "mfj" } },
          { kind: "cmp", op: "eq", left: fact("filingStatus"), right: { kind: "enum", value: "qss" } },
        ],
      },
      then: { kind: "money", cents: "1860000" }, // $18,600
      else: { kind: "money", cents: "930000" }, // $9,300
    },
  },
];
