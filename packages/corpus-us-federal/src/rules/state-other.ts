/**
 * State coverage pack 2 — beyond the seven fully-composed states (IL/VA/CA/NY/PA/NJ/OH),
 * this module gives every remaining high-population/simple-structure state a
 * CITED, web-verified TY2025 computable target or an explicit no-income-tax
 * rule, so lookup_tax_parameter and calculate_tax answer for them instead of
 * an agent recalling stale rates.
 *
 * Scope discipline (same as the original state pack): each target computes
 * TAX ON ALREADY-COMPOSED STATE TAXABLE INCOME (stateTaxableIncome), with the
 * state's standard deduction / exemption amounts published as parameters for
 * the agent to compose the base — full printed-form composition (the
 * compute_state_return composers) remains IL/VA/CA/NY/PA/NJ/OH for now. Credits,
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
  effectiveFrom?: string;
  effectiveTo?: string;
}): Rule {
  return {
    id: `us.${args.st}.income_tax`,
    version: args.version ?? 1,
    jurisdiction: `us.${args.st}`,
    title: `${args.name} income tax — TY2025 flat rate on state taxable income`,
    citation: { source: args.source, section: args.section, url: args.url, excerpt: args.excerpt },
    effectiveFrom: args.effectiveFrom ?? "2025-01-01",
    effectiveTo: args.effectiveTo ?? "2026-01-01",
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
  // (PA graduated to the deep pack: see state-pa.ts — us.pa.income_tax v2+
  //  computes the class-netted base itself; the thin v1 is superseded.)
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
  // (NC graduated to the deep pack: see state-nc.ts — us.nc.income_tax v2+
  //  with standard/itemized/child-deduction targets; the thin v1 is superseded.)
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
  // (GA graduated to the deep pack: see state-ga.ts — us.ga.income_tax v2+
  //  with standard/dependent/retirement-exclusion/LIC/CDCC targets; the thin
  //  v1 is superseded.)
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

  // ==== TY2026 ENACTED RATES (currency pass, web-verified August 19, 2026) ====
  // Each rule below encodes a 2026 rate that is ENACTED and determinate today.
  // Indexed companion parameters (standard deductions etc.) that the states
  // have not yet published are carried from 2025 with re-verify disclosures.
  flatTax({
    st: "ky", name: "Kentucky", version: 2, ratePctTimes100: "350",
    effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01",
    source: "KRS 141.020 as amended by 2025 Ky. Acts ch. (HB 1) — 3.5% effective January 1, 2026; DOR announcement and EY/Bloomberg Tax confirmations (web-verified August 2026)",
    section: "KRS 141.020; 2025 HB 1",
    url: "https://revenue.ky.gov/",
    excerpt:
      "Kentucky TY2026: 3.5% flat (2025 HB 1 cut the 4.0% rate effective January 1, 2026 — the condition-based phase-down continues toward eventual elimination; a further cut below 3.5% requires new legislation and triggers, none enacted as of August 2026). STANDARD DEDUCTION (indexed, DOR-announced September 4, 2025): $3,360 per taxpayer for 2026 (up from $3,270; each spouse gets one on a joint return). Pension exclusion (up to $31,110/person) unchanged, still not modeled — disclose for retirees.",
    parameters: { standardDeductionPerTaxpayer: { value: "336000", type: "money" } }, // $3,360 (2026, DOR-announced 9/4/2025)
  }),
  flatTax({
    st: "in", name: "Indiana", version: 2, ratePctTimes100: "295",
    effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01",
    source: "Ind. Code § 6-3-2-1(b) phase-down (2.95% for 2026, 2.9% for 2027); Indiana DOR 'Rates, Fees & Penalties' page (web-verified August 2026)",
    section: "IC 6-3-2-1(b)",
    url: "https://www.in.gov/dor/resources/tax-rates-and-reports/rates-fees-and-penalties/",
    excerpt:
      "Indiana TY2026: 2.95% flat on state AGI (the enacted IC 6-3-2-1 schedule: 3.00% for 2025, 2.95% for 2026, 2.90% for 2027 — confirmed on the DOR rates page). Exemptions ($1,000 per taxpayer/spouse, $1,500 per dependent child) are statutory and unchanged. COUNTY income taxes (0.5%–2.9%+, county-specific, set annually — the 2026 county rate table publishes each January/October) apply ON TOP and are NOT modeled; name the county and compute separately with disclosure.",
    parameters: {
      exemptionPerFiler: { value: "100000", type: "money" },
      exemptionPerDependentChild: { value: "150000", type: "money" },
    },
  }),
  {
    id: "us.ms.income_tax",
    version: 2,
    jurisdiction: "us.ms",
    title: "Mississippi income tax — TY2026: 4.0% on taxable income over $10,000 (enacted schedule)",
    citation: {
      source:
        "Miss. Code § 27-7-5 (the 2022 phase-down's final scheduled step: 4.0% for 2026) as further amended by 2025 HB 1 ('Build Up Mississippi Act' — post-2026 trigger-based cuts toward elimination); web-verified August 2026",
      section: "Miss. Code § 27-7-5; 2025 HB 1",
      url: "https://www.dor.ms.gov/",
      excerpt:
        "Mississippi TY2026: 0% on the first $10,000 of taxable income, 4.0% on the excess — the 2022 phase-down's final scheduled step (5%/4.7%/4.4%/4.0% for 2023-2026). 2025 HB 1 ('Build Up Mississippi Act') enacts a FIXED schedule after 2026 — 3.75% (2027), 3.5% (2028), 3.25% (2029), 3.0% (2030) — with revenue-TRIGGER cuts beginning only in 2031 toward elimination; the 2027-2030 rates are determinate and encodable year by year from the statute. Standard deduction ($2,300 single/$4,600 MFJ) and personal exemptions ($6,000/$12,000 + $1,500 per dependent) are statutory and unchanged — compose into the base.",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
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
          { threshold: "1000000", rate: { num: "400", den: "10000" } },
        ],
      },
      mode: "half-up",
    },
  },
  flatTax({
    st: "ut", name: "Utah", version: 2, ratePctTimes100: "445",
    effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01",
    source: "Utah Code § 59-10-104 as amended by 2026 Utah Laws (S.B. 60) — 4.45% RETROACTIVE to January 1, 2026 (the sixth consecutive annual cut); EY payroll alert and Utah House confirmations (web-verified August 2026)",
    section: "Utah Code § 59-10-104; 2026 S.B. 60",
    url: "https://tax.utah.gov/",
    excerpt:
      "Utah TY2026: 4.45% flat on Utah taxable income (the 2026 general session cut the 4.50% rate retroactively to January 1, 2026 — the sixth cut in six years, from 5% in 2018; mid-year withholding tables lag the annual-return rate as usual). Federal AGI + modifications; NO standard deduction — the nonrefundable TAXPAYER TAX CREDIT (roughly 6% of federal deductions, income-phased) applies instead and is not modeled; compute per the 2026 TC-40 and disclose.",
  }),
  flatTax({
    st: "co", name: "Colorado", version: 2, ratePctTimes100: "440",
    effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01",
    source: "Colo. Rev. Stat. § 39-22-104(1.7) (4.40% statutory); SB24-228 TABOR refund mechanisms (temporary rate reductions live for TY2025-2035, certified each September); web-verified August 2026",
    section: "C.R.S. § 39-22-104(1.7); SB24-228",
    url: "https://tax.colorado.gov/",
    excerpt:
      "Colorado TY2026: 4.40% STATUTORY flat rate on federal taxable income (TY2025 was certified at the full 4.40% — the FY2024-25 surplus missed the $300M trigger, so no temporary reduction applied). CAUTION — TABOR CONTINGENCY (SB24-228, live through 2035): if the FY2025-26 state surplus exceeds the trigger, the TY2026 rate is TEMPORARILY REDUCED (forecasts have projected ~4.36%); the determination is CERTIFIED around September 2026 and was NOT final at encoding — re-verify the certified 2026 rate from tax.colorado.gov before filing-season use; 4.40% matches the state's own 2026 withholding and estimated-tax guidance in the meantime. Colorado starts from FEDERAL TAXABLE INCOME (the federal standard/itemized deduction is embedded — do not subtract a state deduction).",
  }),
  flatTax({
    st: "az", name: "Arizona", version: 2, ratePctTimes100: "250",
    effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01",
    source: "Ariz. Rev. Stat. § 43-1011 (permanent 2.5% flat); Tax Foundation 2026 state survey (web-verified August 2026)",
    section: "A.R.S. § 43-1011",
    url: "https://azdor.gov/",
    excerpt:
      "Arizona TY2026: 2.5% flat on Arizona taxable income (permanent — no 2026 change enacted). STANDARD DEDUCTION CAVEAT: Arizona mirrors the FEDERAL standard deduction; the federal 2026 amounts are $16,100 single/MFS, $32,200 MFJ, $24,150 HOH (Rev. Proc. 2025-32), and Arizona's 2026 session UPDATED the IRC conformity date to January 1, 2026 (confirmed July 2026), so the federal 2026 amounts apply — still spot-check the printed 2026 Form 140 when it publishes. The 2026 conformity package also modified veteran pension treatment and added a charitable increase for standard-deduction filers (named, not modeled). Dependent tax credit ($100/$25, income-phased) named but not modeled.",
    parameters: {
      standardDeductionSingleFederal2026: { value: "1610000", type: "money" },
      standardDeductionJointFederal2026: { value: "3220000", type: "money" },
      standardDeductionHohFederal2026: { value: "2415000", type: "money" },
    },
  }),
  flatTax({
    st: "ia", name: "Iowa", version: 2, ratePctTimes100: "380",
    effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01",
    source: "Iowa Code § 422.5A (3.8% flat, permanent per 2024 SF 2442); Tax Foundation 2026 survey confirms no 2026 change (web-verified August 2026)",
    section: "Iowa Code § 422.5A",
    url: "https://revenue.iowa.gov/",
    excerpt:
      "Iowa TY2026: 3.8% flat, unchanged (SF 2442's consolidation landed at 3.8% with no further scheduled steps; no 2026 legislation altered it). Iowa couples to FEDERAL TAXABLE INCOME with Iowa modifications (the federal deduction is embedded); retirement income remains fully EXEMPT for 55+ filers; the $40/$80 personal exemption CREDIT still applies against tax (not modeled).",
  }),
  flatTax({
    st: "la", name: "Louisiana", version: 2, ratePctTimes100: "300",
    effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01",
    source: "La. Rev. Stat. § 47:32 (3.0% flat, 2024 3d Ex. Sess. Act 11); Tax Foundation 2026 survey confirms no 2026 change (web-verified August 2026)",
    section: "La. R.S. 47:32",
    url: "https://revenue.louisiana.gov/",
    excerpt:
      "Louisiana TY2026: 3.0% flat, unchanged. STANDARD DEDUCTION (Act 11 indexing begins 1/1/2026; LDR RIB 25-012): $12,875 single/MFS and $25,750 MFJ/QSS/HOH per the 2026 withholding parameters — LDR's own caveat: the FINAL return amounts may differ slightly once the January 2026 CPI-U figure is applied, re-verify against the printed 2026 IT-540. Retirement-income exemptions named but not modeled.",
    parameters: {
      standardDeductionSingle: { value: "1287500", type: "money" }, // $12,875 (2026, RIB 25-012)
      standardDeductionJoint: { value: "2575000", type: "money" }, // $25,750
    },
  }),
  flatTax({
    st: "mi", name: "Michigan", version: 2, ratePctTimes100: "425",
    effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01",
    source: "Mich. Comp. Laws § 206.51 (4.25% — the 2023 trigger cut to 4.05% was one-year-only per the courts); Tax Foundation 2026 survey (web-verified August 2026)",
    section: "MCL 206.51",
    url: "https://www.michigan.gov/taxes",
    excerpt:
      "Michigan TY2026: 4.25% flat on Michigan taxable income, unchanged (the 2023 revenue-trigger cut to 4.05% applied to TY2023 only, per the Court of Appeals — 4.25% controls unless a new trigger fires, none certified for 2026). PERSONAL EXEMPTION (indexed, published in Michigan's 2026 Withholding Guide, Form 446): $5,900 per person for 2026 (up from $5,800). NEW FOR 2026-2028 (H.B. 4961, Treasury notice January 6, 2026): Michigan created state DEDUCTIONS for qualified TIPS and qualified OVERTIME compensation — Michigan-specific and distinct from the federal OBBBA deductions; agent-composed with disclosure. City income taxes (Detroit etc.) and the pension phase-in (2023 PA 4 — fully phased for most retirees by 2026) still not modeled — disclose.",
    parameters: { personalExemption: { value: "590000", type: "money" } }, // $5,900 (2026 Withholding Guide)
  }),
  {
    id: "us.ma.income_tax",
    version: 2,
    jurisdiction: "us.ma",
    title: "Massachusetts income tax — TY2026: 5% Part B rate + 4% surtax over the CERTIFIED $1,107,750 threshold",
    citation: {
      source:
        "Mass. Gen. Laws ch. 62 § 4; Mass. Const. amend. art. CXXI; DOR-certified 2026 surtax threshold $1,107,750 (threshold history: $1,000,000 / $1,053,750 / $1,083,150 / $1,107,750 for 2023-2026); web-verified August 2026",
      section: "M.G.L. c. 62 § 4; Const. amend. CXXI",
      url: "https://www.mass.gov/orgs/massachusetts-department-of-revenue",
      excerpt:
        "Massachusetts TY2026: 5.0% on Part B taxable income PLUS the 4% surtax on total taxable income over $1,107,750 (the CERTIFIED inflation-indexed 2026 threshold — up from $1,083,150 in 2025) — top effective 9%. Short-term capital gains 8.5% and Part A interest/dividends 5% compose separately when present (this rule applies the 5%/9% schedule to the single stateTaxableIncome input; disclose ST-gain composition). Personal exemptions ($4,400/$8,800) statutory, unchanged.",
    },
    effectiveFrom: "2026-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      personalExemptionSingle: { value: "440000", type: "money" },
      personalExemptionJoint: { value: "880000", type: "money" },
      surtaxThreshold2026: { value: "110775000", type: "money" },
    },
    formula: {
      kind: "roundToDollar",
      value: {
        kind: "brackets",
        base: flatBase,
        table: [
          { threshold: "0", rate: { num: "500", den: "10000" } },
          { threshold: "110775000", rate: { num: "900", den: "10000" } },
        ],
      },
      mode: "half-up",
    },
  },
];
