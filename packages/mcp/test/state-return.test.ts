import { describe, expect, it } from "vitest";
import { composeStateReturn, type StateTaxEvaluator } from "../src/state-return.js";

/**
 * Composer-layer regression tests. Scenarios are drawn from the public
 * TaxCalcBench TY25 test set (case IDs in the test names) and pin the
 * composer's line-by-line output. The evaluator stub implements the exact
 * rate-schedule math so these tests exercise the COMPOSITION layer.
 */
const stubEval: StateTaxEvaluator = (target, cents, extra) => {
  const d = Number(cents) / 100;
  const round = (x: number): bigint => BigInt(Math.round(x)) * 100n;
  if (target === "us.il.income_tax") return round(d * 0.0495);
  if (target === "us.va.income_tax") {
    // Va. Code § 58.1-320 schedule (adequate for the worksheet amounts used here)
    const t = d <= 3000 ? d * 0.02
      : d <= 5000 ? 60 + (d - 3000) * 0.03
      : d <= 17000 ? 120 + (d - 5000) * 0.05
      : 720 + (d - 17000) * 0.0575;
    return round(t);
  }
  if (target === "us.ny.income_tax") {
    if (extra?.useFormulaMethod !== true) throw new Error("NY tax must be evaluated with useFormulaMethod=true");
    // single schedule, raw evaluation
    const t = d <= 8500 ? d * 0.04
      : d <= 11700 ? 340 + (d - 8500) * 0.045
      : d <= 13900 ? 484 + (d - 11700) * 0.0525
      : 600 + (d - 13900) * 0.055;
    return round(t);
  }
  if (target === "us.ny.nyc_income_tax") {
    if (extra?.useFormulaMethod !== true) throw new Error("NYC tax must be evaluated with useFormulaMethod=true");
    return round(d * 0.03078);
  }
  if (target === "us.ca.income_tax") return round(d * 0.02);
  if (target === "us.ca.amt") {
    // 7% of (caAmti − MFJ exemption w/ phaseout) minus regular tax — ca-005 shape
    const amti = Number(extra?.caAmti ?? 0n) / 100;
    const reg = Number(extra?.caRegularTax ?? 0n) / 100;
    const exemption = Math.max(0, 123667 - Math.max(0, (amti - 463745) * 0.25));
    const tmt = Math.round((amti - exemption) * 0.07);
    return round(Math.max(0, tmt - reg));
  }
  return 0n;
};

const dollars = (lines: Record<string, string>, key: string): string => {
  expect(lines[key], `line ${key} present`).toBeDefined();
  return lines[key];
};

describe("composeVA — 2025 Form 760", () => {
  it("va-008: Virginia Schedule A with the overall (Pease) limitation, MFS", () => {
    const { lines } = composeStateReturn(
      {
        jurisdiction: "va", filingStatus: "mfs", federalAGI: 452002, exemptions: 4,
        vaItemizing: true,
        vaItemizedMedical: 40997, vaItemizedSalesTaxes: 4500,
        vaItemizedRealEstateTaxes: 4006, vaItemizedPersonalPropertyTaxes: 1012,
        vaItemizedMortgageInterest: 3908, vaItemizedGambling: 320,
        vaScheduleAdjDeductions: 1251, stateWithholding: 10903,
      },
      stubEval,
    );
    // itemized 6,174 (13,746 − 7,572 Virginia overall limitation),
    // deductions subtotal 11,145, taxable 440,857
    expect(dollars(lines, "10_itemized_deductions")).toBe("$6,174");
    expect(dollars(lines, "11_standard_deduction")).toBe("$0");
    expect(dollars(lines, "13_sch_adj_deductions")).toBe("$1,251");
    expect(dollars(lines, "14_deductions_subtotal")).toBe("$11,145");
    expect(dollars(lines, "15_va_taxable_income")).toBe("$440,857");
  });

  it("va-007: joint exemptions default to 2 filers and blind boxes derive from the per-spouse STA inputs", () => {
    const { lines } = composeStateReturn(
      {
        jurisdiction: "va", filingStatus: "mfj", federalAGI: 119450,
        taxableSocialSecurity: 47222,
        vaYourVagi: 17105, vaSpouseVagi: 55123,
        vaYourAgeBlindBoxes: 1, vaSpouseAgeBlindBoxes: 1,
      },
      stubEval,
    );
    // exemptions 3,460 (2 x 930 + 2 x 800), deductions subtotal 20,960,
    // taxable income 51,268 — with NO explicit exemptions/ageOrBlindBoxes
    // inputs passed
    expect(dollars(lines, "12_exemptions")).toBe("$3,460");
    expect(dollars(lines, "14_deductions_subtotal")).toBe("$20,960");
    expect(dollars(lines, "15_va_taxable_income")).toBe("$51,268");
  });

  it("va-009: filing threshold zeroes the tax; refundable 20% EITC pays out uncapped", () => {
    const { lines } = composeStateReturn(
      {
        jurisdiction: "va", filingStatus: "single", federalAGI: 11000, exemptions: 1,
        federalEITC: 618, stateWithholding: 500,
      },
      stubEval,
    );
    expect(dollars(lines, "16_tax")).toBe("$0"); // VAGI 11,000 < $11,950 threshold
    expect(dollars(lines, "23_low_income_or_eitc_credit")).toBe("$124"); // 20% x 618
    expect(dollars(lines, "26_total_payments_credits")).toBe("$624");
    expect(dollars(lines, "36_refund")).toBe("$624");
  });

  it("va-005: blind exemptions bar the credit; line 15 prints negative; unemployment subtracts", () => {
    const { lines } = composeStateReturn(
      {
        jurisdiction: "va", filingStatus: "mfj", federalAGI: 791, exemptions: 2,
        ageOrBlindBoxes: 2, unemploymentCompensation: 310, federalEITC: 25,
      },
      stubEval,
    );
    expect(dollars(lines, "9_vagi")).toBe("$481");
    expect(dollars(lines, "15_va_taxable_income")).toBe("-$20,479"); // signed, not floored
    expect(dollars(lines, "23_low_income_or_eitc_credit")).toBe("$0"); // blind exemptions bar it
  });

  it("va-006: STA worksheet takes the $259 shortcut for large split incomes", () => {
    const { lines } = composeStateReturn(
      {
        jurisdiction: "va", filingStatus: "mfj", federalAGI: 138671, exemptions: 2,
        ageOrBlindBoxes: 4, vaAgeDeduction: 7551, taxableSocialSecurity: 47222,
        unemploymentCompensation: 333, subtractions: 0,
        vaYourVagi: 32222, vaSpouseVagi: 51353,
        vaYourAgeBlindBoxes: 2, vaSpouseAgeBlindBoxes: 2,
      },
      stubEval,
    );
    expect(dollars(lines, "9_vagi")).toBe("$83,565"); // 138,671 − 7,551 − 47,222 − 333 (would be 83,575 with the $10 gate-false additions included)
    expect(dollars(lines, "17_spouse_tax_adjustment")).toBe("$259");
  });

  it("splits estimated payments, prior-year credit, and extension onto lines 20/21/22", () => {
    const { lines } = composeStateReturn(
      {
        jurisdiction: "va", filingStatus: "mfj", federalAGI: 50000, exemptions: 2,
        estimatedPayments: 6, priorYearOverpaymentCredited: 5, extensionPayment: 6,
      },
      stubEval,
    );
    expect(dollars(lines, "20_estimated_payments")).toBe("$6");
    expect(dollars(lines, "21_prior_year_overpayment_credited")).toBe("$5");
    expect(dollars(lines, "22_extension_payment")).toBe("$6");
  });
});

describe("composeCA — 2025 Form 540", () => {
  it("ca-009: HSA nonconformity (deduction addback + distribution subtraction) and SS subtraction", () => {
    const { lines } = composeStateReturn(
      {
        jurisdiction: "ca", filingStatus: "hoh", federalAGI: 249108,
        taxableSocialSecurity: 48445, caHsaDeduction: 2500, caHsaTaxableDistribution: 855,
        caItemizedDeductions: 25000, dependents: 1,
      },
      stubEval,
    );
    expect(dollars(lines, "17_ca_agi")).toBe("$202,308"); // 249,108 − 48,445 − 855 + 2,500
    expect(dollars(lines, "19_ca_taxable_income")).toBe("$177,308");
  });

  it("ca-007/008: AB 5 reclassification and depreciation-difference additions", () => {
    const { lines } = composeStateReturn(
      {
        jurisdiction: "ca", filingStatus: "mfs", federalAGI: 33570,
        caAb5GrossIncomeAddition: 9800, caAb5NetLossAddition: 11140,
        caDepreciationAddition: 3200, caHsaTaxableDistribution: 8300,
        caHsaDeduction: 5800, subtractions: 0,
      },
      stubEval,
    );
    // 33,570 + 9,800 + 11,140 + 3,200 + 5,800 − 8,300 = 55,210 (the source
    // scenario also carries a small col-B/C residue this test does not model)
    expect(dollars(lines, "17_ca_agi")).toBe("$55,210");
  });

  it("prints the 2.5% early-distribution additional tax on line 63 (R&TC § 17085)", () => {
    const { lines } = composeStateReturn(
      { jurisdiction: "ca", filingStatus: "single", federalAGI: 50000, caTaxableEarlyDistribution: 1000 },
      stubEval,
    );
    expect(dollars(lines, "63_other_taxes")).toBe("$25");
  });

  it("builds Schedule P AMTI from the ISO preference when caAmt is not given (ca-005)", () => {
    const { lines, notes } = composeStateReturn(
      {
        jurisdiction: "ca", filingStatus: "mfj", federalAGI: 264765,
        subtractions: 16881, caItemizedDeductions: 41859,
        caIsoPreference: 275000, caAmtTaxesAddback: 1900,
        exemptions: 2,
      },
      stubEval,
    );
    // AMTI = 206,025 + 1,900 + 275,000 = 482,925; exemption 118,872; TMT 25,484
    expect(notes.join("\n")).toContain("AMTI $482,925");
    expect(lines["61_amt"]).toBeDefined();
  });
});

describe("composeNY — 2025 IT-201", () => {
  it("subtracts taxable social security automatically and taxes via the raw schedule", () => {
    const { lines } = composeStateReturn(
      {
        jurisdiction: "ny", filingStatus: "single", federalAGI: 33359, wages: 27859,
        additions: 122, subtractions: 22, taxableSocialSecurity: 390,
      },
      stubEval,
    );
    expect(dollars(lines, "32_subtractions")).toBe("$412"); // 22 + 390 (line 27)
  });

  it("ny-007-style: raw-schedule tax rounds 4% x 1,949 to $78 (not the table's $77)", () => {
    const { lines } = composeStateReturn(
      { jurisdiction: "ny", filingStatus: "single", federalAGI: 9949, subtractions: 0 },
      stubEval,
    );
    // 9,949 − 8,000 std = 1,949 taxable; stub uses the raw schedule
    expect(dollars(lines, "39_nys_tax")).toBe("$78");
  });
});

describe("composeIL — 2025 IL-1040", () => {
  it("il-008: claimable-as-dependent filers get no exemption allowance above $2,850 base income", () => {
    const { lines } = composeStateReturn(
      {
        jurisdiction: "il", filingStatus: "single", federalAGI: 42658,
        subtractions: 3000, claimedAsDependent: true, stateWithholding: 5137,
      },
      stubEval,
    );
    expect(dollars(lines, "10_exemption_allowance")).toBe("$0");
    expect(dollars(lines, "11_net_income")).toBe("$39,658");
    expect(dollars(lines, "12_tax")).toBe("$1,963"); // 39,658 x 4.95%
  });
});

// ---------------------------------------------------------------------------
// PA-40: unlike the stub-evaluated states above, the PA composer delegates
// line 9/10/12/21 to the corpus targets, so these tests run the REAL corpus —
// they pin the composition layer AND the rule arithmetic end-to-end.
// ---------------------------------------------------------------------------
import { evaluate } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";
import { makeStateTaxEvaluator } from "@invaro/opentax-compose";

const paCorpus = getCorpus();
const realPaEval = (input: Record<string, unknown>): StateTaxEvaluator =>
  makeStateTaxEvaluator((facts, target) => {
    const { value } = evaluate(paCorpus, facts as never, { asOf: "2025-12-31", target });
    return value.type === "money" ? value.cents : 0n;
  }, input);

describe("composePA — 2025 PA-40 (real corpus targets)", () => {
  it("full return: Box 16 compensation, UE, spouse loss isolated, Schedule O 529, balance due", () => {
    // Hand-computed: 1a 62,000 − 1b 500 = 1c 61,500; interest 300; business:
    // taxpayer 5,000 + spouse loss (excluded) = 5,000 -> line 9 = 66,800;
    // line 10 = 4,000 (529); line 11 = 62,800; line 12 = 62,800 x 3.07% =
    // 1,927.96 -> $1,928; withholding 1,900 -> line 26 due $28.
    const input = {
      jurisdiction: "pa" as const, filingStatus: "mfj",
      paGrossCompensation: 62000, paUnreimbursedExpenses: 500,
      paInterest: 300, paBusinessNet: 5000, paSpouseBusinessNet: -2000,
      pa529Contributions: 4000, stateWithholding: 1900,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "1a_gross_compensation")).toBe("$62,000");
    expect(dollars(lines, "1c_net_compensation")).toBe("$61,500");
    expect(dollars(lines, "4_business_net")).toBe("$5,000"); // spouse loss never nets
    expect(dollars(lines, "9_total_taxable_income")).toBe("$66,800");
    expect(dollars(lines, "10_other_deductions")).toBe("$4,000");
    expect(dollars(lines, "11_adjusted_taxable_income")).toBe("$62,800");
    expect(dollars(lines, "12_tax")).toBe("$1,928");
    expect(dollars(lines, "24_total_payments_credits")).toBe("$1,900");
    expect(dollars(lines, "26_tax_due")).toBe("$28");
    expect(dollars(lines, "28_total_due")).toBe("$28");
    expect(dollars(lines, "29_overpayment")).toBe("$0");
  });

  it("Schedule SP full forgiveness wipes the tax; withholding refunds; WPTC reported as a note", () => {
    // MFJ, $30,000 wages, 2 SP dependent children: t100 = 13,000 + 19,000 =
    // 32,000 >= 30,000 -> 100% forgiveness of the $921 tax; $921 withholding
    // refunds in full. Federal EITC 4,328 -> WPTC note $433.
    const input = {
      jurisdiction: "pa" as const, filingStatus: "mfj",
      wages: 30000, paSpDependentChildren: 2,
      stateWithholding: 921, federalEITC: 4328,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "12_tax")).toBe("$921");
    expect(lines["19b_sp_dependents"]).toBe("2");
    expect(dollars(lines, "20_eligibility_income")).toBe("$30,000");
    expect(dollars(lines, "21_tax_forgiveness")).toBe("$921");
    expect(dollars(lines, "29_overpayment")).toBe("$921");
    expect(dollars(lines, "30_refund")).toBe("$921");
    expect(dollars(lines, "26_tax_due")).toBe("$0");
    expect(notes.some((n) => n.includes("Working Pennsylvanians") && n.includes("$433"))).toBe(true);
  });

  it("loss-only class displays the loss oval amount but line 9 excludes it", () => {
    const input = {
      jurisdiction: "pa" as const, filingStatus: "single",
      wages: 50000, paBusinessNet: -10000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "4_business_net")).toBe("-$10,000");
    expect(dollars(lines, "9_total_taxable_income")).toBe("$50,000");
    expect(dollars(lines, "12_tax")).toBe("$1,535");
    // Box 16 fallback disclosed when only federal wages were provided
    expect(notes.some((n) => n.includes("Box 16"))).toBe(true);
  });

  it("resident credit subtracts before Tax Forgiveness (SP Section IV ordering)", () => {
    // MFJ, $32,600 wages, 2 deps -> 70% column. Tax $1,001; resident credit
    // $200 -> net $801; forgiveness = 70% x 801 = 560.70 -> $561.
    const input = {
      jurisdiction: "pa" as const, filingStatus: "mfj",
      wages: 32600, paSpDependentChildren: 2, paResidentCredit: 200,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "12_tax")).toBe("$1,001");
    expect(dollars(lines, "22_resident_credit")).toBe("$200");
    expect(dollars(lines, "21_tax_forgiveness")).toBe("$561");
  });
});

