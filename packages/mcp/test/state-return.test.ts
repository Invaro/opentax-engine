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
