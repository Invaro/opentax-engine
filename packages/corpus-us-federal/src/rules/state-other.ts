/**
 * State coverage pack 2 — beyond the four fully-composed states (IL/VA/CA/NY),
 * this module gives every remaining high-population/simple-structure state a
 * CITED, web-verified TY2025 computable target or an explicit no-income-tax
 * rule, so lookup_tax_parameter and calculate_tax answer for them instead of
 * an agent recalling stale rates.
 *
 * Scope discipline (same as the original state pack): each target computes
 * TAX ON ALREADY-COMPOSED STATE TAXABLE INCOME (stateTaxableIncome), with the
 * state's standard deduction / exemption amounts published as parameters for
 * the agent to compose the base — full printed-form composition (the
 * compute_state_return composers) remains IL/VA/CA/NY only for now. Credits,
 * local surtaxes, and special bases are NAMED in the citation and left to
 * the agent with disclosure — never silently omitted.
 *
 * All rates/amounts web-verified July 2026 against the Tax Foundation 2025
 * rate survey cross-checked with state statutes named per rule. GA reflects
 * 2025 HB 111 (rate cut to 5.19%, retroactive to 1/1/2025) which postdates
 * some published surveys still showing 5.39%.
 */
import type { Rule } from "@invaro/opentax-core";
import { fact } from "./state-helpers.js";

const flatBase = { kind: "max0", arg: fact("stateTaxableIncome") } as const;

function flatTax(args: {
  st: string;
  name: string;
  version?: number;
  ratePctTimes100: string; // e.g. "307" = 3.07%
  source: string;
  section: string;
  url: string;
  excerpt: string;
  parameters?: Record<string, { value: string; type: "money" | "int" }>;
}): Rule {
  return {
    id: `us.${args.st}.income_tax`,
    version: args.version ?? 1,
    jurisdiction: `us.${args.st}`,
    title: `${args.name} income tax — TY2025 flat rate on state taxable income`,
    citation: { source: args.source, section: args.section, url: args.url, excerpt: args.excerpt },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: args.parameters ?? {},
    formula: {
      kind: "roundToDollar",
      value: {
        kind: "brackets",
        base: flatBase,
        table: [{ threshold: "0", rate: { num: args.ratePctTimes100, den: "10000" } }],
      },
      mode: "half-up",
    },
  };
}

function noIncomeTax(st: string, name: string, excerpt: string, url: string): Rule {
  return {
    id: `us.${st}.income_tax`,
    version: 1,
    jurisdiction: `us.${st}`,
    title: `${name} — no individual income tax (TY2025)`,
    citation: {
      source: `${name} law (no individual income tax)`,
      section: "n/a",
      url,
      excerpt,
    },
    effectiveFrom: "2025-01-01", // structural: open-ended
    output: { type: "money" },
    formula: { kind: "money", cents: "0" },
  };
}