describe("composeNJ — 2025 NJ-1040 (real corpus targets)", () => {
  it("full return: exemptions, Worksheet H picks the property tax deduction, table-method tax", () => {
    // Hand-computed: 27 = 97,000; 30 = 2×1,000 + 2×1,500 = 5,000; 39 = 92,000.
    // Worksheet H: ded 9,000; tax(92,000) = .05525×92,025 − 2,775 = 2,309.38
    // -> 2,309 (printed table row); tax(83,000) = .05525×83,025 − 2,775 =
    // 1,812.13 -> 1,812; savings 497 >= $50 -> deduction. 42 = 83,000;
    // 43 = 1,812; CTC $0 (83,000 > 80,000); refund 2,500 − 1,812 = 688.
    const input = {
      jurisdiction: "nj" as const, filingStatus: "mfj",
      njWages: 95000, njTaxableInterest: 2000, dependents: 2,
      njChildrenUnder6: 2, njPropertyTaxesPaid: 9000, stateWithholding: 2500,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "27_total_income")).toBe("$97,000");
    expect(dollars(lines, "30_exemption_amount")).toBe("$5,000");
    expect(dollars(lines, "39_taxable_income")).toBe("$92,000");
    expect(dollars(lines, "41_property_tax_deduction")).toBe("$9,000");
    expect(dollars(lines, "42_nj_taxable_income")).toBe("$83,000");
    expect(dollars(lines, "43_tax")).toBe("$1,812");
    expect(dollars(lines, "65_nj_ctc")).toBe("$0");
    expect(dollars(lines, "80_refund")).toBe("$688");
  });

  it("Worksheet H picks the $50 credit when the deduction saves less than $50", () => {
    // 39 = 21,000; tax(21,000) = .0175×21,025 − 70 = 297.94 -> 298;
    // tax(18,000) = .014×18,025 = 252.35 -> 252; savings 46 < 50 -> credit.
    const input = {
      jurisdiction: "nj" as const, filingStatus: "single",
      njWages: 22000, njPropertyTaxesPaid: 3000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "41_property_tax_deduction")).toBe("$0");
    expect(dollars(lines, "43_tax")).toBe("$298");
    expect(dollars(lines, "56_property_tax_credit")).toBe("$50");
    expect(notes.some((n) => n.includes("Property Tax Credit chosen"))).toBe(true);
  });

  it("filing threshold zeroes the tax; the flat $260 age-decoupled NJEITC still refunds", () => {
    const input = {
      jurisdiction: "nj" as const, filingStatus: "single",
      njWages: 9000, stateWithholding: 200, njEitcAgeDecoupled: true,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "43_tax")).toBe("$0");
    expect(dollars(lines, "58_nj_eitc")).toBe("$260");
    expect(dollars(lines, "80_refund")).toBe("$460");
    expect(notes.some((n) => n.includes("filing threshold"))).toBe(true);
  });

  it("pension exclusion at the full tier: line 27 exactly $100,000 excludes the whole pension", () => {
    // 27 = 100,000 (<= the full tier); 28a = min(60,000, 100,000 MFJ cap) =
    // 60,000; 29 = 40,000; 30 = 2,000; 39 = 42 = 38,000; tax = .0175×38,025
    // − 70 = 595.44 -> 595.
    const input = {
      jurisdiction: "nj" as const, filingStatus: "mfj",
      njWages: 40000, njPension: 60000, njPensionEligible: true,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "28a_pension_exclusion")).toBe("$60,000");
    expect(dollars(lines, "29_nj_gross_income")).toBe("$40,000");
    expect(dollars(lines, "43_tax")).toBe("$595");
  });
});

describe("composeOH — 2025 IT 1040 (real corpus targets)", () => {
  it("full return: BID, MAGI-tiered exemptions, joint filing credit on line 11", () => {
    // Hand-computed: BID = min(30,000, 98,050, 250,000) = 30,000; OAGI =
    // 68,050; MAGI = 98,050 -> 4 × $1,900 = 7,600; line 5 = 60,450; line 7 =
    // 60,450; 8a = 342 + 2.75% × 34,400 = 1,288; JFC: MAGI-less-exemptions
    // 90,450 -> 5% × 1,288 = 64.40 -> 64; line 10 = 1,224; refund 576.
    const input = {
      jurisdiction: "oh" as const, filingStatus: "mfj", federalAGI: 98050,
      exemptions: 4, ohBusinessIncome: 30000,
      ohBothSpousesQualifyingIncome: true, stateWithholding: 1800,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "2b_deductions")).toBe("$30,000");
    expect(dollars(lines, "3_ohio_agi")).toBe("$68,050");
    expect(dollars(lines, "4_exemption_amount")).toBe("$7,600");
    expect(dollars(lines, "7_taxable_nonbusiness_income")).toBe("$60,450");
    expect(dollars(lines, "8a_nonbusiness_tax")).toBe("$1,288");
    expect(dollars(lines, "credits_12_joint_filing")).toBe("$64");
    expect(dollars(lines, "10_tax_after_credits")).toBe("$1,224");
    expect(dollars(lines, "26_refund")).toBe("$576");
  });

  it("Schedule of Credits line 40 reports the UNCAPPED line 36 (line 37 is a memo line)", () => {
    // Zero-band filer (line 7 = 25,200 <= 26,050 -> tax $0) with a $4,328
    // federal EITC: line 13 = 30% = 1,298; the $20 × 2 exemption credit
    // (MAGI-less-exemptions 25,200 < 30,000) adds $40 on line 9's block. The
    // printed line 40 = lines 10+36+38+39 with NO cap, so line 9 shows
    // $1,338 even though line 11 is $0; the excess dies at IT 1040 line 10's
    // zero floor, never refunding.
    const input = {
      jurisdiction: "oh" as const, filingStatus: "hoh", federalAGI: 30000,
      exemptions: 2, federalEITC: 4328,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "8a_nonbusiness_tax")).toBe("$0");
    expect(dollars(lines, "credits_13_eic")).toBe("$1,298");
    expect(dollars(lines, "credits_9_exemption_credit")).toBe("$40");
    expect(dollars(lines, "credits_40_total_nonrefundable")).toBe("$1,338");
    expect(dollars(lines, "9_nonrefundable_credits")).toBe("$1,338");
    expect(dollars(lines, "10_tax_after_credits")).toBe("$0");
    expect(dollars(lines, "26_refund")).toBe("$0");
    expect(notes.some((n) => n.includes("line 40 still reports the full sum"))).toBe(true);
  });

  it("R.C. 5747.98 ordering: retirement + senior credits subtract before the JFC's line-11 base", () => {
    // MAGI 40,000 -> 2 × 2,400 = 4,800; line 7 = 35,200; 8a = 342 + 2.75% ×
    // 9,150 = 593.63 -> 594. Line 2 retirement (6,000 -> $130) + line 4
    // senior ($50) = 180; line 11 = 414; JFC 15% tier -> 62.10 -> 62;
    // line 9 = 242; line 10 = 352. Exemption credit $0 (35,200 >= 30,000).
    const input = {
      jurisdiction: "oh" as const, filingStatus: "mfj", federalAGI: 40000,
      exemptions: 2, ohRetirementIncome: 6000, ohAge65OrOlder: true,
      ohBothSpousesQualifyingIncome: true,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "8a_nonbusiness_tax")).toBe("$594");
    expect(dollars(lines, "credits_2_retirement")).toBe("$130");
    expect(dollars(lines, "credits_4_senior")).toBe("$50");
    expect(dollars(lines, "credits_9_exemption_credit")).toBe("$0");
    expect(dollars(lines, "credits_11_tax_less_credits")).toBe("$414");
    expect(dollars(lines, "credits_12_joint_filing")).toBe("$62");
    expect(dollars(lines, "10_tax_after_credits")).toBe("$352");
  });
});

describe("composeMD — 2025 Form 502 (real corpus targets)", () => {
  it("full return: flat standard deduction, exemption chart, tax-table midpoint, 50% EIC, Montgomery local + local EIC", () => {
    // Hand-computed: MFJ FAGI 60,000; std 6,700; exemptions 4 x 3,200 =
    // 12,800; line 20 = 40,500 -> table row 40,500-40,550 mid 40,525 ->
    // 90 + 4.75% x 37,525 = 1,872.44 -> 1,872; EIC 50% x 2,000 = 1,000 ->
    // line 27 = 872; Montgomery 3.2% x 40,500 = 1,296, local EIC 32% x
    // 2,000 = 640 -> line 33 = 656; total 1,528; withheld 3,000 -> refund
    // 1,472. Refundable EIC $0 (the 50% credit did not absorb the tax).
    const input = {
      jurisdiction: "md" as const, filingStatus: "mfj", federalAGI: 60000,
      exemptions: 4, mdSubdivision: "montgomery", mdEicQualifyingChild: true,
      federalEITC: 2000, stateWithholding: 3000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "17_deduction")).toBe("$6,700");
    expect(dollars(lines, "19_exemption_amount")).toBe("$12,800");
    expect(dollars(lines, "20_taxable_net_income")).toBe("$40,500");
    expect(dollars(lines, "21_md_tax")).toBe("$1,872");
    expect(dollars(lines, "22_eic")).toBe("$1,000");
    expect(dollars(lines, "27_md_tax_after_credits")).toBe("$872");
    expect(dollars(lines, "28_local_tax")).toBe("$1,296");
    expect(dollars(lines, "29_local_eic")).toBe("$640");
    expect(dollars(lines, "33_local_tax_after_credits")).toBe("$656");
    expect(dollars(lines, "34_total_md_and_local_tax")).toBe("$1,528");
    expect(dollars(lines, "44_refundable_eic")).toBe("$0");
    expect(dollars(lines, "50_refund")).toBe("$1,472");
    expect(notes.some((n) => n.includes("did not fully absorb"))).toBe(true);
  });

  it("senior: pension exclusion (SS reduces the cap), taxable-SS auto-subtraction, $1,000 age box, printed-row-exact tax", () => {
    // FAGI 55,000 incl. 30,000 pension + 6,000 taxable SS; 13A exclusion
    // min(30,000, 41,200 − 12,000) = 29,200; line 16 = 19,800; std 3,350;
    // exemptions 3,200 + 1,000 age box; line 20 = 12,250 -> printed row
    // 12,250-12,300 -> $531 (booklet-exact); Baltimore City 3.2% = 392.
    const input = {
      jurisdiction: "md" as const, filingStatus: "single", federalAGI: 55000,
      exemptions: 1, ageOrBlindBoxes: 1, mdSubdivision: "baltimore_city",
      mdPensionYou: 30000, mdSsRrBenefitsYou: 12000, taxableSocialSecurity: 6000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "10a_pension_exclusion")).toBe("$29,200");
    expect(dollars(lines, "16_md_agi")).toBe("$19,800");
    expect(dollars(lines, "19_exemption_amount")).toBe("$4,200");
    expect(dollars(lines, "20_taxable_net_income")).toBe("$12,250");
    expect(dollars(lines, "21_md_tax")).toBe("$531");
    expect(dollars(lines, "28_local_tax")).toBe("$392");
    expect(notes.some((n) => n.includes("pension exclusion"))).toBe(true);
  });

  it("high earner: H.B. 352 itemized phase-out, zero exemptions, 6.25% bracket, 2% CG surtax, Anne Arundel 19D schedule", () => {
    // 17c = 7.5% x 500,000 = 37,500; itemized 60,000 − 10,000 − 37,500 =
    // 12,500 > 3,350 std; line 20 = 687,500 -> Schedule I: 27,135 + 6.25%
    // x 187,500 = 38,853.75 -> 38,854; 21b = 2% x 100,000 = 2,000; AA
    // single: 11,640 + 3.2% x 287,500 = 20,840; total 61,694.
    const input = {
      jurisdiction: "md" as const, filingStatus: "single", federalAGI: 700000,
      exemptions: 1, mdSubdivision: "anne_arundel", mdItemizing: true,
      mdFederalItemized: 60000, mdItemizedStateLocalTaxes: 10000,
      mdNetCapitalGainSubject: 100000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "17c_itemized_phaseout")).toBe("$37,500");
    expect(dollars(lines, "17_deduction")).toBe("$12,500");
    expect(dollars(lines, "19_exemption_amount")).toBe("$0");
    expect(dollars(lines, "21_md_tax")).toBe("$38,854");
    expect(dollars(lines, "21b_cg_additional_tax")).toBe("$2,000");
    expect(dollars(lines, "28_local_tax")).toBe("$20,840");
    expect(dollars(lines, "34_total_md_and_local_tax")).toBe("$61,694");
    expect(notes.some((n) => n.includes("2% H.B. 352 surtax"))).toBe(true);
  });

  it("low income: childless 100% refundable EIC, poverty level credit + local twin, refundable CTC", () => {
    // Line 20 = 12,000 − 3,350 − 3,200 = 5,450 -> table mid 5,475 -> 208;
    // EIC 100% x 600; poverty 5% x 12,000 = 600 (guideline 15,650); line 27
    // = 0; Worcester 2.25% x 5,450 = 123; local EIC 22.5% x 600 = 135,
    // local poverty 2.25% x 12,000 = 270 -> line 33 = 0; refundable EIC
    // 600 − 208 = 392; CTC 500 (FAGI <= 15,000) -> refund 892.
    const input = {
      jurisdiction: "md" as const, filingStatus: "single", federalAGI: 12000,
      exemptions: 1, mdSubdivision: "worcester", federalEITC: 600,
      mdEarnedIncome: 12000, mdHouseholdSize: 1, mdCtcChildren: 1,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "20_taxable_net_income")).toBe("$5,450");
    expect(dollars(lines, "21_md_tax")).toBe("$208");
    expect(dollars(lines, "22_eic")).toBe("$600");
    expect(dollars(lines, "23_poverty_level_credit")).toBe("$600");
    expect(dollars(lines, "27_md_tax_after_credits")).toBe("$0");
    expect(dollars(lines, "28_local_tax")).toBe("$123");
    expect(dollars(lines, "29_local_eic")).toBe("$135");
    expect(dollars(lines, "30_local_poverty_credit")).toBe("$270");
    expect(dollars(lines, "33_local_tax_after_credits")).toBe("$0");
    expect(dollars(lines, "44_refundable_eic")).toBe("$392");
    expect(dollars(lines, "45_refundable_credits")).toBe("$500");
    expect(dollars(lines, "50_refund")).toBe("$892");
  });

  it("review fixes: line 9 expense cap and the Instruction 22 refund/interest netting", () => {
    // Care expenses 5,000 cap to 3,000 (one dependent); line 20 = 30,000 −
    // 3,000 − 3,350 − 3,200 = 20,450 -> table mid 20,475 -> 920; Worcester
    // 2.25% = 460; total 1,380; withheld 2,000 -> overpayment 620; the $100
    // interest nets against it: refund 520, amount due 0.
    const input = {
      jurisdiction: "md" as const, filingStatus: "single", federalAGI: 30000,
      exemptions: 1, mdSubdivision: "worcester", mdChildCareExpenses: 5000,
      stateWithholding: 2000, mdInterestCharges: 100,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "20_taxable_net_income")).toBe("$20,450");
    expect(dollars(lines, "21_md_tax")).toBe("$920");
    expect(dollars(lines, "28_local_tax")).toBe("$460");
    expect(dollars(lines, "48_overpayment")).toBe("$620");
    expect(dollars(lines, "50_refund")).toBe("$520");
    expect(dollars(lines, "52_total_amount_due")).toBe("$0");
    expect(notes.some((n) => n.includes("line 9 capped"))).toBe(true);
    expect(notes.some((n) => n.includes("refund netting"))).toBe(true);
  });
});


describe("composeMO — 2025 MO-1040 (real corpus targets)", () => {
  it("single wage earner: 25% federal tax deduction tier, federal standard deduction, chart tax", () => {
    // l6 = 50,000 -> 25% tier x 4,000 = 1,000; std 15,750; l26 = 33,250;
    // chart: 256 + 4.7% x 24,059 = 1,386.77 -> 1,387; withheld 1,500 -> 113.
    const input = {
      jurisdiction: "mo" as const, filingStatus: "single", federalAGI: 50000,
      moFederalTax9: 4000, stateWithholding: 1500,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "13_federal_tax_deduction")).toBe("$1,000");
    expect(dollars(lines, "14_deduction")).toBe("$15,750");
    expect(dollars(lines, "26_subtotal")).toBe("$33,250");
    expect(dollars(lines, "30Y_tax")).toBe("$1,387");
    expect(dollars(lines, "36_total_tax")).toBe("$1,387");
    expect(dollars(lines, "53_refund")).toBe("$113");
  });

  it("combined return: FAGI split, H.B. 594 capital-gain subtraction, whole-percent line 7, separate per-spouse chart tax", () => {
    // 5Y = 50,000 − 10,000 CG = 40,000; 5S = 30,000; l6 = 70,000 -> 57%/43%;
    // fed tax ded 15% x 6,000 = 900; std 31,500; l26 = 37,600 -> 21,432 /
    // 16,168; taxes 831 + 584 = 1,415 (separate chart per spouse — no
    // marriage penalty).
    const input = {
      jurisdiction: "mo" as const, filingStatus: "mfj", federalAGI: 80000,
      moFagiYou: 50000, moFagiSpouse: 30000, moCapitalGainYou: 10000,
      moFederalTax9: 6000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "5Y_mo_agi")).toBe("$40,000");
    expect(dollars(lines, "5S_mo_agi")).toBe("$30,000");
    expect(lines["7Y_income_pct"]).toBe("57%");
    expect(dollars(lines, "13_federal_tax_deduction")).toBe("$900");
    expect(dollars(lines, "29Y_taxable_income")).toBe("$21,432");
    expect(dollars(lines, "29S_taxable_income")).toBe("$16,168");
    expect(dollars(lines, "30Y_tax")).toBe("$831");
    expect(dollars(lines, "30S_tax")).toBe("$584");
    expect(dollars(lines, "36_total_tax")).toBe("$1,415");
    expect(notes.some((n) => n.includes("capital gain subtraction $10,000"))).toBe(true);
  });

  it("senior: Section A public pension less the Section C SS exemption, additional standard deduction", () => {
    // Section C 15,000; Section A min(30,000, 47,633) − 15,000 = 15,000;
    // l8 = 30,000; fed ded 15% x 3,000 = 450; std 15,750 + 2,000; l26 =
    // 6,800 -> chart 144 + 4% x 235 = 153.40 -> 153.
    const input = {
      jurisdiction: "mo" as const, filingStatus: "single", federalAGI: 55000,
      moPublicPensionYou: 30000, moSsExemptYou: 15000, taxableSocialSecurity: 15000,
      ageOrBlindBoxes: 1, moFederalTax9: 3000,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "8_pension_ss_exemption")).toBe("$30,000");
    expect(dollars(lines, "14_deduction")).toBe("$17,750");
    expect(dollars(lines, "26_subtotal")).toBe("$6,800");
    expect(dollars(lines, "30Y_tax")).toBe("$153");
  });

  it("WFTC: 20% of the federal EIC, nonrefundable cap against tax less lines 42/43; HOH $1,400 exemption", () => {
    // std 23,625 + 1,400 HOH exemption; l26 = 2,975 -> tax 35; WFTC raw 700
    // capped at max0(35 − 300 PTC) = 0; payments 300 -> refund 265.
    const input = {
      jurisdiction: "mo" as const, filingStatus: "hoh", federalAGI: 28000,
      federalEITC: 3500, moPropertyTaxCredit: 300,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "15_hoh_qw_exemption")).toBe("$1,400");
    expect(dollars(lines, "26_subtotal")).toBe("$2,975");
    expect(dollars(lines, "36_total_tax")).toBe("$35");
    expect(dollars(lines, "44_wftc")).toBe("$0");
    expect(dollars(lines, "53_refund")).toBe("$265");
    expect(notes.some((n) => n.includes("capped at $0"))).toBe(true);
  });

  it("review fix: 12 CSR 10-2.710 negative-FAGI zeroing nets the joint FAGI into the positive spouse", () => {
    // 1Y −10,000 / 1S 100,000 -> per the regulation: 1Y $0, 1S $90,000;
    // pct 0%/100%; fed ded: l6 = 90,000 -> 15% x 5,000 = 750; std 31,500;
    // l26 = 57,750 all to spouse -> chart 256 + 4.7% x 48,559 = 2,538.27
    // -> 2,538.
    const input = {
      jurisdiction: "mo" as const, filingStatus: "mfj", federalAGI: 90000,
      moFagiYou: -10000, moFagiSpouse: 100000, moFederalTax9: 5000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "1Y_fagi")).toBe("$0");
    expect(dollars(lines, "1S_fagi")).toBe("$90,000");
    expect(lines["7Y_income_pct"]).toBe("0%");
    expect(dollars(lines, "13_federal_tax_deduction")).toBe("$750");
    expect(dollars(lines, "29S_taxable_income")).toBe("$57,750");
    expect(dollars(lines, "30Y_tax")).toBe("$0");
    expect(dollars(lines, "30S_tax")).toBe("$2,538");
    expect(notes.some((n) => n.includes("12 CSR 10-2.710"))).toBe(true);
  });
});


