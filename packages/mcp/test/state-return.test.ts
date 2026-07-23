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