export const otherStateRules: Rule[] = [
  // ---- no-individual-income-tax states (TY2025) --------------------------
  noIncomeTax("ak", "Alaska", "Alaska levies no individual income tax (repealed 1980). No state return exists for wage earners.", "https://tax.alaska.gov/"),
  noIncomeTax("fl", "Florida", "Florida's constitution (Art. VII § 5) prohibits an individual income tax. No state individual return.", "https://floridarevenue.com/"),
  noIncomeTax("nv", "Nevada", "Nevada levies no individual income tax. No state individual return.", "https://tax.nv.gov/"),
  noIncomeTax("sd", "South Dakota", "South Dakota levies no individual income tax. No state individual return.", "https://dor.sd.gov/"),
  noIncomeTax("tn", "Tennessee", "Tennessee levies no individual income tax (the Hall tax on interest/dividends was fully repealed effective 1/1/2021).", "https://www.tn.gov/revenue.html"),
  noIncomeTax("tx", "Texas", "Texas levies no individual income tax (Tex. Const. art. VIII § 24-a requires voter approval to create one). No state individual return.", "https://comptroller.texas.gov/"),
  noIncomeTax("wy", "Wyoming", "Wyoming levies no individual income tax. No state individual return.", "https://revenue.wyo.gov/"),
  {
    id: "us.nh.income_tax",
    version: 1,
    jurisdiction: "us.nh",
    title: "New Hampshire — no individual income tax (TY2025; interest & dividends tax REPEALED)",
    citation: {
      source: "N.H. RSA 77 (repealed); 2021 N.H. Laws ch. 91",
      section: "RSA 77:1 (repeal effective for tax periods beginning after 12/31/2024)",
      url: "https://www.revenue.nh.gov/",
      excerpt:
        "New Hampshire's 3% interest-and-dividends tax was phased out and fully REPEALED for taxable periods beginning on or after January 1, 2025 — TY2025 has NO individual income tax of any kind. For TY2024 and earlier the I&D tax existed; an asOf before 2025 must not use this rule.",
    },
    effectiveFrom: "2025-01-01", // the I&D tax existed before this date
    output: { type: "money" },
    formula: { kind: "money", cents: "0" },
  },
  {
    id: "us.wa.income_tax",
    version: 1,
    jurisdiction: "us.wa",
    title: "Washington — no individual income tax on wages; 7% capital gains excise NOT MODELED (refuses)",
    citation: {
      source: "RCW 82.87 (capital gains excise); no general income tax",
      section: "RCW 82.87.040",
      url: "https://dor.wa.gov/taxes-rates/other-taxes/capital-gains-tax",
      excerpt:
        "Washington levies NO tax on wages or ordinary income. It DOES levy a 7% excise on an individual's Washington-allocated net long-term capital gains above an inflation-indexed standard deduction (~$270,000 for 2024; 2025 amount indexed), plus an additional 2.9% on gains over $1 million (2025 legislation) — with real-estate and retirement-account exemptions. THIS RULE COVERS THE WAGE ANSWER ONLY ($0); a filer with large WA-allocated long-term gains needs the RCW 82.87 excise computed separately — compute and disclose, this corpus does not model it.",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: {
      kind: "if",
      cond: { kind: "cmp", op: "gt", left: fact("longTermCapitalGains"), right: { kind: "money", cents: "0" } },
      then: {
        kind: "unsupported",
        reason:
          "Washington taxes no wages, but long-term capital gains are present — the RCW 82.87 7% capital-gains excise (indexed ~$270k deduction, real-estate/retirement exemptions) is not modeled; compute it separately and disclose",
      },
      else: { kind: "money", cents: "0" },
    },
  },

  // ---- flat-rate states (TY2025, web-verified) ---------------------------
  flatTax({
    st: "pa", name: "Pennsylvania", ratePctTimes100: "307",
    source: "72 Pa. Stat. § 7302; Tax Foundation 2025 state rate survey (web-verified July 2026)",
    section: "72 P.S. § 7302",
    url: "https://www.pa.gov/agencies/revenue.html",
    excerpt:
      "Pennsylvania: 3.07% flat on PA taxable income. NO standard deduction and NO personal exemption. CAUTION: PA taxes EIGHT SEPARATE INCOME CLASSES (compensation, interest, dividends, net profits, gains, rents, estates, gambling) with NO netting of a loss in one class against income in another, and retirement income (401(k)/IRA distributions after retirement age, Social Security) is fully EXEMPT. PA Tax Forgiveness (Schedule SP) can eliminate tax at low incomes — not modeled, disclose. Compose stateTaxableIncome per the class rules before calling.",
  }),
  flatTax({
    st: "in", name: "Indiana", ratePctTimes100: "300",
    source: "Ind. Code § 6-3-2-1 (2025 rate 3.00%); Tax Foundation 2025 survey (web-verified July 2026)",
    section: "IC 6-3-2-1(b)",
    url: "https://www.in.gov/dor/",
    excerpt:
      "Indiana TY2025: 3.00% flat on state AGI (2026 drops to 2.95%). No standard deduction; exemptions $1,000 per taxpayer/spouse (plus $1,500 per dependent child, $1,000 other dependents — compose into the base). COUNTY income taxes (0.5%-3%+, county-specific) apply ON TOP and are NOT modeled — name the county and compute separately with disclosure.",
    parameters: {
      exemptionPerFiler: { value: "100000", type: "money" },
      exemptionPerDependentChild: { value: "150000", type: "money" },
    },
  }),
  flatTax({
    st: "mi", name: "Michigan", ratePctTimes100: "425",
    source: "Mich. Comp. Laws § 206.51 (4.25% for 2025); Tax Foundation 2025 survey (web-verified July 2026)",
    section: "MCL 206.51",
    url: "https://www.michigan.gov/taxes",
    excerpt:
      "Michigan TY2025: 4.25% flat on Michigan taxable income. Personal exemption $5,800 per filer/dependent (2025, indexed); no standard deduction. City income taxes (Detroit 2.4% resident etc.) NOT modeled — disclose. Retirement/pension subtraction phase-in (2023 PA 4) not modeled — disclose for pension filers.",
    parameters: { personalExemption: { value: "580000", type: "money" } },
  }),
  flatTax({
    st: "co", name: "Colorado", ratePctTimes100: "440",
    source: "Colo. Rev. Stat. § 39-22-104 (4.40%); Tax Foundation 2025 survey (web-verified July 2026)",
    section: "C.R.S. § 39-22-104(1.7)",
    url: "https://tax.colorado.gov/",
    excerpt:
      "Colorado TY2025: 4.40% flat on FEDERAL TAXABLE INCOME (Form 1040 line 15) plus/minus Colorado modifications — Colorado is the rare state starting from federal TAXABLE income, so the federal standard/itemized deduction is already embedded; do NOT subtract a separate state deduction. A TABOR-triggered temporary rate reduction may apply in refund years (2024 was 4.25%) — 2025 statutory rate 4.40%; verify any TABOR adjustment for the filing year and disclose. State addback for large itemizers and the pension/annuity subtraction are named but not modeled.",
  }),
  flatTax({
    st: "ut", name: "Utah", ratePctTimes100: "450",
    source: "Utah Code § 59-10-104 as amended by 2025 HB 106 (4.50% RETROACTIVE to 1/1/2025 — pre-HB 106 surveys still print 4.55%); web-verified July 2026",
    section: "Utah Code § 59-10-104; 2025 Utah Laws ch. (HB 106)",
    url: "https://tax.utah.gov/",
    excerpt:
      "Utah TY2025: 4.50% flat on Utah taxable income (HB 106, signed March 2025, cut the 4.55% rate retroactively to 1/1/2025; withholding tables only caught up June 2025 — the ANNUAL return rate is 4.50%). Federal AGI + modifications; Utah has NO standard deduction — instead a nonrefundable TAXPAYER TAX CREDIT of roughly 6% of federal deductions that PHASES OUT with income, which this rule does not model; compute the credit per Utah TC-40 and disclose.",
  }),
  flatTax({
    st: "nc", name: "North Carolina", ratePctTimes100: "425",
    source: "N.C. Gen. Stat. § 105-153.7 (4.25% for 2025); Tax Foundation 2025 survey (web-verified July 2026)",
    section: "N.C.G.S. § 105-153.7",
    url: "https://www.ncdor.gov/",
    excerpt:
      "North Carolina TY2025: 4.25% flat on NC taxable income (2026 drops to 3.99%). NC standard deduction $12,750 single/MFS, $25,500 MFJ, $19,125 HOH; NO personal exemptions; a $3,000-per-child deduction (income-tiered) exists for CTC-eligible children — compose into the base and disclose.",
    parameters: {
      standardDeductionSingle: { value: "1275000", type: "money" },
      standardDeductionJoint: { value: "2550000", type: "money" },
      standardDeductionHoh: { value: "1912500", type: "money" },
    },
  }),
  flatTax({
    st: "az", name: "Arizona", ratePctTimes100: "250",
    source: "Ariz. Rev. Stat. § 43-1011 (2.5% flat); Tax Foundation 2025 survey (web-verified July 2026)",
    section: "A.R.S. § 43-1011",
    url: "https://azdor.gov/",
    excerpt:
      "Arizona TY2025: 2.5% flat on Arizona taxable income. Standard deduction mirrors the FEDERAL OBBBA amounts — $15,750 single/MFS, $31,500 MFJ, $23,625 HOH per the 2025 Form 140 as directed by Executive Order 2025-15 (the legislature's conformity bills were vetoed; H.B. 4168 later moved the conformity date to 1/1/2026 — the DOR-printed 2025 form amounts are the filing reality). Dependent tax credit $100 per dependent under 17 / $25 for 17+ (income-phased) named but not modeled.",
    parameters: {
      standardDeductionSingle: { value: "1575000", type: "money" },
      standardDeductionJoint: { value: "3150000", type: "money" },
      standardDeductionHoh: { value: "2362500", type: "money" },
    },
  }),
  flatTax({
    st: "ky", name: "Kentucky", ratePctTimes100: "400",
    source: "Ky. Rev. Stat. § 141.020 (4.0% for 2025; 3.5% for 2026 per 2025 HB 1); Tax Foundation 2025 survey (web-verified July 2026)",
    section: "KRS 141.020",
    url: "https://revenue.ky.gov/",
    excerpt:
      "Kentucky TY2025: 4.0% flat on KY taxable income (2026 drops to 3.5%). Standard deduction $3,270 PER TAXPAYER (each spouse gets one on a joint return: $6,540 MFJ); no personal exemptions. Pension exclusion up to $31,110 per person named but not modeled — disclose for retirees.",
    parameters: { standardDeductionPerTaxpayer: { value: "327000", type: "money" } },
  }),
  flatTax({
    st: "ga", name: "Georgia", ratePctTimes100: "519",
    source: "Ga. Code § 48-7-20 as amended by 2025 HB 111 (5.19% RETROACTIVE to 1/1/2025 — some 2025 surveys still print the pre-HB 111 5.39%); Tax Foundation survey cross-checked (web-verified July 2026)",
    section: "O.C.G.A. § 48-7-20; 2025 Ga. Laws Act (HB 111)",
    url: "https://dor.georgia.gov/",
    excerpt:
      "Georgia TY2025: 5.19% flat (HB 111, signed April 2025, cut the scheduled 5.39% retroactively to 1/1/2025; the rate continues stepping toward 4.99%). Standard deduction $12,000 single/MFS/HOH, $24,000 MFJ; dependent exemption $4,000 per dependent (unborn-child rule included); no personal exemption for filers.",
    parameters: {
      standardDeductionSingle: { value: "1200000", type: "money" },
      standardDeductionJoint: { value: "2400000", type: "money" },
      dependentExemption: { value: "400000", type: "money" },
    },
  }),
  flatTax({
    st: "ia", name: "Iowa", ratePctTimes100: "380",
    source: "Iowa Code § 422.5A (3.8% flat effective 1/1/2025, 2024 SF 2442); Tax Foundation 2025 survey (web-verified July 2026)",
    section: "Iowa Code § 422.5A",
    url: "https://revenue.iowa.gov/",
    excerpt:
      "Iowa TY2025: 3.8% flat (consolidated from three brackets effective 1/1/2025). Iowa taxable income couples to FEDERAL TAXABLE INCOME with Iowa modifications (federal standard/itemized deduction embedded); retirement income is fully EXEMPT for 55+ filers (2023 HF 2317) — compose and disclose. A $40/$80 personal exemption CREDIT applies against tax (not modeled).",
  }),
  {
    id: "us.ms.income_tax",
    version: 1,
    jurisdiction: "us.ms",
    title: "Mississippi income tax — TY2025: 4.4% on taxable income over $10,000",
    citation: {
      source: "Miss. Code § 27-7-5 (4.4% for 2025 under the 2022 phase-down as amended by 2025 HB 1); Tax Foundation 2025 survey (web-verified July 2026)",
      section: "Miss. Code § 27-7-5",
      url: "https://www.dor.ms.gov/",
      excerpt:
        "Mississippi TY2025: 0% on the first $10,000 of taxable income, 4.4% on the excess (rate steps down annually toward eventual elimination under 2025 HB 1). Standard deduction $2,300 single / $4,600 MFJ; personal exemption $6,000 single / $12,000 MFJ + $1,500 per dependent — compose into the base.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      standardDeductionSingle: { value: "230000", type: "money" },
      standardDeductionJoint: { value: "460000", type: "money" },
      personalExemptionSingle: { value: "600000", type: "money" },
      personalExemptionJoint: { value: "1200000", type: "money" },
    },
    formula: {
      kind: "roundToDollar",
      value: {
        kind: "brackets",
        base: flatBase,
        table: [
          { threshold: "0", rate: { num: "0", den: "100" } },
          { threshold: "1000000", rate: { num: "440", den: "10000" } },
        ],
      },
      mode: "half-up",
    },
  },
  flatTax({
    st: "la", name: "Louisiana", ratePctTimes100: "300",
    source: "La. Rev. Stat. § 47:32 as amended by 2024 3d Ex. Sess. Act 11 (3.0% flat effective 1/1/2025); Tax Foundation 2025 survey (web-verified July 2026)",
    section: "La. R.S. 47:32",
    url: "https://revenue.louisiana.gov/",
    excerpt:
      "Louisiana TY2025: 3.0% flat (replaced the graduated 1.85/3.5/4.25% schedule effective 1/1/2025). Standard deduction $12,500 single/MFS, $25,000 MFJ/HOH/QSS (replaced the combined personal exemption); retirement-income exemptions named but not modeled.",
    parameters: {
      standardDeductionSingle: { value: "1250000", type: "money" },
      standardDeductionJoint: { value: "2500000", type: "money" },
    },
  }),
  {
    id: "us.ma.income_tax",
    version: 1,
    jurisdiction: "us.ma",
    title: "Massachusetts income tax — TY2025: 5% Part B rate + 4% millionaire surtax",
    citation: {
      source: "Mass. Gen. Laws ch. 62 § 4; Mass. Const. amend. art. CXXI (4% surtax); 2025 surtax threshold $1,083,150 (indexed); Tax Foundation 2025 survey (web-verified July 2026)",
      section: "M.G.L. c. 62 § 4; Const. amend. CXXI",
      url: "https://www.mass.gov/orgs/massachusetts-department-of-revenue",
      excerpt:
        "Massachusetts TY2025: 5.0% on Part B taxable income (wages/business), PLUS a 4% surtax on total taxable income over $1,083,150 (2025 indexed threshold) — top effective 9%. Short-term capital gains are taxed at 8.5% and Part A interest/dividends at 5% (compose separately when present — this rule applies the 5%/9% schedule to the single stateTaxableIncome input and REFUSES nothing silently: disclose ST-gain composition). Personal exemption $4,400 single / $8,800 MFJ; no standard deduction. The 2025 threshold amount should be re-verified from the DOR circular for precise millionaire-surtax returns.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      personalExemptionSingle: { value: "440000", type: "money" },
      personalExemptionJoint: { value: "880000", type: "money" },
      surtaxThreshold: { value: "108315000", type: "money" },
    },
    formula: {
      kind: "roundToDollar",
      value: {
        kind: "brackets",
        base: flatBase,
        table: [
          { threshold: "0", rate: { num: "500", den: "10000" } },
          { threshold: "108315000", rate: { num: "900", den: "10000" } },
        ],
      },
      mode: "half-up",
    },
  },
];