describe("composeWI — 2025 Form 1 (real corpus targets)", () => {
  it("single wage earner: sliding standard deduction, $700 exemption, table tax", () => {
    // l7 = 60,000 -> std at row mid 60,250 = 13,560 − 12% x 40,700 = 8,676;
    // l11 = 50,624 -> table mid 50,650 = 2,089 + 5.3% x 170 = 2,098.01 ->
    // 2,098; withheld 2,500 -> refund 402.
    const input = {
      jurisdiction: "wi" as const, filingStatus: "single", federalAGI: 60000,
      stateWithholding: 2500,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "8_standard_deduction")).toBe("$8,676");
    expect(dollars(lines, "11_taxable_income")).toBe("$50,624");
    expect(dollars(lines, "12_tax")).toBe("$2,098");
    expect(dollars(lines, "41_refund")).toBe("$402");
  });

  it("joint: SS + Schedule WD subtractions, MFJ deduction rounding pin, SPTC cap, married couple credit cap", () => {
    // l6 = 10,000 SS + 2,400 (30% WD exclusion) = 12,400; l7 = 77,600 ->
    // std mid 77,750 = 25,110 − 19.778% x 49,540 = 15,311.99 -> 15,312;
    // l11 = 60,888 -> mid 60,850 -> 685.30-anchor row: 2,501.18 -> 2,501;
    // SPTC 12% x 3,050 = 366 -> capped 300; MCC min(16,500, 16,000) x 3% =
    // 480; net tax 2,501 − 780 = 1,721.
    const input = {
      jurisdiction: "wi" as const, filingStatus: "mfj", federalAGI: 90000,
      exemptions: 2, taxableSocialSecurity: 10000, wiCapitalGainSubtraction: 2400,
      wiPropertyTaxesPaid: 3000, wiLowerQualifiedEarnedIncome: 16500,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "6_subtractions")).toBe("$12,400");
    expect(dollars(lines, "8_standard_deduction")).toBe("$15,312");
    expect(dollars(lines, "12_tax")).toBe("$2,501");
    expect(dollars(lines, "16_school_property_tax_credit")).toBe("$300");
    expect(dollars(lines, "18_married_couple_credit")).toBe("$480");
    expect(dollars(lines, "22_net_tax")).toBe("$1,721");
  });

  it("Act 15 retirement subtraction forfeits the credit stack (SB-16 caution enforced)", () => {
    // ret67 = min(30,000, 24,000); l7 = 26,000 -> std mid 26,250 = 12,756;
    // l10c = 700 + 250; l11 = 12,294 -> table mid 12,250 -> 3.5% = 428.75
    // -> 429; the $2,000 property-tax credit is FORCED to $0.
    const input = {
      jurisdiction: "wi" as const, filingStatus: "single", federalAGI: 50000,
      wiRetirement67Income: 30000, wiPropertyTaxesPaid: 2000, wiAge65Boxes: 1,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "6_subtractions")).toBe("$24,000");
    expect(dollars(lines, "8_standard_deduction")).toBe("$12,756");
    expect(dollars(lines, "10c_exemptions")).toBe("$950");
    expect(dollars(lines, "12_tax")).toBe("$429");
    expect(dollars(lines, "16_school_property_tax_credit")).toBe("$0");
    expect(dollars(lines, "22_net_tax")).toBe("$429");
    expect(notes.some((n) => n.includes("FORFEITED"))).toBe(true);
    expect(notes.some((n) => n.includes("forced to $0"))).toBe(true);
  });

  it("EIC: 11% of the federal credit with two children; HOH greater-of deduction; printed-row tax", () => {
    // HOH l7 = 25,000 -> std mid 25,250: HOH formula 16,236.64 -> 16,237
    // (beats single 12,876); l11 = 8,063 -> printed row 8,000-8,100 -> 282;
    // EIC 11% x 4,000 = 440 -> refund 158.
    const input = {
      jurisdiction: "wi" as const, filingStatus: "hoh", federalAGI: 25000,
      wiEicQualifyingChildren: 2, federalEITC: 4000,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "8_standard_deduction")).toBe("$16,237");
    expect(dollars(lines, "12_tax")).toBe("$282");
    expect(dollars(lines, "30_earned_income_credit")).toBe("$440");
    expect(dollars(lines, "41_refund")).toBe("$158");
  });
});

describe("composeMN — 2025 Form M1 (real corpus targets)", () => {
  it("single wage earner: full standard deduction, table tax at the row midpoint", () => {
    // std 14,950 (AGI under the limitation); l9 = 45,050 -> row mid 45,050:
    // 1,742.50 + 6.8% x 12,480 = 2,591.14 -> 2,591; withheld 3,500 -> 909.
    const input = {
      jurisdiction: "mn" as const, filingStatus: "single", federalAGI: 60000,
      stateWithholding: 3500,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "4_deduction")).toBe("$14,950");
    expect(dollars(lines, "9_taxable_income")).toBe("$45,050");
    expect(dollars(lines, "10_tax")).toBe("$2,591");
    expect(dollars(lines, "29_refund")).toBe("$909");
  });

  it("senior joint: 65+ boxes, full Social Security subtraction below the threshold", () => {
    // std 29,900 + 2 x 1,550 = 33,000; AGI 105,000 < 108,320 -> full 25,000
    // SS subtraction; l9 = 47,000 -> table mid 47,050 (below 47,620) ->
    // 5.35% = 2,517.18 -> 2,517.
    const input = {
      jurisdiction: "mn" as const, filingStatus: "mfj", federalAGI: 105000,
      mnStdBoxes: 2, taxableSocialSecurity: 25000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "4_deduction")).toBe("$33,000");
    expect(dollars(lines, "7_subtractions")).toBe("$25,000");
    expect(dollars(lines, "10_tax")).toBe("$2,517");
    expect(notes.some((n) => n.includes("full below the AGI threshold"))).toBe(true);
  });

  it("high earner: deduction limitation, exemption phase-out, 9.85% schedule, 1% NIIT", () => {
    // std 14,950 − 3% x 91,350-capped-excess(61,050? no: min(excess 111,050,
    // 91,350)) − 10% x 19,700 = 14,950 − (2,740.50 + 1,970) = 10,239.50 ->
    // 10,240; exemptions 5,200 − 90% = 520; l9 = 339,240 -> 13,996.80 +
    // 9.85% x 140,610 = 27,846.89 -> 27,847; NIIT 1% x 200,000 = 2,000.
    const input = {
      jurisdiction: "mn" as const, filingStatus: "single", federalAGI: 350000,
      mnDependents: 1, mnNetInvestmentIncome: 1200000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "4_deduction")).toBe("$10,240");
    expect(dollars(lines, "5_exemptions")).toBe("$520");
    expect(dollars(lines, "9_taxable_income")).toBe("$339,240");
    expect(dollars(lines, "10_tax")).toBe("$27,847");
    expect(dollars(lines, "14a_other_taxes")).toBe("$2,000");
    expect(dollars(lines, "15_tax_before_credits")).toBe("$29,847");
    expect(notes.some((n) => n.includes("net investment income tax"))).toBe(true);
  });

  it("greater-of Social Security methods, M1C/M1REF buckets, refund chain", () => {
    // simplified: excess 11,680 -> 3 steps -> 30% off 30,000 = 21,000 beats
    // the 3,000 alternative; l9 = 120,000 − 29,900 − 21,000 = 69,100 ->
    // table mid 69,150 -> 2,547.67 + 6.8% x 21,530 = 4,011.71 -> 4,012;
    // M1C 800 -> 3,212; payments 3,000 + 1,500 -> refund 1,288.
    const input = {
      jurisdiction: "mn" as const, filingStatus: "mfj", federalAGI: 120000,
      taxableSocialSecurity: 30000, mnSsAlternativeMethod: 3000,
      nonrefundableCredits: 800, refundableCredits: 1500, stateWithholding: 3000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "7_subtractions")).toBe("$21,000");
    expect(dollars(lines, "9_taxable_income")).toBe("$69,100");
    expect(dollars(lines, "10_tax")).toBe("$4,012");
    expect(dollars(lines, "17_tax_after_credits")).toBe("$3,212");
    expect(dollars(lines, "29_refund")).toBe("$1,288");
    expect(notes.some((n) => n.includes("simplified method"))).toBe(true);
  });
});

describe("composeNC — 2025 D-400 (real corpus targets)", () => {
  it("full return: child deduction tier, standard deduction, 4.25% flat", () => {
    // Hand-computed: FAGI 85,000; child deduction 2 × $1,500 (over-$80k MFJ
    // tier) = 3,000; standard 25,500; line 12b = 56,500; tax = 4.25% ×
    // 56,500 = 2,401.25 -> 2,401; withholding 2,000 -> due 401.
    const input = {
      jurisdiction: "nc" as const, filingStatus: "mfj", federalAGI: 85000,
      ncQualifyingChildren: 2, stateWithholding: 2000,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "10b_child_deduction")).toBe("$3,000");
    expect(dollars(lines, "11_nc_deduction")).toBe("$25,500");
    expect(dollars(lines, "14_nc_taxable_income")).toBe("$56,500");
    expect(dollars(lines, "15_nc_income_tax")).toBe("$2,401");
    expect(dollars(lines, "26a_tax_due")).toBe("$401");
  });

  it("itemized beats standard (with the $20,000 cap) and the use-tax estimate keys on line 14", () => {
    // Itemized: min(15,000+8,000, 20,000) + 2,000 + (10,000 − 7.5%×80,000) =
    // 26,000 > 12,750 standard. Line 14 = 54,000; tax = 2,295; use tax =
    // .000675 × 54,000 = 36.45 -> 36.
    const input = {
      jurisdiction: "nc" as const, filingStatus: "single", federalAGI: 80000,
      ncMortgageInterest: 15000, ncRealEstateTaxes: 8000, ncCharitable: 2000,
      ncMedicalExpenses: 10000, ncUseTaxEstimate: true,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "11_nc_deduction")).toBe("$26,000");
    expect(dollars(lines, "15_nc_income_tax")).toBe("$2,295");
    expect(dollars(lines, "18_consumer_use_tax")).toBe("$36");
    expect(dollars(lines, "19_total_tax")).toBe("$2,331");
    expect(notes.some((n) => n.includes("itemized deductions"))).toBe(true);
  });

  it("Social Security and Bailey retirement auto-deduct on line 9", () => {
    // l9 = 10,000 SS + 20,000 Bailey = 30,000; l12b = 60,000 − 30,000 −
    // 12,750 = 17,250; tax = 4.25% × 17,250 = 733.13 -> 733.
    const input = {
      jurisdiction: "nc" as const, filingStatus: "single", federalAGI: 60000,
      taxableSocialSecurity: 10000, ncBaileyRetirement: 20000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "9_deductions")).toBe("$30,000");
    expect(dollars(lines, "15_nc_income_tax")).toBe("$733");
    expect(notes.some((n) => n.includes("Bailey"))).toBe(true);
  });
});

describe("composeGA — 2025 Form 500 (real corpus targets)", () => {
  it("full return: standard deduction, dependent exemption, 5.19% flat, LIC denied over $20,000", () => {
    // Hand-computed: FAGI 70,000; std 24,000 (MFJ); dependents 2 × 4,000 =
    // 8,000; line 15c = 38,000; tax = 5.19% × 38,000 = 1,972.20 -> 1,972;
    // withholding 2,100 -> refund 128. LIC $0 (FAGI ≥ $20,000).
    const input = {
      jurisdiction: "ga" as const, filingStatus: "mfj", federalAGI: 70000,
      gaDependentCount: 2, gaLicExemptions: 4, stateWithholding: 2100,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "11_standard_deduction")).toBe("$24,000");
    expect(dollars(lines, "14_dependent_exemption")).toBe("$8,000");
    expect(dollars(lines, "15c_georgia_taxable_income")).toBe("$38,000");
    expect(dollars(lines, "16_tax")).toBe("$1,972");
    expect(dollars(lines, "17c_low_income_credit")).toBe("$0");
    expect(dollars(lines, "30_overpayment")).toBe("$128");
    expect(dollars(lines, "46_refund")).toBe("$128");
  });

  it("retirement exclusion + Social Security auto-subtract; LIC caps at the tiny tax", () => {
    // 65+ single: FAGI 30,000 incl. 10,000 taxable SS; retirement exclusion
    // min(12,000 + min(3,000, 5,000), 65,000) = 15,000; line 9 = −25,000;
    // GA AGI 5,000; std 12,000 -> line 15c 0 -> tax 0; LIC (FAGI 30,000)
    // = $0 anyway. Verifies the subtraction plumbing and zero floors.
    const input = {
      jurisdiction: "ga" as const, filingStatus: "single", federalAGI: 30000,
      taxableSocialSecurity: 10000, gaExclusionTier: "65plus",
      gaRetirementIncome: 12000, gaRetirementEarnedIncome: 3000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "9_adjustments")).toBe("-$25,000");
    expect(dollars(lines, "10_georgia_agi")).toBe("$5,000");
    expect(dollars(lines, "16_tax")).toBe("$0");
    expect(notes.some((n) => n.includes("retirement income exclusion $15,000"))).toBe(true);
  });

  it("forced itemizing, CDCC folds into IND-CR, credits cap at line 16", () => {
    // Federal itemizer: 12a 18,000 − 12b 4,000 = 14,000 GA itemized (no
    // standard). FAGI 15,000 − 14,000 = 1,000; 15c = 1,000; tax 5.19% ×
    // 1,000 = 52 -> $52. LIC: FAGI 15,000 -> $5 tier × 2 = 10; CDCC 50% ×
    // 400 = 200; credits 210 -> capped at 52.
    const input = {
      jurisdiction: "ga" as const, filingStatus: "mfj", federalAGI: 15000,
      gaFederalItemized: 18000, gaItemizedAdjustments: 4000,
      gaLicExemptions: 2, gaFederalCdccAllowed: 400,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "11_standard_deduction")).toBe("$0");
    expect(dollars(lines, "12c_georgia_itemized")).toBe("$14,000");
    expect(dollars(lines, "16_tax")).toBe("$52");
    expect(dollars(lines, "17c_low_income_credit")).toBe("$10");
    expect(dollars(lines, "20_ind_cr_credits")).toBe("$200");
    expect(dollars(lines, "22_total_credits_used")).toBe("$52");
    expect(dollars(lines, "23_balance")).toBe("$0");
    expect(notes.some((n) => n.includes("capped at the line 16 tax"))).toBe(true);
  });
});

describe("composeStateReturn — federalAGI guard", () => {
  it("AGI-based states refuse loudly without federalAGI (schema made it optional for PA)", () => {
    expect(() =>
      composeStateReturn({ jurisdiction: "il", filingStatus: "single" }, stubEval),
    ).toThrow(/federalAGI is required/);
    expect(() =>
      composeStateReturn({ jurisdiction: "oh", filingStatus: "single" }, stubEval),
    ).toThrow(/federalAGI is required/);
  });
  it("PA composes without federalAGI (class-based)", () => {
    const input = { jurisdiction: "pa" as const, filingStatus: "single", wages: 10000 };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "12_tax")).toBe("$307");
  });
  it("NJ composes without federalAGI (category-based)", () => {
    const input = { jurisdiction: "nj" as const, filingStatus: "single", njWages: 50000 };
    const { lines } = composeStateReturn(input, realPaEval(input));
    // 50,000 − 1,000 exemption = 49,000 -> .05525 × 49,025 − 1,492.50 = 1,216.13 -> 1,216
    expect(dollars(lines, "43_tax")).toBe("$1,216");
  });
});

describe("composeSC — 2025 SC1040 (real corpus targets)", () => {
  it("full MFJ return: LTCG 44%, retirement/age-65 interplay, dependents, CDCC + Two Wage Earner, use-tax netting", () => {
    // Hand-computed: line 1 = 95,000 + additions 1,200 = 96,200.
    // Subtractions: i 44% x 10,000 = 4,400; p 10,000 (65+ cap) + 2,000; q
    // 15,000 - 10,000 = 5,000; t 1 x 4,930; w 2 x 4,930 = 9,860 -> line 4 =
    // 36,190; line 5 = 60,010. Tax: SC1040TT row 60,000-60,100 midpoint
    // 60,050 -> 428.10 + 6% x 42,220 = 2,961.30 -> $2,961. Credits: CDCC
    // min(7% x 6,000, 420) = 420; Two Wage Earner 0.7% x 20,000 = 140 ->
    // line 15 = 2,401. Withholding 2,500 -> overpayment 99; use tax 40 +
    // contributions 20 = 60 -> net refund $39.
    const input = {
      jurisdiction: "sc" as const,
      filingStatus: "mfj",
      scFederalTaxableIncome: 95000,
      scAdditions: 1200,
      scNetLtcgAfterLosses: 10000,
      scRetirementIncomeYou: 12000,
      scIs65You: true,
      scRetirementIncomeSpouse: 2000,
      scDependents: 2,
      scDependentsUnder6: 1,
      scCareExpenses: 6000,
      scCareChildren: 2,
      scLowerQualifiedEarnedIncome: 20000,
      stateWithholding: 2500,
      useTax: 40,
      scContributions: 20,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "1_federal_taxable_income")).toBe("$95,000");
    expect(dollars(lines, "i_ltcg_44pct")).toBe("$4,400");
    expect(dollars(lines, "p_retirement_military")).toBe("$12,000");
    expect(dollars(lines, "q_age65")).toBe("$5,000");
    expect(dollars(lines, "t_under6")).toBe("$4,930");
    expect(dollars(lines, "w_dependent_exemption")).toBe("$9,860");
    expect(dollars(lines, "4_total_subtractions")).toBe("$36,190");
    expect(dollars(lines, "5_sc_income_subject_to_tax")).toBe("$60,010");
    expect(dollars(lines, "6_tax")).toBe("$2,961");
    expect(dollars(lines, "11_cdcc")).toBe("$420");
    expect(dollars(lines, "12_two_wage_earner")).toBe("$140");
    expect(dollars(lines, "15_tax_after_credits")).toBe("$2,401");
    expect(dollars(lines, "24_overpayment")).toBe("$99");
    expect(dollars(lines, "30_net_refund")).toBe("$39");
    expect(dollars(lines, "34_balance_due")).toBe("$0");
    expect(notes.some((n) => n.includes("REDUCED by that person's retirement"))).toBe(true);
  });

  it("negative federal taxable income preserved on line r; 125% EITC nonrefundable floors line 15 at $0", () => {
    // line 1 = $0 (FTI -5,000); additions 8,000 -> line 3 = 8,000; line r =
    // 5,000 -> line 5 = 3,000 -> table row 3,000-3,050 midpoint 3,025 in the
    // 0% bracket -> tax $0. SC EITC = 125% x 1,000 = 1,250 nonrefundable ->
    // line 15 stays $0; withholding 100 refunds in full.
    const input = {
      jurisdiction: "sc" as const,
      filingStatus: "single",
      scFederalTaxableIncome: -5000,
      scAdditions: 8000,
      federalEITC: 1000,
      stateWithholding: 100,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "1_federal_taxable_income")).toBe("$0");
    expect(dollars(lines, "r_negative_fti")).toBe("$5,000");
    expect(dollars(lines, "5_sc_income_subject_to_tax")).toBe("$3,000");
    expect(dollars(lines, "6_tax")).toBe("$0");
    expect(dollars(lines, "13_other_nonrefundable")).toBe("$1,250");
    expect(dollars(lines, "15_tax_after_credits")).toBe("$0");
    expect(dollars(lines, "30_net_refund")).toBe("$100");
    expect(notes.some((n) => n.includes("125% of the federal EIC"))).toBe(true);
    expect(notes.some((n) => n.includes("floors at $0"))).toBe(true);
  });

  it("military retirement exhausts the same person's retirement CAP and age-65 deduction (Example 5); MFS denied the CDCC", () => {
    // Printed worksheet: the $30,000 military deduction exceeds the $10,000
    // 65+ cap -> p-1 = min(4,000, max0(10,000 - 30,000)) = $0 (instructions
    // Example 5); q = max0(15,000 - 30,000) = $0. Line p = military 30,000
    // only; line 5 = 60,000 - 30,000 = 30,000 -> row 30,000-30,100 midpoint
    // 30,050 -> 428.10 + 6% x 12,220 = 1,161.30 -> $1,161. CDCC $0 (MFS).
    const input = {
      jurisdiction: "sc" as const,
      filingStatus: "mfs",
      scFederalTaxableIncome: 60000,
      scRetirementIncomeYou: 4000,
      scMilitaryRetirementYou: 30000,
      scIs65You: true,
      scCareExpenses: 3000,
      scCareChildren: 1,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "p_retirement_military")).toBe("$30,000");
    expect(lines["q_age65"]).toBeUndefined();
    expect(dollars(lines, "5_sc_income_subject_to_tax")).toBe("$30,000");
    expect(dollars(lines, "6_tax")).toBe("$1,161");
    expect(lines["11_cdcc"]).toBeUndefined();
    expect(notes.some((n) => n.includes("denied to married filing separately"))).toBe(true);
  });

  it("refuses loudly without scFederalTaxableIncome (federal TAXABLE income, not AGI, is the SC base)", () => {
    expect(() =>
      composeStateReturn({ jurisdiction: "sc", filingStatus: "single", federalAGI: 50000 }, stubEval),
    ).toThrow(/scFederalTaxableIncome is required/);
  });
});

describe("composeAL — 2025 Form 40 (real corpus targets)", () => {
  it("full MFJ return: RS exclusions, itemized beats phased standard, unlimited FIT deduction, dependent tier, checkoff adds", () => {
    // Hand-computed: retirement line 4 = (10,000 - 6,000 exclusion) + 2,000
    // (spouse under 65, no exclusion) = 6,000; line 7 = 9,000; line 8 =
    // 95,200; line 10 = 90,000. Standard (MFJ, AGI over 35,500) = floor
    // 5,000 -> itemized 7,000 wins. Line 12 FIT = 9,500; line 13 = 3,000;
    // line 14 = 2 x $500 (AGI 50,001-100,000 tier) = 1,000 -> line 15 =
    // 20,500; line 16 = 69,500. Tax: table row 69,500-69,600 midpoint
    // 69,550 -> 220 + 5% x 63,550 = 3,397.50 -> $3,398. OC 200 -> 3,198;
    // use tax 50 + $2 checkoff -> line 21 = 3,250. Withholding 3,600 ->
    // overpaid 350; applied 100 + donations 25 -> refund $225.
    const input = {
      jurisdiction: "al" as const,
      filingStatus: "mfj",
      alWages: 85000,
      alInterestDividends: 1200,
      alOtherIncome: 3000,
      alTaxableRetirementYou: 10000,
      alIs65You: true,
      alTaxableRetirementSpouse: 2000,
      alAdjustments: 5200,
      alItemizedDeductions: 7000,
      alFederalTaxPlusNiit: 9500,
      alDependents: 2,
      nonrefundableCredits: 200,
      useTax: 50,
      alCampaignCheckoff: 2,
      stateWithholding: 3600,
      alAppliedToNextYear: 100,
      alDonations: 25,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "7_other_income")).toBe("$9,000");
    expect(dollars(lines, "10_alabama_agi")).toBe("$90,000");
    expect(dollars(lines, "11_deduction")).toBe("$7,000");
    expect(lines["_deduction_method"]).toBe("itemized");
    expect(dollars(lines, "12_federal_tax_deduction")).toBe("$9,500");
    expect(dollars(lines, "13_personal_exemption")).toBe("$3,000");
    expect(dollars(lines, "14_dependent_exemption")).toBe("$1,000");
    expect(dollars(lines, "16_taxable_income")).toBe("$69,500");
    expect(dollars(lines, "17_tax")).toBe("$3,398");
    expect(dollars(lines, "18_net_tax")).toBe("$3,198");
    expect(dollars(lines, "21_total_tax")).toBe("$3,250");
    expect(dollars(lines, "32_overpaid")).toBe("$350");
    expect(dollars(lines, "35_refund")).toBe("$225");
    expect(notes.some((n) => n.includes("HB388 died"))).toBe(true);
  });

  it("single wage earner: AGI-phased standard deduction row and the shared single/MFS/HOF tax column", () => {
    // AGI 30,000 -> standard row 30,000-30,499 = 3,000 - 25 x 9 = $2,775;
    // line 16 = 30,000 - (2,775 + 1,800 + 1,500) = 23,925 -> table row
    // 23,900-24,000 midpoint 23,950 -> 110 + 5% x 20,950 = 1,157.50 ->
    // $1,158; withholding 1,000 -> owe $158.
    const input = {
      jurisdiction: "al" as const,
      filingStatus: "single",
      alWages: 30000,
      alFederalTaxPlusNiit: 1800,
      stateWithholding: 1000,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "11_deduction")).toBe("$2,775");
    expect(dollars(lines, "13_personal_exemption")).toBe("$1,500");
    expect(dollars(lines, "16_taxable_income")).toBe("$23,925");
    expect(dollars(lines, "17_tax")).toBe("$1,158");
    expect(dollars(lines, "30_amount_you_owe")).toBe("$158");
  });

  it("QSS maps to SINGLE (Alabama HOF expressly excludes a surviving spouse); AL composes without federalAGI", () => {
    const input = { jurisdiction: "al" as const, filingStatus: "qss", alWages: 10000 };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "13_personal_exemption")).toBe("$1,500");
    expect(dollars(lines, "11_deduction")).toBe("$3,000"); // single column, AGI below $26,000
    expect(notes.some((n) => n.includes("EXPRESSLY EXCLUDES a surviving spouse"))).toBe(true);
  });
});

describe("composeOR — 2025 Form OR-40 (real corpus targets)", () => {
  it("full MFJ return: federal tax subtraction, Chart J tax, exemption + political credits, kicker, EIC, Kids Credit phased out", () => {
    // Hand-computed: line 10 worksheet = 4,200 (under the $8,500 cap at AGI
    // 65,000); line 14 = 4,200 + 1,800 = 6,000; line 15 = 59,000; standard
    // 5,670 -> line 19 = 53,330 -> Chart J: 3,756 + 8.75% x 3,330 =
    // 4,047.375 -> $4,047. Credits: 4 x $256 = 1,024 + political $100 ->
    // line 31 = 2,923. Kicker 9.863% x 3,000 = 295.89 -> $296; EIC 9% x
    // 1,200 = $108; Kids Credit $0 (QI 59,000 over $31,550). Line 40 =
    // 296 + 3,200 + 108 = 3,604 -> refund $681.
    const input = {
      jurisdiction: "or" as const,
      filingStatus: "mfj",
      federalAGI: 65000,
      orFederal1040Line22: 4200,
      orSubtractions: 1800,
      orRegularExemptions: 4,
      orPoliticalContributions: 120,
      or2024TaxLiability: 3000,
      stateWithholding: 3200,
      federalEITC: 1200,
      orKidsUnder6: 2,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "10_federal_tax_subtraction")).toBe("$4,200");
    expect(dollars(lines, "15_income_after_subtractions")).toBe("$59,000");
    expect(dollars(lines, "18_deduction")).toBe("$5,670");
    expect(dollars(lines, "19_taxable_income")).toBe("$53,330");
    expect(dollars(lines, "20_tax")).toBe("$4,047");
    expect(dollars(lines, "25_exemption_credit")).toBe("$1,024");
    expect(dollars(lines, "26_political_contribution_credit")).toBe("$100");
    expect(dollars(lines, "31_tax_after_credits")).toBe("$2,923");
    expect(dollars(lines, "32_kicker")).toBe("$296");
    expect(dollars(lines, "37_eic")).toBe("$108");
    expect(lines["38_kids_credit"]).toBeUndefined();
    expect(dollars(lines, "41_overpayment")).toBe("$681");
    expect(dollars(lines, "53_net_refund")).toBe("$681");
    expect(notes.some((n) => n.includes("Kids Credit $0"))).toBe(true);
    expect(notes.some((n) => n.includes("9.863%"))).toBe(true);
  });

  it("single high earner: Table 4 phase-out step, Chart S tax, exemption credit cliff", () => {
    // AGI 130,000 -> federal tax subtraction capped at the $5,100 step
    // (not 22,000); line 19 = 130,000 - 5,100 - 2,835 = 122,065 -> Chart S:
    // 4,065 + 8.75% x 72,065 = 10,370.69 -> $10,371; exemption credit $0
    // (AGI over $100,000 cliff).
    const input = {
      jurisdiction: "or" as const,
      filingStatus: "single",
      federalAGI: 130000,
      orFederal1040Line22: 22000,
      orRegularExemptions: 1,
      stateWithholding: 11000,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "10_federal_tax_subtraction")).toBe("$5,100");
    expect(dollars(lines, "19_taxable_income")).toBe("$122,065");
    expect(dollars(lines, "20_tax")).toBe("$10,371");
    expect(lines["25_exemption_credit"]).toBeUndefined();
    expect(dollars(lines, "47_refund")).toBe("$629");
  });

  it("MFS with itemizing spouse: standard deduction $0, itemized used; table tax below $50,000", () => {
    // line 10 = 2,500 (under the $4,250 MFS cap); line 15 = 37,500; std $0
    // (spouse itemizes) -> itemized 3,000 -> line 19 = 34,500 -> table row
    // 34,500-34,600 midpoint 34,550: 661 + 8.75% x 23,450 = 2,712.875 ->
    // $2,713.
    const input = {
      jurisdiction: "or" as const,
      filingStatus: "mfs",
      federalAGI: 40000,
      orFederal1040Line22: 2500,
      orSpouseItemizes: true,
      orItemizedDeductions: 3000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "18_deduction")).toBe("$3,000");
    expect(lines["_deduction_method"]).toBe("itemized");
    expect(dollars(lines, "19_taxable_income")).toBe("$34,500");
    expect(dollars(lines, "20_tax")).toBe("$2,713");
    expect(notes.some((n) => n.includes("standard deduction is $0 because the spouse itemizes"))).toBe(true);
  });
});

describe("composeOK — 2025 Form 511 (real corpus targets)", () => {
  it("full MFJ return: retirement exclusion, 529 cap, table tax, prorated child credit, sales tax relief denied by income", () => {
    // Hand-computed: line 2 = $10,000 (12,000 OPERS capped); line 7 = 55,000;
    // line 8 = 20,000 (25,000 of 529 contributions capped at the joint
    // $20,000); line 9 = 35,000; 10 = 12,700; 11 = 4 x 1,000; 13 = 18,300 ->
    // joint column row [18,300-18,350): 307 + 4.75% x 3,925 = 493.44 -> $493.
    // Line 15: 5% x 4,400 = 220, PRORATED (line 7 55,000 < line 1 65,000):
    // 220 x 55/65 = 186.15 -> $186. Line 18 = 307. Withholding 1,800 ->
    // refund $1,493. Sales tax relief: household income 66,000 > $50,000.
    const input = {
      jurisdiction: "ok" as const,
      filingStatus: "mfj",
      federalAGI: 65000,
      okGovRetirementYou: 12000,
      exemptions: 4,
      ok529Contributions: 25000,
      okFederalChildTaxCredit: 4400,
      stateWithholding: 1800,
      okStrEligible: true,
      okStrHasDependent: true,
      okGrossHouseholdIncome: 66000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "2_subtractions")).toBe("$10,000");
    expect(dollars(lines, "7_oklahoma_agi")).toBe("$55,000");
    expect(dollars(lines, "8_adjustments")).toBe("$20,000");
    expect(dollars(lines, "10_deduction")).toBe("$12,700");
    expect(dollars(lines, "11_exemptions")).toBe("$4,000");
    expect(dollars(lines, "13_taxable_income")).toBe("$18,300");
    expect(dollars(lines, "14a_tax_from_table")).toBe("$493");
    expect(dollars(lines, "15_child_care_child_tax_credit")).toBe("$186");
    expect(dollars(lines, "18_income_tax")).toBe("$307");
    expect(lines["25_sales_tax_relief_credit"]).toBeUndefined();
    expect(dollars(lines, "34_overpayment")).toBe("$1,493");
    expect(dollars(lines, "38_refund")).toBe("$1,493");
    expect(notes.some((n) => n.includes("capped at $20,000"))).toBe(true);
    expect(notes.some((n) => n.includes("PRORATED on Schedule 511-F"))).toBe(true);
    expect(notes.some((n) => n.includes("sales tax relief credit $0"))).toBe(true);
  });

  it("HOH low-income return: 2020-rule EIC from the better of two years, sales tax relief, use tax estimate", () => {
    // 13 = 24,000 - 9,350 - 2,000 = 12,650 -> joint column row [12,650-12,700):
    // 134.50 + 3.75% x 2,875 = 242.31 -> $242; line 15 = 5% x 2,200 = $110 ->
    // line 18 = 132; use tax table at FAGI 24,000 -> $13; line 20 = 145.
    // EIC: 2025 column (EI 24,000, AGI 24,000, 1 child) = 3,583.60 - 15.98% x
    // (24,025 - 19,330) = 2,833.34 -> $2,833; 2024 column (EI 18,000) = the
    // $3,584 maximum -> line 20 = 3,584 -> 5% = 179.20 -> $179. Sales tax
    // relief 2 x $40 = $80 (24,000 <= $50,000 with a dependent). Payments
    // 300 + 80 + 179 = 559 -> refund 414.
    const input = {
      jurisdiction: "ok" as const,
      filingStatus: "hoh",
      federalAGI: 24000,
      exemptions: 2,
      okFederalChildTaxCredit: 2200,
      okUseTaxEstimate: true,
      stateWithholding: 300,
      okStrEligible: true,
      okStrHasDependent: true,
      okGrossHouseholdIncome: 24000,
      okEicEligible: true,
      okEicQualifyingChildren: 1,
      okEicEarnedIncome2025: 24000,
      okEicEarnedIncome2024: 18000,
      okEicAgi2024: 18000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "13_taxable_income")).toBe("$12,650");
    expect(dollars(lines, "14a_tax_from_table")).toBe("$242");
    expect(dollars(lines, "15_child_care_child_tax_credit")).toBe("$110");
    expect(dollars(lines, "18_income_tax")).toBe("$132");
    expect(dollars(lines, "19_use_tax")).toBe("$13");
    expect(dollars(lines, "20_balance")).toBe("$145");
    expect(dollars(lines, "25_sales_tax_relief_credit")).toBe("$80");
    expect(dollars(lines, "_form_511_eic_line_20")).toBe("$3,584");
    expect(dollars(lines, "28_earned_income_credit")).toBe("$179");
    expect(dollars(lines, "34_overpayment")).toBe("$414");
    expect(dollars(lines, "38_refund")).toBe("$414");
    expect(notes.some((n) => n.includes("2024 earned income column"))).toBe(true);
    expect(notes.some((n) => n.includes("Box D: qualified exemptions defaulted to the 2"))).toBe(true);
  });

  it("single with out-of-state rental income: Schedule 511-E proration, mandatory itemizing with the $17,000 cap, child credit cliff, balance due", () => {
    // line 4 = 20,000 -> line 7 = 100,000; Schedule 511-D: 30,000 - 10,000
    // SALT = 20,000; line 6 = 20,000 - 2,000 charity = 18,000 > 17,000 ->
    // 17,000 + 2,000 = 19,000; + 1,000 exemption = 20,000 x (100,000 /
    // 120,000) = 16,666.67 -> $16,667 (lines 10-11 blank); 13 = 83,333 ->
    // single row [83,300-83,350): 153.50 + 4.75% x 76,125 = 3,769.44 ->
    // $3,769; line 15 $0 (FAGI over $100,000); use tax 25 -> line 20 3,794;
    // withholding 3,000 -> owe $794.
    const input = {
      jurisdiction: "ok" as const,
      filingStatus: "single",
      federalAGI: 120000,
      okOutOfStateIncome: 20000,
      exemptions: 1,
      okFederalItemized: true,
      okFederalItemizedTotal: 30000,
      okFederalSaltDeducted: 10000,
      okFederalCharity: 2000,
      okFederalChildTaxCredit: 2200,
      useTax: 25,
      stateWithholding: 3000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "4_out_of_state_income")).toBe("$20,000");
    expect(dollars(lines, "7_oklahoma_agi")).toBe("$100,000");
    expect(lines["10_deduction"]).toBeUndefined();
    expect(dollars(lines, "_schedule_511e_total_before_proration")).toBe("$20,000");
    expect(dollars(lines, "12_total_deductions_and_exemptions")).toBe("$16,667");
    expect(dollars(lines, "13_taxable_income")).toBe("$83,333");
    expect(dollars(lines, "14a_tax_from_table")).toBe("$3,769");
    expect(lines["15_child_care_child_tax_credit"]).toBeUndefined();
    expect(dollars(lines, "20_balance")).toBe("$3,794");
    expect(dollars(lines, "39_tax_due")).toBe("$794");
    expect(dollars(lines, "42_total_tax_penalty_and_interest")).toBe("$794");
    expect(notes.some((n) => n.includes("federal AGI exceeds $100,000"))).toBe(true);
    expect(notes.some((n) => n.includes("Schedule 511-E"))).toBe(true);
  });

  it("MFJ at the survey trap: taxable $12,400 is still in the 3.75% bracket ($233); federalAGI is required", () => {
    const input = { jurisdiction: "ok" as const, filingStatus: "mfj", federalAGI: 27100, exemptions: 2 };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "13_taxable_income")).toBe("$12,400");
    expect(dollars(lines, "14a_tax_from_table")).toBe("$233");
    expect(() => composeStateReturn({ jurisdiction: "ok" as const, filingStatus: "mfj" }, realPaEval({}))).toThrow(/federalAGI is required/);
  });
});

describe("composeCT — 2025 Form CT-1040 (real corpus targets)", () => {
  it("single with property tax credit: Tables B/C/E on CT AGI, Schedule 3 phase-out, refund", () => {
    // AGI 60,000: no exemption; Table B 2,000 + 5.5% x 10,000 = 2,550; Table C
    // one step $25; Table E .10 -> 257.50 -> 258 -> line 6 = 2,317. Property
    // tax 3,000 + 400 -> $300 cap x (1 - .30) = 210 (AGI over 49,500 by
    // 10,500 -> 2 steps). Line 12 = 2,107; withholding 2,500 -> refund 393.
    const input = {
      jurisdiction: "ct" as const, filingStatus: "single", federalAGI: 60000,
      ctPropertyTaxResidence: 3000, ctPropertyTaxAuto1: 400, stateWithholding: 2500, useTax: 0,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "5_connecticut_agi")).toBe("$60,000");
    expect(dollars(lines, "6_income_tax")).toBe("$2,317");
    expect(dollars(lines, "68_schedule3_credit")).toBe("$210");
    expect(dollars(lines, "11_property_tax_credit")).toBe("$210");
    expect(dollars(lines, "14_connecticut_income_tax")).toBe("$2,107");
    expect(dollars(lines, "22_overpayment")).toBe("$393");
    expect(dollars(lines, "25_refund")).toBe("$393");
    expect(notes.some((n) => n.includes("capped at $300"))).toBe(true);
  });

  it("MFJ retirees with Social Security, pension, teachers' retirement, EITC add-on, and an other-jurisdiction credit", () => {
    // FAGI 90,000 (< 100,000): SS 12,000 subtracted in full; pension 20,000 x
    // 1.00 = 20,000; teachers 10,000 -> 5,000 -> line 4 = 37,000; CT AGI 53,000.
    // Exemption 24,000 - 5 x 1,000 = 19,000; taxable 34,000 -> 400 + 4.5% x
    // 14,000 = 1,030; Table E .10 -> 103 -> line 6 = 927. Property 250 (AGI
    // 53,000 <= 70,500 -> decimal 0) -> 250. Schedule 2: 10,000 / 53,000 =
    // .1887 x (927 - 250 = 677) = 127.75 -> 128 <= 500 paid -> line 7 = 128.
    // Line 8 = 799; line 11 = 250; line 12 = 549. EITC 40% x 1,500 = 600 +
    // 250 = 850. Payments 1,000 + 850 = 1,850 -> refund 1,301.
    const input = {
      jurisdiction: "ct" as const, filingStatus: "mfj", federalAGI: 90000,
      taxableSocialSecurity: 12000, ctSsTotalBenefits: 20000, ctSsProvisionalExcess: 30000,
      ctPensionAnnuityIncome: 20000, ctTeachersRetirement: 10000,
      ctPropertyTaxResidence: 250, ctOtherJurisdictionIncome: 10000, ctOtherJurisdictionTaxPaid: 500,
      federalEITC: 1500, ctEitcQualifyingChild: true, stateWithholding: 1000, useTax: 0,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "41_social_security_adjustment")).toBe("$12,000");
    expect(dollars(lines, "48b_pension_annuity_subtraction")).toBe("$20,000");
    expect(dollars(lines, "45_teachers_retirement_50pct")).toBe("$5,000");
    expect(dollars(lines, "5_connecticut_agi")).toBe("$53,000");
    expect(dollars(lines, "6_income_tax")).toBe("$927");
    expect(dollars(lines, "7_other_jurisdiction_credit")).toBe("$128");
    expect(dollars(lines, "11_property_tax_credit")).toBe("$250");
    expect(dollars(lines, "12_tax_after_property_credit")).toBe("$549");
    expect(dollars(lines, "20a_earned_income_tax_credit")).toBe("$850");
    expect(dollars(lines, "22_overpayment")).toBe("$1,301");
    expect(notes.some((n) => n.includes("$250 qualifying-child add-on"))).toBe(true);
    expect(notes.some((n) => n.includes("subtracted in full (federal AGI under $100,000)"))).toBe(true);
  });

  it("HOH high earner: recapture, phased-out property credit, AMT, late penalty", () => {
    // AGI 200,000: Table B 7,600 + 6% x 40,000 = 10,000; Table C max 400;
    // Table D over 168,000 by 32,000 -> 4 x 40 = 160; Table E 0 -> 10,560.
    // AMT 100 -> line 10 10,660; property credit decimal 1.00 -> 0; use tax 40
    // -> line 17 10,700; withholding 9,000 -> due 1,700; late penalty 10% =
    // 170 -> total 1,870.
    const input = {
      jurisdiction: "ct" as const, filingStatus: "hoh", federalAGI: 200000,
      ctAmt: 100, ctPropertyTaxResidence: 3000, useTax: 40, stateWithholding: 9000, ctLate: true,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "6_income_tax")).toBe("$10,560");
    expect(dollars(lines, "10_total")).toBe("$10,660");
    expect(lines["11_property_tax_credit"]).toBeUndefined();
    expect(dollars(lines, "17_total_tax")).toBe("$10,700");
    expect(dollars(lines, "26_tax_due")).toBe("$1,700");
    expect(dollars(lines, "27_late_penalty")).toBe("$170");
    expect(dollars(lines, "30_total_amount_due")).toBe("$1,870");
    expect(notes.some((n) => n.includes("past the phase-out"))).toBe(true);
  });

  it("MFS for Connecticut with a joint federal return: EITC prorated to four decimals, second vehicle ignored; federalAGI required", () => {
    // AGI 30,000 MFS -> line 6 = 747 (fixture 484); property 200 (auto 2
    // ignored) -> 200; line 12 = 547. EITC 40% x 3,000 = 1,200 x (30,000 /
    // 50,000 = .6000) = 720 -> overpayment 720 - 547 = 173.
    const input = {
      jurisdiction: "ct" as const, filingStatus: "mfs", federalAGI: 30000,
      ctPropertyTaxAuto1: 200, ctPropertyTaxAuto2: 200, federalEITC: 3000, ctEitcJointFagi: 50000, useTax: 0,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "6_income_tax")).toBe("$747");
    expect(dollars(lines, "11_property_tax_credit")).toBe("$200");
    expect(dollars(lines, "20a_earned_income_tax_credit")).toBe("$720");
    expect(dollars(lines, "22_overpayment")).toBe("$173");
    expect(notes.some((n) => n.includes("second vehicle $200 IGNORED"))).toBe(true);
    expect(() => composeStateReturn({ jurisdiction: "ct" as const, filingStatus: "single" }, realPaEval({}))).toThrow(/federalAGI is required/);
  });
});

describe("composeKS — 2025 Form K-40 (real corpus targets)", () => {
  it("MFJ retirees: Social Security and KPERS subtracted, 65+ boxes, table tax, refund", () => {
    // line 3 = 80,000 − 20,000 − 30,000 = 30,000; standard 8,240 + 2 x 700 =
    // 9,640; exemptions 18,320 -> line 7 = 2,040 -> row [2,001-2,050] midpoint
    // 2,025.50 x 5.2% = 105.33 -> $105; withholding 500 -> refund 395.
    const input = {
      jurisdiction: "ks" as const, filingStatus: "mfj", federalAGI: 80000,
      taxableSocialSecurity: 20000, ksExemptRetirement: 30000, ksStdBoxes: 2, stateWithholding: 500,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "A10_social_security")).toBe("$20,000");
    expect(dollars(lines, "3_kansas_agi")).toBe("$30,000");
    expect(dollars(lines, "4_deduction")).toBe("$9,640");
    expect(dollars(lines, "5_exemption_allowance")).toBe("$18,320");
    expect(dollars(lines, "7_taxable_income")).toBe("$2,040");
    expect(dollars(lines, "8_tax")).toBe("$105");
    expect(dollars(lines, "33_overpayment")).toBe("$395");
    expect(dollars(lines, "43_refund")).toBe("$395");
    expect(notes.some((n) => n.includes("100% exempt since TY2024"))).toBe(true);
  });

  it("HOH with two dependents: child care credit, EITC split between line 17 and line 22", () => {
    // standard 6,180; exemptions 9,160 + 2,320 + 2 x 2,320 = 16,120 -> line 7 =
    // 7,700 -> row [7,651-7,700] midpoint 7,675.50 x 5.2% = 399.13 -> $399;
    // child care 50% x 600 = 300 -> line 16 = 99; KS EITC 17% x 4,000 = 680 ->
    // line 17 = 99, line 22 = 581; payments 200 + 581 = 781 -> refund 781.
    const input = {
      jurisdiction: "ks" as const, filingStatus: "hoh", federalAGI: 30000, dependents: 2,
      federalEITC: 4000, ksFederalChildCareCredit: 600, stateWithholding: 200,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "5_exemption_allowance")).toBe("$16,120");
    expect(dollars(lines, "7_taxable_income")).toBe("$7,700");
    expect(dollars(lines, "8_tax")).toBe("$399");
    expect(dollars(lines, "14_child_care_credit")).toBe("$300");
    expect(dollars(lines, "16_subtotal")).toBe("$99");
    expect(dollars(lines, "17_eitc_nonrefundable")).toBe("$99");
    expect(dollars(lines, "22_eitc_refundable")).toBe("$581");
    expect(dollars(lines, "18_total_tax_balance")).toBe("$0");
    expect(dollars(lines, "43_refund")).toBe("$781");
  });

  it("single high earner: Kansas itemized beats standard, worksheet tax, other-state credit, balance due with checkoffs", () => {
    // itemized 9,000 + 12,000 + 3,000 = 24,000 > 3,605; line 7 = 150,000 −
    // 24,000 − 9,160 = 116,840 -> worksheet 5.58% x 116,840 = 6,519.67 − 87 =
    // 6,432.67 -> $6,433; other-state credit = lesser of 2,000 or 6,433 x
    // 30,000/150,000 = 1,286.60 -> 1,287; line 18 = 5,146; withholding 4,000 ->
    // underpayment 1,146; checkoffs 10 -> owe 1,156.
    const input = {
      jurisdiction: "ks" as const, filingStatus: "single", federalAGI: 150000,
      ksPropertyTaxes: 9000, ksMortgageInterest: 12000, ksCharitableContributions: 3000,
      ksOtherStateTaxPaid: 2000, ksOtherStateIncome: 30000, stateWithholding: 4000, ksCheckoffs: 10,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "4_deduction")).toBe("$24,000");
    expect(lines["_deduction_method"]).toBe("itemized");
    expect(dollars(lines, "7_taxable_income")).toBe("$116,840");
    expect(dollars(lines, "8_tax")).toBe("$6,433");
    expect(dollars(lines, "13_other_state_credit")).toBe("$1,287");
    expect(dollars(lines, "18_total_tax_balance")).toBe("$5,146");
    expect(dollars(lines, "28_underpayment")).toBe("$1,146");
    expect(dollars(lines, "32_amount_you_owe")).toBe("$1,156");
    expect(notes.some((n) => n.includes("beat the $3,605 standard deduction"))).toBe(true);
  });

  it("federal QSS is composed as Kansas head of household; federalAGI is required", () => {
    // deduction 6,180; exemptions 9,160 + 2,320 (HOH) + 2,320 = 13,800; line 7
    // = 40,000 − 19,980 = 20,020 -> row [20,001-20,050] midpoint 20,025.50 x
    // 5.2% = 1,041.33 -> $1,041 (the joint column would give the same here
    // but the deduction/exemption differ from MFJ's 8,240/18,320).
    const input = { jurisdiction: "ks" as const, filingStatus: "qss", federalAGI: 40000, dependents: 1 };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "4_deduction")).toBe("$6,180");
    expect(dollars(lines, "5_exemption_allowance")).toBe("$13,800");
    expect(dollars(lines, "8_tax")).toBe("$1,041");
    expect(notes.some((n) => n.includes("check the Head of Household box"))).toBe(true);
    expect(() => composeStateReturn({ jurisdiction: "ks" as const, filingStatus: "single" }, realPaEval({}))).toThrow(/federalAGI is required/);
  });
});

describe("composeAR — 2025 Form AR1000F (real corpus targets)", () => {
  it("single wage earner: standard deduction, table tax, personal credit, refund", () => {
    // 23 = 40,000 + 500 = 40,500; standard 2,470 -> 28 = 38,030 -> row [38,000-38,100)
    // midpoint 38,050 x 3.9% = 1,483.95 - 419.96 = 1,063.99 -> $1,064; credit $29 ->
    // net 1,035; withholding 1,200 -> refund 165. Low income table: AGI over $17,500.
    const input = { jurisdiction: "ar" as const, filingStatus: "single", wages: 40000, arInterest: 500, stateWithholding: 1200 };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(lines._filing_status).toBe("1");
    expect(dollars(lines, "23_total_income")).toBe("$40,500");
    expect(dollars(lines, "27_deduction")).toBe("$2,470");
    expect(dollars(lines, "28_net_taxable_income")).toBe("$38,030");
    expect(dollars(lines, "29_tax")).toBe("$1,064");
    expect(dollars(lines, "34_personal_credits")).toBe("$29");
    expect(dollars(lines, "38_net_tax")).toBe("$1,035");
    expect(dollars(lines, "50_refund")).toBe("$165");
    expect(lines["26_table"]).toBe("standard");
    expect(notes.some((n) => n.includes("Low Income Tax Table not available"))).toBe(true);
  });

  it("MFJ retirees (status 2): two $6,000 exclusions, 65 boxes, doubled additional credit, credits capped", () => {
    // 18A = 20,000 - 6,000 = 14,000; 18B = 9,000 - 6,000 = 3,000; interest 1,000 -> 23 = 18,000;
    // standard 4,940 -> 28 = 13,060 -> row [13,000-13,100) midpoint 13,050 x 3% = 391.50 - 223.97
    // = 167.53 -> $168. Low income: without exclusions AGI 30,000 + SS 30,000 = 60,000 > 29,000.
    // Credits: (self + spouse + 2 boxes) x 29 = 116; additional 60 x 2 = 120 -> 236 > 168 -> net 0.
    const input = {
      jurisdiction: "ar" as const, filingStatus: "mfj", arPensionTaxablePrimary: 20000, arPensionTaxableSpouse: 9000,
      arInterest: 1000, arExemptIncome: 30000, arCreditBoxes: 2, stateWithholding: 300,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(lines._filing_status).toBe("2");
    expect(dollars(lines, "18A_pension_primary")).toBe("$14,000");
    expect(dollars(lines, "18B_pension_spouse")).toBe("$3,000");
    expect(dollars(lines, "25_agi")).toBe("$18,000");
    expect(dollars(lines, "27_deduction")).toBe("$4,940");
    expect(dollars(lines, "29_tax")).toBe("$168");
    expect(dollars(lines, "34_personal_credits")).toBe("$116");
    expect(dollars(lines, "36_other_credits")).toBe("$120");
    expect(dollars(lines, "38_net_tax")).toBe("$0");
    expect(dollars(lines, "50_refund")).toBe("$300");
    expect(notes.some((n) => n.includes("not refundable"))).toBe(true);
  });

  it("HOH with two dependents takes the Low Income Tax Table when it is lower", () => {
    // Regular: 27,000 - 2,470 = 24,530 -> midpoint 24,550 x 3.4% = 834.70 - 287.97 = 546.73 -> $547.
    // Low income (HOH 2+ table, limit 29,000): AGI 27,000 -> row [26,901-27,000] = $355. Credits:
    // (self + HOH + 2 dependents) x 29 = 116; additional credit on line 28 = 27,000 -> $35 -> 151;
    // net 204; withholding 400 -> refund 196.
    const input = { jurisdiction: "ar" as const, filingStatus: "hoh", wages: 27000, dependents: 2, stateWithholding: 400 };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(lines["26_table"]).toBe("low income table");
    expect(dollars(lines, "27_deduction")).toBe("$0");
    expect(dollars(lines, "28_net_taxable_income")).toBe("$27,000");
    expect(dollars(lines, "29_tax")).toBe("$355");
    expect(dollars(lines, "34_personal_credits")).toBe("$116");
    expect(dollars(lines, "36_other_credits")).toBe("$35");
    expect(dollars(lines, "38_net_tax")).toBe("$204");
    expect(dollars(lines, "50_refund")).toBe("$196");
    expect(notes.some((n) => n.includes("Low Income Tax Table chosen") && n.includes("$547"))).toBe(true);
    // forced regular
    const forced = composeStateReturn({ ...input, arUseLowIncomeTable: false }, realPaEval(input));
    expect(dollars(forced.lines, "29_tax")).toBe("$547");
  });

  it("two-income couple: status 4 (separately on the same return) beats status 2", () => {
    // Status 4: A = 90,000 - 40,000 = 50,000 -> 47,530 -> midpoint 47,550 x 3.9% = 1,854.45 - 419.96
    // = 1,434.49 -> $1,434; B = 40,000 -> 37,530 -> 1,464.45 - 419.96 = 1,044.49 -> $1,044; combined
    // 2,478. Status 2: 90,000 - 4,940 = 85,060 -> row [85,001-85,101) midpoint 85,051 x 3.9% =
    // 3,316.99 - 419.96 = 2,897.03 -> $2,897. Credits 58 -> net 2,420; withholding 2,000 -> due 420.
    const input = { jurisdiction: "ar" as const, filingStatus: "mfj", wages: 90000, arSpouseIncome: 40000, stateWithholding: 2000 };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(lines._filing_status).toBe("4");
    expect(dollars(lines, "25A_agi")).toBe("$50,000");
    expect(dollars(lines, "25B_agi")).toBe("$40,000");
    expect(dollars(lines, "27A_deduction")).toBe("$2,470");
    expect(dollars(lines, "27B_deduction")).toBe("$2,470");
    expect(dollars(lines, "29A_tax")).toBe("$1,434");
    expect(dollars(lines, "29B_tax")).toBe("$1,044");
    expect(dollars(lines, "30_combined_tax")).toBe("$2,478");
    expect(dollars(lines, "34_personal_credits")).toBe("$58");
    expect(dollars(lines, "38_net_tax")).toBe("$2,420");
    expect(dollars(lines, "51_amount_due")).toBe("$420");
    expect(notes.some((n) => n.includes("status 4) nets $2,420") && n.includes("status 2) nets $2,839"))).toBe(true);
    const joint = composeStateReturn({ ...input, arStatus4: false }, realPaEval(input));
    expect(joint.lines._filing_status).toBe("2");
    expect(dollars(joint.lines, "29_tax")).toBe("$2,897");
  });

  it("HOH with an approved early childhood program: the 20% AR2441 credit is refundable on line 43", () => {
    // 30,000 - 2,470 = 27,530 -> midpoint 27,550 x 3.9% = 1,074.45 - 419.96 = 654.49 -> $654; low
    // income HOH 0-1 table limit 25,300 < 30,000. Child care: 3,000 x 27% = 810 -> 20% = 162 -> line 43.
    // Credits: (self + HOH + 1 dependent) x 29 = 87; additional credit at 27,530 = $5 -> 92; net 562;
    // payments 162 -> due 400.
    const input = {
      jurisdiction: "ar" as const, filingStatus: "hoh", wages: 30000, dependents: 1, federalAGI: 30000,
      arChildCareExpenses: 3500, arChildCareQualifyingPersons: 1, arEarnedIncome: 30000, arEarlyChildhoodApproved: true,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "29_tax")).toBe("$654");
    expect(lines["35_child_care_credit"]).toBeUndefined();
    expect(dollars(lines, "43_early_childhood_credit")).toBe("$162");
    expect(dollars(lines, "36_other_credits")).toBe("$5");
    expect(dollars(lines, "38_net_tax")).toBe("$562");
    expect(dollars(lines, "51_amount_due")).toBe("$400");
    const nonrefundable = composeStateReturn({ ...input, arEarlyChildhoodApproved: false }, realPaEval(input));
    expect(dollars(nonrefundable.lines, "35_child_care_credit")).toBe("$162");
    expect(dollars(nonrefundable.lines, "38_net_tax")).toBe("$400");
    expect(() => composeStateReturn({ ...input, federalAGI: undefined }, realPaEval(input))).toThrow(/federalAGI is required for the Arkansas child care credit/);
  });

  it("status 4 runs AR1000D per column, and the exempt half of a gain still counts for the low-income test", () => {
    // Joint losses split by spouse: primary LT -2,000, spouse ST -2,000 -> each column floors at -1,500 (status 4)
    // vs -3,000 on one joint schedule (status 2). A: 60,000 - 30,000 - 1,500 = 28,500 -> 26,030 -> midpoint
    // 26,050 x 3.4% = 885.70 - 287.97 = 597.73 -> $598; B: 30,000 - 1,500 = 28,500 -> $598; combined 1,196;
    // credits 58 + additional (26,030 -> $60 each) 120 -> net 1,018. Status 2: 57,000 - 4,940 = 52,060 ->
    // midpoint 52,050 x 3.9% = 2,029.95 - 419.96 = 1,609.99 -> $1,610; net 1,610 - 58 - 0 = 1,552.
    const input = { jurisdiction: "ar" as const, filingStatus: "mfj", wages: 60000, arSpouseIncome: 30000, arLongTermGain: -2000, arSpouseShortTermGain: -2000 };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(lines._filing_status).toBe("4");
    expect(dollars(lines, "14_capital_gains")).toBe("-$3,000");
    expect(dollars(lines, "23A_total_income")).toBe("$28,500");
    expect(dollars(lines, "23B_total_income")).toBe("$28,500");
    expect(dollars(lines, "30_combined_tax")).toBe("$1,196");
    expect(dollars(lines, "38_net_tax")).toBe("$1,018");
    expect(notes.some((n) => n.includes("status 2) nets $1,552"))).toBe(true);
    // Low-income test: wages 10,000 + LT gain 14,000 -> line 23 = 17,000 (50% taxed) but income from all
    // sources is 24,000 > 17,500 -> Regular table: 17,000 - 2,470 = 14,530 -> midpoint 14,550 x 3% =
    // 436.50 - 223.97 = 212.53 -> $213.
    const gain = { jurisdiction: "ar" as const, filingStatus: "single", wages: 10000, arLongTermGain: 14000 };
    const r = composeStateReturn(gain, realPaEval(gain));
    expect(dollars(r.lines, "23_total_income")).toBe("$17,000");
    expect(r.lines["26_table"]).toBe("standard");
    expect(dollars(r.lines, "29_tax")).toBe("$213");
    expect(r.notes.some((n) => n.includes("excluded capital gain $7,000"))).toBe(true);
    // arItemize with no AR3 inputs falls back to the standard deduction
    const noItems = { jurisdiction: "ar" as const, filingStatus: "single", wages: 30000, arItemize: true };
    const i = composeStateReturn(noItems, realPaEval(noItems));
    expect(dollars(i.lines, "27_deduction")).toBe("$2,470");
    expect(i.notes.some((n) => n.includes("no AR3 amounts were given"))).toBe(true);
  });

  it("65 Special is added when the low-income election forgoes the pension exclusion", () => {
    // Single, 66, pension 5,000 taxable + interest 11,000: regular: 18A = 0 -> 23 = 11,000 -> 8,530 -> midpoint
    // 8,550 x 2% = 171.00 - 111.98 = 59.02 -> $59; credits 29 + 60 -> net 0. Low table (exclusion forgone):
    // AGI 16,000 -> row [15,901-16,000] = $117; credits 29 + 29 (65 Special now available) + 60 = 118 -> net 0.
    // Tie -> regular kept. With a 65 box already claimed on the regular path (arCreditBoxes 1) the 65 box and
    // the 65 Special box are both $29 on the low path.
    const input = { jurisdiction: "ar" as const, filingStatus: "single", arInterest: 11000, arPensionTaxablePrimary: 5000, arAge65Count: 1, arCreditBoxes: 1, arUseLowIncomeTable: true };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(lines["26_table"]).toBe("low income table");
    expect(dollars(lines, "29_tax")).toBe("$117");
    expect(dollars(lines, "34_personal_credits")).toBe("$87");
    expect(notes.some((n) => n.includes("65 Special"))).toBe(true);
  });
});

describe("composeNM — 2025 Form PIT-1 (real corpus targets)", () => {
  it("single wage earner: federal deduction, no exemptions phase, rate table, refund", () => {
    // 17 = 50,000 − 15,750 = 34,250 → row (34,200, 34,300] midpoint 34,250: 1,165.50 + 4.7% × 750 = 1,200.75 → $1,201;
    // low/middle exemption: AGI 50,000 > 36,667 → 0; withholding 1,500 → refund 299.
    const input = { jurisdiction: "nm" as const, filingStatus: "single", federalAGI: 50000, nmFederalDeduction: 15750, stateWithholding: 1500 };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(lines._filing_status).toBe("1");
    expect(lines["5_exemptions"]).toBe("1");
    expect(dollars(lines, "17_taxable_income")).toBe("$34,250");
    expect(dollars(lines, "18_tax")).toBe("$1,201");
    expect(dollars(lines, "22_net_tax")).toBe("$1,201");
    expect(dollars(lines, "42_refund")).toBe("$299");
    expect(lines["14_low_middle_income_exemption"]).toBeUndefined();
    expect(notes.some((n) => n.includes("nmModifiedGrossIncome"))).toBe(false); // AGI over the LICTR limit, nothing to skip
  });

  it("MFJ family of five: $4,000 dependents deduction, child income tax credit, refund", () => {
    // line 5 = 5; line 13 = 4,000 × (3 − 1) = 8,000; line 14: AGI 60,000 > 55,000 → 0;
    // 17 = 60,000 − 31,500 − 8,000 = 20,500 → row (20,400, 20,500] midpoint 20,450: 120 + 3.2% × 12,450 = 518.40 → $518;
    // child credit: AGI 60,000 → $212 × 3 = 636 (LICTR skipped: MGI 60,000 > 36,000); payments 636 + 800 → refund 918.
    const input = {
      jurisdiction: "nm" as const, filingStatus: "mfj", federalAGI: 60000, nmFederalDeduction: 31500, dependents: 3,
      nmQualifyingChildren: 3, nmModifiedGrossIncome: 60000, stateWithholding: 800,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(lines["5_exemptions"]).toBe("5");
    expect(dollars(lines, "13_dependents_deduction")).toBe("$8,000");
    expect(dollars(lines, "17_taxable_income")).toBe("$20,500");
    expect(dollars(lines, "18_tax")).toBe("$518");
    expect(dollars(lines, "RC25_child_income_tax_credit")).toBe("$636");
    expect(dollars(lines, "24_rebates_and_credits")).toBe("$636");
    expect(dollars(lines, "42_refund")).toBe("$918");
  });

  it("low-income HOH: low/middle exemption zeroes the tax; LICTR, child credit, and working families credit refund", () => {
    // line 5 = 2; line 13 = 0 (one dependent); line 14: AGI 18,000 ≤ 30,000 → 2,500 × 2 = 5,000; 17 = 18,000 − 23,625 − 5,000 < 0 → 0;
    // LICTR: MGI 20,000, 2 exemptions → row 19,501-21,000 col 2 = $120; child credit AGI 18,000 → $637; WFTC 25% × 3,000 = 750;
    // payments 120 + 637 + 750 + 100 = 1,607 → refund 1,607.
    const input = {
      jurisdiction: "nm" as const, filingStatus: "hoh", federalAGI: 18000, nmFederalDeduction: 23625, dependents: 1,
      nmModifiedGrossIncome: 20000, nmQualifyingChildren: 1, federalEITC: 3000, stateWithholding: 100,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "14_low_middle_income_exemption")).toBe("$5,000");
    expect(dollars(lines, "17_taxable_income")).toBe("$0");
    expect(dollars(lines, "RC14_lictr")).toBe("$120");
    expect(dollars(lines, "RC25_child_income_tax_credit")).toBe("$637");
    expect(dollars(lines, "25_working_families_credit")).toBe("$750");
    expect(dollars(lines, "42_refund")).toBe("$1,607");
    expect(notes.some((n) => n.includes("Cannot be less than zero"))).toBe(true);
  });

  it("MFJ retirees: Social Security exemption, 65+/blind exemption, armed forces retirement, medical credit, property tax rebate", () => {
    // line 5 = 2; line 14: AGI 40,000 → (2,500 − 10% × 10,000) × 2 = 3,000; PIT-ADJ: SS 15,000 + 65+ (AGI 40,000 → 4,000 × 2 = 8,000)
    // + armed forces 20,000 + medical 3,000 = 46,000; 17 = 40,000 − 35,200 − 3,000 − 46,000 < 0 → 0; tax 0.
    // PIT-RC: LICTR MGI 45,000 > 36,000 → skipped; 65+ property rebate MGI > 16,000 → 0; medical credit $2,800 → refund 2,800.
    const input = {
      jurisdiction: "nm" as const, filingStatus: "mfj", federalAGI: 40000, nmFederalDeduction: 35200, taxableSocialSecurity: 15000,
      nmAge65OrBlindPersons: 2, nmAge65Count: 2, nmArmedForcesRetirementPay: 20000, nmMedicalExpenses: 30000,
      nmModifiedGrossIncome: 45000, nmPropertyTaxBilled: 900,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "14_low_middle_income_exemption")).toBe("$3,000");
    expect(dollars(lines, "ADJ25_social_security_exemption")).toBe("$15,000");
    expect(dollars(lines, "ADJ13_age65_blind_exemption")).toBe("$8,000");
    expect(dollars(lines, "ADJ24_armed_forces_retirement")).toBe("$20,000");
    expect(dollars(lines, "ADJ18_medical_exemption_65")).toBe("$3,000");
    expect(dollars(lines, "15_deductions_exemptions")).toBe("$46,000");
    expect(dollars(lines, "17_taxable_income")).toBe("$0");
    expect(dollars(lines, "RC23_medical_care_credit_65")).toBe("$2,800");
    expect(lines["RC17c_property_tax_rebate_65"]).toBeUndefined();
    expect(dollars(lines, "42_refund")).toBe("$2,800");
    expect(notes.some((n) => n.includes("exceeds $16,000"))).toBe(true);
  });

  it("itemizer with other-state income: SALT add-back, other-state credit worksheet, PIT-CR cap, tax due", () => {
    // 10: 5a 12,000 / 5d 20,000 = 0.6 × 5e 10,000 = 6,000; itemized 30,000 − standard 15,750 = 14,250 → 6,000;
    // 17 = 120,000 + 6,000 − 30,000 = 96,000 → row (95,900, 96,000] midpoint 95,950: 2,716.50 + 4.9% × 29,450 = 4,159.55 → $4,160 (printed 4,160);
    // line 20: NM rate 4,160 / 96,000 = 0.0433; other state 2,000 / 40,000 = 0.0500; dual 40,000 → 1,732 vs 2,000 → 1,732;
    // PIT-CR 3,000 capped at 4,160 − 1,732 = 2,428 → 22 = 0; payments 0 → due 0.
    const input = {
      jurisdiction: "nm" as const, filingStatus: "single", federalAGI: 120000, nmFederalDeduction: 30000, nmFederalItemized: true,
      nmSaltIncomeTaxes: 12000, nmSaltTotal: 20000, nmSaltAllowed: 10000, nmFederalStandardDeduction: 15750,
      nmOtherStateTax: 2000, nmOtherStateTaxableIncome: 40000, nmIncomeTaxedByBothStates: 40000, nonrefundableCredits: 3000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "10_salt_addback")).toBe("$6,000");
    expect(dollars(lines, "17_taxable_income")).toBe("$96,000");
    expect(dollars(lines, "18_tax")).toBe("$4,160");
    expect(dollars(lines, "20_other_state_credit")).toBe("$1,732");
    expect(dollars(lines, "21_business_credits_applied")).toBe("$2,428");
    expect(dollars(lines, "22_net_tax")).toBe("$0");
    expect(notes.some((n) => n.includes("may not exceed the sum of PIT-1, lines 18 and 19"))).toBe(true);
    expect(() => composeStateReturn({ jurisdiction: "nm" as const, filingStatus: "single", federalAGI: 50000 }, realPaEval({}))).toThrow(/nmFederalDeduction is required/);
  });
});

describe("composeNM — review follow-ups", () => {
  it("counts a 65-year-old taxpayer and a blind spouse as two exemptions by default, and says so", () => {
    // AGI 45,000 → joint table: ceil(15,000 / 3,000) = 5 → $3,000 per person × 2 = $6,000; low/middle: (2,500 − 10% × 15,000) × 2 = 2,000;
    // 17 = 45,000 − 31,500 − 6,000 − 2,000 = 5,500
    const input = { jurisdiction: "nm" as const, filingStatus: "mfj", federalAGI: 45000, nmFederalDeduction: 31500, nmAge65Count: 1, nmBlindCount: 1 };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "ADJ13_age65_blind_exemption")).toBe("$6,000");
    expect(dollars(lines, "14_low_middle_income_exemption")).toBe("$2,000");
    expect(dollars(lines, "17_taxable_income")).toBe("$5,500");
    expect(notes.some((n) => n.includes("assumed the 1 person(s) 65 or older and the 1 blind person(s) are different people"))).toBe(true);
    const same = composeStateReturn({ ...input, nmAge65OrBlindPersons: 1 }, realPaEval(input));
    expect(dollars(same.lines, "ADJ13_age65_blind_exemption")).toBe("$3,000");
  });

  it("nets penalty and interest against an overpayment on line 39 without also showing them due on line 38", () => {
    // 17 = 40,000 − 15,750 = 24,250 → midpoint 24,250: 434.50 + 4.3% × 7,750 = 767.75 → $768; withholding 1,500 → overpayment 732 − 75 = 657
    const input = { jurisdiction: "nm" as const, filingStatus: "single", federalAGI: 40000, nmFederalDeduction: 15750, stateWithholding: 1500, nmLatePenalty: 50, nmInterest: 25 };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "18_tax")).toBe("$768");
    expect(dollars(lines, "39_overpayment")).toBe("$657");
    expect(dollars(lines, "38_total_due")).toBe("$0");
    expect(dollars(lines, "42_refund")).toBe("$657");
  });

  it("MFS subtracts the spouse's PIT-RC line 2g exemptions, and the exemptions never go negative", () => {
    // line 5 = 1 (MFS, no dependents); rebate exemptions = 1 − 0 + 0 + 0 − 1 = 0 → LICTR $0
    const input = { jurisdiction: "nm" as const, filingStatus: "mfs", federalAGI: 12000, nmFederalDeduction: 15750, nmModifiedGrossIncome: 12000, nmSpouseRebateExemptionsClaimed: 1 };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(lines["RC14_lictr"]).toBeUndefined();
    const withEx = composeStateReturn({ ...input, nmSpouseRebateExemptionsClaimed: 0 }, realPaEval(input));
    expect(dollars(withEx.lines, "RC14_lictr")).toBe("$75"); // row 11,501-13,000 col 1 = 149 → half 74.50 → $75
  });
});

describe("composeNE — 2025 Form 1040N (real corpus targets)", () => {
  it("single wage earner: standard deduction, Calculation Schedule tax, $171 credit, small balance due", () => {
    // 11 = 50,000 − 8,600 = 41,400 = 14; 15 = 1,543.28 + 5.2% × 2,530 = 1,674.84 → $1,675; 18 = 171; 35 = 1,504 (federal
    // tax not given → cap not evaluated, note); withholding 1,500 → due $4.
    const input = { jurisdiction: "ne" as const, filingStatus: "single", federalAGI: 50000, stateWithholding: 1500 };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(lines["4_personal_exemptions"]).toBe("1");
    expect(dollars(lines, "6_standard_deduction")).toBe("$8,600");
    expect(dollars(lines, "14_taxable_income")).toBe("$41,400");
    expect(dollars(lines, "15_income_tax")).toBe("$1,675");
    expect(dollars(lines, "18_personal_exemption_credit")).toBe("$171");
    expect(dollars(lines, "35_tax_after_nonrefundable_credits")).toBe("$1,504");
    expect(dollars(lines, "59_amount_due")).toBe("$4");
    expect(notes.some((n) => n.includes("cap was NOT evaluated"))).toBe(true);
  });

  it("MFJ retirees: Social Security and military retirement excluded in full, 65+ boxes, credits exceed the tax", () => {
    // 6 = 17,200 + 2 × 1,650 = 20,500; 11 = 39,500; 13 = 20,000 + 10,000 = 30,000; 14 = 9,500;
    // 15 = 197.78 + 3.51% × 1,460 = 249.03 → $249; 18 = 342 > 249 → 35 = 0; refund = 600.
    const input = {
      jurisdiction: "ne" as const, filingStatus: "mfj", federalAGI: 60000, taxableSocialSecurity: 20000, neMilitaryRetirement: 10000,
      ageOrBlindBoxes: 2, neFederalTaxBeforeCredits: 1200, stateWithholding: 600,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "6_standard_deduction")).toBe("$20,500");
    expect(dollars(lines, "13_adjustments_decreasing")).toBe("$30,000");
    expect(dollars(lines, "14_taxable_income")).toBe("$9,500");
    expect(dollars(lines, "15_income_tax")).toBe("$249");
    expect(dollars(lines, "18_personal_exemption_credit")).toBe("$342");
    expect(dollars(lines, "35_tax_after_nonrefundable_credits")).toBe("$0");
    expect(dollars(lines, "63_refund")).toBe("$600");
    expect(notes.some((n) => n.includes("100% since TY2024"))).toBe(true);
  });

  it("low-income HOH: refundable Form 2441N credit, 10% EIC, refund", () => {
    // 4 = 3; 6 = 12,600; 14 = 13,400; 15 = 184.75 + 3.51% × 5,890 = 391.49 → $391; 18 = 513 → 35 = 0.
    // 42: AGI 26,000 ≤ 29,000: expenses 5,000 (cap 6,000, earned 26,000) × .29 (6 steps) = 1,450 × .60 (4 steps) = 870;
    // 44 = 300; payments 300 + 870 + 300 = 1,470 → refund 1,470. Line 23 stays $0 (AGI not over $29,000).
    const input = {
      jurisdiction: "ne" as const, filingStatus: "hoh", federalAGI: 26000, dependents: 2, federalEITC: 3000, neFederalChildCareCredit: 700,
      neChildCareExpenses: 5000, neChildCareQualifyingPersons: 2, neEarnedIncome: 26000, stateWithholding: 300,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(lines["4_personal_exemptions"]).toBe("3");
    expect(dollars(lines, "15_income_tax")).toBe("$391");
    expect(dollars(lines, "18_personal_exemption_credit")).toBe("$513");
    expect(lines["23_child_care_nonrefundable"]).toBeUndefined();
    expect(dollars(lines, "42_child_care_refundable")).toBe("$870");
    expect(dollars(lines, "44_earned_income_credit")).toBe("$300");
    expect(dollars(lines, "63_refund")).toBe("$1,470");
  });

  it("itemizer with other-state income: Nebraska itemized deductions, Schedule II credit, federal tax cap, use tax", () => {
    // 9 = 30,000 − 12,000 = 18,000 > 8,600 → 10 = 18,000; 14 = 102,000; 15 = 1,543.28 + 5.2% × 63,130 = 4,826.04 → $4,826;
    // 19: 4,826 × (40,000 / 120,000 = .33333) = 1,608.65 → 1,609; min(4,826, 1,609, 2,500) = 1,609; 34 = 171 + 1,609 = 1,780;
    // 35 = min(3,046, federal 1,000) = 1,000; 58 = 83 + 23 = 106; 57 + 58 = 1,106; withholding 3,000 → refund 1,894.
    const input = {
      jurisdiction: "ne" as const, filingStatus: "single", federalAGI: 120000, neFederalItemized: true, neFederalItemizedDeductions: 30000, neSaltIncomeTaxes: 12000,
      neOtherStateAgi: 40000, neOtherStateTaxPaid: 2500, neFederalTaxBeforeCredits: 1000, neUseTaxPurchases: 1500, neLocalUseTaxRate: 1.5, stateWithholding: 3000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(lines._deduction_method).toBe("itemized");
    expect(dollars(lines, "10_nebraska_deductions")).toBe("$18,000");
    expect(dollars(lines, "15_income_tax")).toBe("$4,826");
    expect(dollars(lines, "19_other_state_credit")).toBe("$1,609");
    expect(dollars(lines, "35_tax_after_nonrefundable_credits")).toBe("$1,000");
    expect(dollars(lines, "58_use_tax")).toBe("$106");
    expect(dollars(lines, "63_refund")).toBe("$1,894");
    expect(notes.some((n) => n.includes("§ 77-2715(1)"))).toBe(true);
  });

  it("paper filer: the Tax Table method (row midpoints) and the endpoint worksheet above $77,760", () => {
    // 14 = 100,000 − 17,200 = 82,800 (MFJ) → table worksheet 3,088 + 5.2% × 5,040 = 3,350.08 → $3,350; schedule: 3,086.10 + 5.2% × 5,070 = 3,349.74 → $3,350
    const input = { jurisdiction: "ne" as const, filingStatus: "mfj", federalAGI: 100000, neUseTaxTable: true };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(lines._tax_method).toBe("tax table");
    expect(dollars(lines, "15_income_tax")).toBe("$3,350");
    const sched = composeStateReturn({ ...input, neUseTaxTable: false, federalAGI: 42525 }, realPaEval(input));
    // 42,525 − 17,200 = 25,325 → schedule $804 (table row midpoint 25,310 → exact 197.784 + 3.51% × 17,270 = 803.961 → $804)
    expect(dollars(sched.lines, "15_income_tax")).toBe("$804");
  });

  it("caps line 6 at the federal standard deduction when the SPOUSE is claimable as a dependent, and refuses without the federal figure", () => {
    // MFJ, spouse claimable: line 4 = 1 (no 4b); line 6 = min($17,200, federal $1,350) = $1,350
    const input = { jurisdiction: "ne" as const, filingStatus: "mfj", federalAGI: 20000, neSpouseClaimedAsDependent: true, neFederalStandardDeduction: 1350 };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(lines["4_personal_exemptions"]).toBe("1");
    expect(dollars(lines, "6_standard_deduction")).toBe("$1,350");
    const bare = { jurisdiction: "ne" as const, filingStatus: "single", federalAGI: 9000, claimedAsDependent: true };
    expect(() => composeStateReturn(bare, realPaEval(bare))).toThrow(/neFederalStandardDeduction/);
  });
});

describe("composeID — 2025 Form 40 (real corpus targets)", () => {
  it("single wage earner: federal standard deduction, 5.3% over $4,811, $10 PBF, $155 food credit", () => {
    // 16 = 15,750; 17 = 19 = 44,250; 20 = (44,250 − 4,811) × 5.3% = 2,090.267 → $2,090; 31 = 10; 32 = 2,100; 43 = 155; 46 = 2,500 → 55 = 555
    const input = { jurisdiction: "id" as const, filingStatus: "single", federalAGI: 60000, stateWithholding: 2500 };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(lines["6d_household"]).toBe("1");
    expect(dollars(lines, "16_standard_deduction")).toBe("$15,750");
    expect(dollars(lines, "19_idaho_taxable_income")).toBe("$44,250");
    expect(dollars(lines, "20_tax")).toBe("$2,090");
    expect(dollars(lines, "31_permanent_building_fund_tax")).toBe("$10");
    expect(dollars(lines, "43_food_tax_credit")).toBe("$155");
    expect(dollars(lines, "55_overpaid")).toBe("$555");
  });

  it("MFJ with two children: $205 child tax credit, four-person food credit", () => {
    // 16 = 31,500; 19 = 58,500; 20 = 48,878 × 5.3% = 2,590.534 → $2,591; 24 = 410; 26 = 2,181; 32 = 2,191; 43 = 620; 50 = 3,620 → 55 = 1,429
    const input = { jurisdiction: "id" as const, filingStatus: "mfj", federalAGI: 90000, dependents: 2, idQualifyingChildren: 2, stateWithholding: 3000 };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(lines["6d_household"]).toBe("4");
    expect(dollars(lines, "20_tax")).toBe("$2,591");
    expect(dollars(lines, "24_child_tax_credit")).toBe("$410");
    expect(dollars(lines, "26_tax_after_credits")).toBe("$2,181");
    expect(dollars(lines, "43_food_tax_credit")).toBe("$620");
    expect(dollars(lines, "55_overpaid")).toBe("$1,429");
    expect(notes.some((n) => n.includes("sunsets this credit"))).toBe(true);
  });

  it("MFJ retirees: Social Security and CSRS pension subtracted, no taxable income, $10 PBF still due, food credit refunds", () => {
    // 16 = 31,500 + 2 × 1,600 = 34,700; 10 = SS 20,000 + retirement min(72,324 − 25,000, 40,000) = 40,000 → 60,000; 11 = 10,000; 17 = 19 = 0;
    // 20 = 0; 31 = 10; 43 = 310; 55 = 300
    const input = {
      jurisdiction: "id" as const, filingStatus: "mfj", federalAGI: 70000, taxableSocialSecurity: 20000, ageOrBlindBoxes: 2,
      idRetirementEligible: true, idSocialSecurityBenefits: 25000, idQualifyingRetirementBenefits: 40000,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "16_standard_deduction")).toBe("$34,700");
    expect(dollars(lines, "39R_B8_retirement_benefits_deduction")).toBe("$40,000");
    expect(dollars(lines, "10_subtractions")).toBe("$60,000");
    expect(dollars(lines, "19_idaho_taxable_income")).toBe("$0");
    expect(dollars(lines, "20_tax")).toBe("$0");
    expect(dollars(lines, "32_total_tax")).toBe("$10");
    expect(dollars(lines, "43_food_tax_credit")).toBe("$310");
    expect(dollars(lines, "55_overpaid")).toBe("$300");
  });

  it("itemizer with other-state income, an educational credit, QBI, and use tax", () => {
    // 13 = 40,000; 5d = 18,000 ≤ 40,000 → 14 = 12,000; 15 = 28,000 > 15,750 → itemized; 17 = 122,000; 18 = 2,000; 19 = 120,000;
    // 20 = 115,189 × 5.3% = 6,105.017 → $6,105; 21: 50,000 / 150,000 = .3333 → 6,105 × .3333 = 2,034.7965 → 2,035 (≤ 3,000); 22 = 500;
    // 25 = 2,535; 26 = 3,570; 28 = 30; 31 = 10; 32 = 3,610; 43 = 155; 46 = 5,000 → 50 = 5,155 → 55 = 1,545
    const input = {
      jurisdiction: "id" as const, filingStatus: "single", federalAGI: 150000, idFederalItemized: true, idFederalItemizedDeductions: 40000,
      idSaltIncomeOrSalesTaxes: 12000, idRealEstateTaxes: 6000, idSaltAllowed: 18000, idQbiDeduction: 2000,
      idOtherStateIncome: 50000, idOtherStateTaxDue: 3000, idEducationalContributions: 2000, idUseTaxPurchases: 500, stateWithholding: 5000,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(lines._deduction_method).toBe("itemized");
    expect(dollars(lines, "14_state_local_taxes")).toBe("$12,000");
    expect(dollars(lines, "19_idaho_taxable_income")).toBe("$120,000");
    expect(dollars(lines, "20_tax")).toBe("$6,105");
    expect(dollars(lines, "21_other_state_credit")).toBe("$2,035");
    expect(dollars(lines, "22_part_d_credits")).toBe("$500");
    expect(dollars(lines, "28_use_tax")).toBe("$30");
    expect(dollars(lines, "55_overpaid")).toBe("$1,545");
  });

  it("dependent filer below the filing threshold: earned-income deduction, no food credit, no PBF, refund of withholding", () => {
    // 16 = max(1,350, 6,000 + 450) = 6,450; 17 = 0; 20 = 0; 31 = 0 (NRF); 43 = 0 (dependent); refund 100
    const input = { jurisdiction: "id" as const, filingStatus: "single", federalAGI: 6000, claimedAsDependent: true, idEarnedIncome: 6000, idRequiredToFile: false, stateWithholding: 100 };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(lines["6d_household"]).toBe("0");
    expect(dollars(lines, "16_standard_deduction")).toBe("$6,450");
    expect(dollars(lines, "31_permanent_building_fund_tax")).toBe("$0");
    expect(lines["43_food_tax_credit"]).toBeUndefined();
    expect(dollars(lines, "56_refund")).toBe("$100");
    expect(notes.some((n) => n.includes("can't claim this credit if someone else"))).toBe(true);
    const bare = { jurisdiction: "id" as const, filingStatus: "single", federalAGI: 6000, claimedAsDependent: true };
    expect(() => composeStateReturn(bare, realPaEval(bare))).toThrow(/idEarnedIncome/);
  });

  it("food credit with two part-year dependents, penalty when payments equal the tax, MFS spouse itemizes, line 18 printed as entered", () => {
    // MFJ, 2 dependents each qualified 3 months: 2 × $155 + 6 × $12.92 = 387.52 → $388
    const a = { jurisdiction: "id" as const, filingStatus: "mfj", federalAGI: 90000, dependents: 2, idFoodCreditPartialPersons: 2, idFoodCreditPartialMonths: 6 };
    expect(dollars(composeStateReturn(a, realPaEval(a)).lines, "43_food_tax_credit")).toBe("$388");
    // single, tax 2,090 + 10 = 2,100 = withholding 1,945 + food 155; penalty 50 → 54 = $50, 55 = $0
    const b = { jurisdiction: "id" as const, filingStatus: "single", federalAGI: 60000, stateWithholding: 1945, idPenaltyAndInterest: 50 };
    const lb = composeStateReturn(b, realPaEval(b)).lines;
    expect(dollars(lb, "54_total_due")).toBe("$50");
    expect(dollars(lb, "55_overpaid")).toBe("$0");
    // MFS whose spouse itemizes: standard deduction $0, itemized 9,000 − 2,000 SALT = 7,000 used; 40,000 − 7,000 = 33,000 → (33,000 − 4,811) × 5.3% = 1,494.017 → $1,494
    const m = { jurisdiction: "id" as const, filingStatus: "mfs", federalAGI: 40000, idSpouseItemizes: true, idFederalItemized: true, idFederalItemizedDeductions: 9000, idSaltIncomeOrSalesTaxes: 2000, idSaltAllowed: 2000 };
    const lm = composeStateReturn(m, realPaEval(m)).lines;
    expect(dollars(lm, "16_standard_deduction")).toBe("$0");
    expect(lm._deduction_method).toBe("itemized");
    expect(dollars(lm, "20_tax")).toBe("$1,494");
    // line 18 larger than line 17 prints as entered; line 19 floors at zero
    const q = { jurisdiction: "id" as const, filingStatus: "single", federalAGI: 60000, idQbiDeduction: 100000 };
    const lq = composeStateReturn(q, realPaEval(q)).lines;
    expect(dollars(lq, "18_qbi_deduction")).toBe("$100,000");
    expect(dollars(lq, "19_idaho_taxable_income")).toBe("$0");
  });
});

describe("composeWV — 2025 Form IT-140 (real corpus targets)", () => {
  it("single wage earner: $2,000 exemption, Tax Table, small balance due", () => {
    // 4 = 50,000; 6 = 2,000; 7 = 48,000 → row [48,000, 48,050) midpoint 48,025: 1,165.50 + 4.44% × 8,025 = 1,521.81 → $1,522; withholding 1,500 → due $22
    const input = { jurisdiction: "wv" as const, filingStatus: "single", federalAGI: 50000, stateWithholding: 1500 };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(lines.e_total_exemptions).toBe("1");
    expect(dollars(lines, "7_wv_taxable_income")).toBe("$48,000");
    expect(dollars(lines, "8_income_tax")).toBe("$1,522");
    expect(lines._tax_method).toBe("tax table");
    expect(dollars(lines, "24_balance_due")).toBe("$22");
  });

  it("MFJ retirees both 65+: Social Security in full, $2,000 PERS cap, no senior modification left, family credit phased out", () => {
    // SS 20,000 (spouse 8,000) subtracted in full (AGI ≤ 100,000); line 33 PERS 5,000 → 2,000; col A lines 29-34 = 14,000, col B = 8,000 → both ≥ 8,000 → line 47 = 0;
    // 3 = 22,000; 4 = 38,000; 6 = 4,000; 7 = 34,000 → row [34,000, 34,060) midpoint 34,030: 666 + 3.33% × 9,030 = 966.70 → $967; FTC size 2 MFAGI 60,000 → 0%; refund 1,000 − 967 = 33
    const input = {
      jurisdiction: "wv" as const, filingStatus: "mfj", federalAGI: 60000, taxableSocialSecurity: 20000, wvSpouseTaxableSocialSecurity: 8000, wvPersTrsFederalRetirement: 5000,
      wvTaxpayerAge65OrDisabled: true, wvSpouseAge65OrDisabled: true, stateWithholding: 1000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "M34_social_security")).toBe("$20,000");
    expect(lines.M47_senior_citizen_modification).toBeUndefined();
    expect(dollars(lines, "3_subtractions")).toBe("$22,000");
    expect(dollars(lines, "7_wv_taxable_income")).toBe("$34,000");
    expect(dollars(lines, "8_income_tax")).toBe("$967");
    expect(dollars(lines, "28_refund")).toBe("$33");
    expect(notes.some((n) => n.includes("capped at $2,000 per person"))).toBe(true);
  });

  it("low-income HOH: Family Tax Credit wipes the tax, child care credit unused, withholding refunded", () => {
    // exemptions 2 → 4,000; 7 = 14,000 → row [14,000, 14,100) midpoint 14,050: 222 + 2.96% × 4,050 = 341.88 → $342; FTC size 2, MFAGI 18,000 ≤ 21,150 → 100% = 342;
    // child care 50% × 500 = 250; Recap 592 > 342 → line 10 = 0; refund = 400
    const input = { jurisdiction: "wv" as const, filingStatus: "hoh", federalAGI: 18000, dependents: 1, wvEarnedIncome: 18000, wvFederalChildCareCredit: 500, stateWithholding: 400 };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "8_income_tax")).toBe("$342");
    expect(dollars(lines, "recap2_family_tax_credit")).toBe("$342");
    expect(dollars(lines, "recap18_child_care_credit")).toBe("$250");
    expect(dollars(lines, "10_total_income_tax_due")).toBe("$0");
    expect(dollars(lines, "28_refund")).toBe("$400");
    expect(notes.some((n) => n.includes("exceed the tax"))).toBe(true);
  });

  it("other-state credit, use tax, and the motor vehicle property tax credit", () => {
    // 7 = 78,000 → row [78,000, 78,050) midpoint 78,025: 2,053.50 + 4.82% × 18,025 = 2,922.305 → $2,922; Schedule E: line 5 = 2,922 × 20,000 / 80,000 = 730.5 → 731;
    // alt tax on 58,000 = 1,165.50 + 4.44% × 18,000 = 1,964.70 → 1,965 → line 8 = 957; credit = min(900, 2,922, 731, 957, 2,922) = 731; 10 = 2,191; 13 = 30; 14 = 2,221;
    // payments 2,000 + MV 350 = 2,350 → overpayment 129
    const input = {
      jurisdiction: "wv" as const, filingStatus: "single", federalAGI: 80000, wvOtherStateTax: 900, wvOtherStateIncome: 20000, wvUseTaxPurchases: 500, wvMotorVehicleTaxPaid: 350, stateWithholding: 2000,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "8_income_tax")).toBe("$2,922");
    expect(dollars(lines, "recap1_other_state_credit")).toBe("$731");
    expect(dollars(lines, "10_total_income_tax_due")).toBe("$2,191");
    expect(dollars(lines, "13_use_tax")).toBe("$30");
    expect(dollars(lines, "21_property_tax_adjustment_credits")).toBe("$350");
    expect(dollars(lines, "25_overpayment")).toBe("$129");
    expect(dollars(lines, "28_refund")).toBe("$129");
  });

  it("MFS uses Rate Schedule II; a dependent filer gets the $500 allowance; low-income exclusion", () => {
    // MFS: 30,000 − 2,000 = 28,000 → Schedule II: 582.75 + 4.44% × 8,000 = 937.95 → $938
    const m = { jurisdiction: "wv" as const, filingStatus: "mfs", federalAGI: 30000 };
    const lm = composeStateReturn(m, realPaEval(m)).lines;
    expect(dollars(lm, "8_income_tax")).toBe("$938");
    expect(lm._tax_method).toBe("rate schedule II");
    // dependent filer: exemptions 0 → $500; AGI 9,000 wages → low-income exclusion 9,000; taxable 0
    const d = { jurisdiction: "wv" as const, filingStatus: "single", federalAGI: 9000, claimedAsDependent: true, wvEarnedIncome: 9000, stateWithholding: 120 };
    const ld = composeStateReturn(d, realPaEval(d)).lines;
    expect(ld.e_total_exemptions).toBe("0");
    expect(dollars(ld, "6_exemptions")).toBe("$500");
    expect(dollars(ld, "5_low_income_exclusion")).toBe("$9,000");
    expect(dollars(ld, "7_wv_taxable_income")).toBe("$0");
    expect(dollars(ld, "28_refund")).toBe("$120");
  });

  it("surviving spouse: lines 47 and 48 together capped at $8,000; box (c) capped at income on a single return", () => {
    // single, 65+, surviving spouse; U.S. interest 1,000; AGI 30,000 → line 47 = 8,000 − 1,000 = 7,000; line 48 = 8,000 − (1,000 + 7,000) = 0
    const a = { jurisdiction: "wv" as const, filingStatus: "single", federalAGI: 30000, wvUsInterest: 1000, wvTaxpayerAge65OrDisabled: true, wvSurvivingSpouseModification: true };
    const la = composeStateReturn(a, realPaEval(a)).lines;
    expect(dollars(la, "M47_senior_citizen_modification")).toBe("$7,000");
    expect(la.M48_surviving_spouse_modification).toBeUndefined();
    expect(dollars(la, "3_subtractions")).toBe("$8,000");
    // single, 65+, AGI 5,000 → box (c) defaults to the $5,000 of income, not $8,000; line 4 = 0
    const b = { jurisdiction: "wv" as const, filingStatus: "single", federalAGI: 5000, wvTaxpayerAge65OrDisabled: true };
    const lb = composeStateReturn(b, realPaEval(b)).lines;
    expect(dollars(lb, "M47_senior_citizen_modification")).toBe("$5,000");
    expect(dollars(lb, "4_wv_adjusted_gross_income")).toBe("$0");
  });
});

describe("composeME — 2025 Form 1040ME (real corpus targets)", () => {
  it("single wage earner: $15,000 deduction, $5,150 exemption, tax table, small balance due", () => {
    // 16 = 60,000; 17 = 15,000; 18 = 5,150; 19 = 39,850 → row [39,800, 39,900) midpoint 39,850: 1,554 + 6.75% × 13,050 = 2,434.875 → $2,435 (printed);
    // STFC: single income 60,000 → 0; withholding 2,000 → underpaid 435
    const input = { jurisdiction: "me" as const, filingStatus: "single", federalAGI: 60000, stateWithholding: 2000 };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(lines["13_exemptions"]).toBe("1");
    expect(dollars(lines, "17_deduction")).toBe("$15,000");
    expect(dollars(lines, "18_exemption")).toBe("$5,150");
    expect(dollars(lines, "19_taxable_income")).toBe("$39,850");
    expect(dollars(lines, "20_income_tax")).toBe("$2,435");
    expect(lines._tax_method).toBe("tax table");
    expect(lines["25e_sales_tax_fairness_credit"]).toBeUndefined();
    expect(dollars(lines, "35_total_due")).toBe("$435");
  });

  it("MFJ retirees: Social Security and pension deduction, age boxes, no taxable income, Property Tax Fairness Credit", () => {
    // 15b = SS 20,000 + pension min(40,000, 48,216 − 25,000 = 23,216) = 43,216; 16 = 36,784; 17 = 30,000 + 2 × 1,600 = 33,200; 18 = 10,300; 19 = 0;
    // PTFC 65+: total income 85,000; base min(4,000, 4,100) = 4,000; 4% × 85,000 = 3,400 → 600 → min(600, 2,000) = 600; STFC: income 85,000 > 63,950 → 0
    // payments 500 + 600 = 1,100 → refund 1,100
    const input = {
      jurisdiction: "me" as const, filingStatus: "mfj", federalAGI: 80000, taxableSocialSecurity: 20000, meSocialSecurityReceived: 25000, meNonMilitaryPension: 40000,
      ageOrBlindBoxes: 2, meAge65: true, meTotalIncome: 85000, mePropertyTaxPaid: 4000, stateWithholding: 500,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "1S4_pension_deduction")).toBe("$23,216");
    expect(dollars(lines, "16_maine_agi")).toBe("$36,784");
    expect(dollars(lines, "17_deduction")).toBe("$33,200");
    expect(dollars(lines, "19_taxable_income")).toBe("$0");
    expect(dollars(lines, "25d_property_tax_fairness_credit")).toBe("$600");
    expect(dollars(lines, "34b_refund")).toBe("$1,100");
  });

  it("low-income HOH with two children (one under 6): dependent credit, child care, EITC, Sales Tax Fairness Credit", () => {
    // 17 = 22,500; 18 = 5,150; 19 = 2,350 → midpoint 2,350 × 5.8% = 136.3 → $136 (printed '2,300 2,400 136');
    // child care 25% × 500 = 125 → all refundable (≤ 500), nonrefundable 0 → 24 = 136; dependent credit 305 + 610 = 915; EITC 25% × 2,000 = 500;
    // 25c = 915 + 125 + 500 = 1,540; STFC HOH 2 deps income 30,000 → 250; 25f = 300 + 1,540 + 250 = 2,090; 28 = 1,954
    const input = {
      jurisdiction: "me" as const, filingStatus: "hoh", federalAGI: 30000, dependents: 2, meDependentsUnderSix: 1, federalEITC: 2000, meHasQualifyingChild: true, meFederalChildCareCredit: 500, meChildCareExpenses: 3000,
      meTotalIncome: 30000, stateWithholding: 300,
    };
    const { lines } = composeStateReturn(input, realPaEval(input));
    expect(dollars(lines, "20_income_tax")).toBe("$136");
    expect(dollars(lines, "A1_dependent_exemption_credit")).toBe("$915");
    expect(dollars(lines, "A2_child_care_refundable")).toBe("$125");
    expect(lines.A11_child_care_nonrefundable).toBeUndefined();
    expect(dollars(lines, "A4_earned_income_credit")).toBe("$500");
    expect(dollars(lines, "25e_sales_tax_fairness_credit")).toBe("$250");
    expect(dollars(lines, "34b_refund")).toBe("$1,954");
  });

  it("high-income itemizer: Schedule 2 cap, deduction phase-out, rate schedule, other-jurisdiction credit, use tax", () => {
    // Schedule 2: 40,000 − 10,000 + 9,000 = 39,000 → capped 36,300 > 15,000 → itemized; phase-out (150,000 − 100,000) / 75,000 = .6667 → 36,300 × .6667 = 24,201.21 → 24,201 → 17 = 12,099;
    // 18 = 5,150; 19 = 132,751 → rate schedule (≥ 100,000; single hand-off 6,638 + 7.15% × 32,751 = 8,979.70 → $8,980); other jurisdiction: 30,000 / 150,000 = .2000 × 8,980 = 1,796; paid 2,500 → 1,796;
    // 24 = 7,184; withholding 8,000 → 28 = 816; use tax 200 → 11; 33 = 805
    const input = {
      jurisdiction: "me" as const, filingStatus: "single", federalAGI: 150000, meFederalItemized: true, meFederalItemizedDeductions: 40000, meSaltTaxes5e: 10000, meRealEstateTaxes5b: 9000,
      meOtherJurisdictionIncome: 30000, meOtherJurisdictionTax: 2500, meUseTaxPurchases: 200, stateWithholding: 8000,
    };
    const { lines, notes } = composeStateReturn(input, realPaEval(input));
    expect(lines._deduction_method).toBe("itemized");
    expect(lines._tax_method).toBe("tax table hand-off");
    expect(dollars(lines, "sched2_itemized")).toBe("$36,300");
    expect(dollars(lines, "17_deduction")).toBe("$12,099");
    expect(dollars(lines, "19_taxable_income")).toBe("$132,751");
    expect(dollars(lines, "20_income_tax")).toBe("$8,980");
    expect(dollars(lines, "A14_other_jurisdiction_credit")).toBe("$1,796");
    expect(dollars(lines, "24_net_tax")).toBe("$7,184");
    expect(dollars(lines, "30_use_tax")).toBe("$11");
    expect(dollars(lines, "33_net_overpayment")).toBe("$805");
    expect(notes.some((n) => n.includes("reduced to $12,099 by the phase-out"))).toBe(true);
  });

  it("MFS with a no-income spouse gets two exemptions; a dependent filer gets zero and no Sales Tax Fairness Credit", () => {
    // MFS: 17 = 15,000; 18 = 10,300; 19 = 14,700 → single column midpoint 14,750 × 5.8% = 855.5 → $856 (printed '14,700 14,800 856'); no STFC (MFS)
    const m = { jurisdiction: "me" as const, filingStatus: "mfs", federalAGI: 40000, meSpouseNoIncomeMfs: true };
    const lm = composeStateReturn(m, realPaEval(m)).lines;
    expect(lm["13_exemptions"]).toBe("2");
    expect(dollars(lm, "18_exemption")).toBe("$10,300");
    expect(dollars(lm, "20_income_tax")).toBe("$856");
    expect(lm["25e_sales_tax_fairness_credit"]).toBeUndefined();
    // dependent filer: full $15,000 chart deduction (amended § 5124-C(1-B)); exemption 0; taxable 0; no STFC
    const d = { jurisdiction: "me" as const, filingStatus: "single", federalAGI: 6000, claimedAsDependent: true, stateWithholding: 90 };
    const ld = composeStateReturn(d, realPaEval(d)).lines;
    expect(ld["13_exemptions"]).toBe("0");
    expect(dollars(ld, "17_deduction")).toBe("$15,000");
    expect(dollars(ld, "19_taxable_income")).toBe("$0");
    expect(ld["25e_sales_tax_fairness_credit"]).toBeUndefined();
    expect(dollars(ld, "34b_refund")).toBe("$90");
    // EITC without meHasQualifyingChild stays at the 50% childless rate even with a dependent (e.g. a parent), with a note
    const e = { jurisdiction: "me" as const, filingStatus: "hoh", federalAGI: 20000, dependents: 1, federalEITC: 600, meTotalIncome: 20000 };
    const re = composeStateReturn(e, realPaEval(e));
    expect(dollars(re.lines, "A4_earned_income_credit")).toBe("$300");
    expect(re.notes.some((n) => n.includes("pass meHasQualifyingChild"))).toBe(true);
  });
});
