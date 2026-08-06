/**
 * North Carolina deep state pack — TY2025 (+TY2026 rate, enacted), encoded
 * from primary sources 2026-08-03: 2025 Form D-400 (Web 7-25) + D-401
 * instruction booklet (ncdor.gov, read page-by-page), N.C.G.S. §§ 105-153.5 /
 * 105-153.7 / 105-153.11 (ncleg.gov codifications current through S.L.
 * 2025-4), NCDOR rate pages; Tax Foundation as outside cross-check.
 *
 * NC starts from federal AGI with a Jan 1, 2023 IRC conformity date — OBBBA
 * provisions do NOT flow through for TY2025 (D-401 p. 17, verbatim in the
 * parameters rule). No personal exemptions, no NC EITC, no NC CDCC; the
 * distinctive pieces are the AGI-tiered per-child deduction, the $20,000
 * combined mortgage+property-tax itemized cap, and the Bailey / military
 * retirement exclusions.
 */
import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, isStatus, money } from "./state-helpers.js";

const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const add = (...args: Expr[]): Expr => ({ kind: "add", args });
const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const param = (name: string): Expr => ({ kind: "param", name });
const le = (left: Expr, right: Expr): Expr => ({ kind: "cmp", op: "le", left, right });
const lt = (left: Expr, right: Expr): Expr => ({ kind: "cmp", op: "lt", left, right });
const mfjQss: Expr = { kind: "or", args: [isStatus("mfj"), isStatus("qss")] };

const rateRule = (version: number, from: string, to: string, num: string, label: string, excerpt: string): Rule => ({
  id: "us.nc.income_tax",
  version,
  jurisdiction: "us.nc",
  title: `North Carolina income tax — ${label} flat on NC taxable income (D-400 line 15)`,
  citation: {
    source: "N.C.G.S. § 105-153.7 (through S.L. 2023-134); 2025 D-401 p. 8; 2025 D-400 line 15; ncdor.gov rate schedule page",
    section: "N.C.G.S. § 105-153.7; D-400 line 15",
    url: "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_105/GS_105-153.7.html",
    excerpt,
  },
  effectiveFrom: from,
  effectiveTo: to,
  output: { type: "money" },
  formula: rd({
    kind: "mulRate",
    base: max0(fact("stateTaxableIncome")),
    rate: { num, den: "10000" },
    round: "half-up",
  }),
});

export const ncRules: Rule[] = [
  rateRule(
    2, // v1 was the thin state-other.ts flat rule (stateTaxableIncome only, deductions as parameters); v2+ are the deep pack
    "2025-01-01",
    "2026-01-01",
    "425",
    "TY2025: 4.25%",
    "Statute (§ 105-153.7(a), verbatim): 'the tax is a percentage of the taxpayer's North Carolina taxable income computed as follows: Taxable Years Beginning ... In 2025 4.25% ... After 2025 3.99%.' Printed 2025 D-400 line 15 (verbatim): 'North Carolina Income Tax. Multiply Line 14 by 4.25% (0.0425). If zero or less, enter a zero.' No tax table exists — the flat computation is the method. Rounding (D-401 p. 4): 'Round off to the nearest whole dollar. Drop amounts under 50 cents and increase amounts from 50 cents to 99 cents to the next whole dollar' (half-up). Input: stateTaxableIncome = D-400 line 14 NC taxable income (FAGI + Schedule S additions − Schedule S deductions − child deduction − NC standard/itemized deduction; part-year/nonresident filers multiply line 12b by the Schedule PN percentage first — proration not modeled, resident target). Filing thresholds (federal gross income): $12,750 single/MFS ($0 if the separate spouse itemizes), $25,500 MFJ/QSS, $19,125 HOH.",
  ),
  rateRule(
    3,
    "2026-01-01",
    "2027-01-01",
    "399",
    "TY2026: 3.99% (enacted, unconditional)",
    "Statute (§ 105-153.7(a), verbatim): '... In 2025 4.25% After 2025 3.99%.' The TY2026 rate is UNCONDITIONAL — the § 105-153.7(a1) revenue-trigger reductions ('the applicable tax rate ... shall be equal to the greater of (i) the prior taxable year's rate decreased by one-half percentage point (0.50%) or (ii) two and forty-nine hundredths percent (2.49%)') begin with taxable year 2027 (FY2025-26 trigger of $33,042,000,000), so a 3.49% TY2027 rate is a PROJECTION contingent on the August 2026 final revenue accounting, never encoded here. NCDOR (verbatim): 'For Taxable Years after 2025, the North Carolina individual income tax rate is 3.99% (0.0399).' TY2026 deduction/child-table amounts are statutory and unindexed (§ 105-153.5 — same amounts unless amended); re-verify against the printed 2026 D-401 when it publishes.",
  ),
  {
    id: "us.nc.standard_deduction",
    version: 1,
    jurisdiction: "us.nc",
    title: "North Carolina standard deduction — $12,750 / $25,500 / $19,125, no age/blind additions (D-400 line 11)",
    citation: {
      source: "N.C.G.S. § 105-153.5(a)(1); 2025 D-401 p. 14 (NC Standard Deduction Chart)",
      section: "N.C.G.S. § 105-153.5(a)(1); D-400 line 11",
      url: "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_105/GS_105-153.5.html",
      excerpt:
        "2025 D-401 chart (verbatim): 'Single $12,750 | Married filing jointly/Qualifying widow(er)/Surviving spouse $25,500 | Married filing separately: If spouse does not claim itemized deductions $12,750; If spouse claims itemized deductions 0 | Head of household $19,125.' Statute amounts identical (statutory, unindexed). 'There is no additional NC standard deduction amount for taxpayers who are age 65 or older or blind.' 'If you are not eligible for the federal standard deduction, your NC standard deduction is ZERO' — the spouseItemizes fact zeroes the MFS amount; other federal-ineligibility cases (nonresident aliens, short-year method changes) are out of scope for this resident target (disclosed). NC does not follow the federal dependent-filer limitation — the chart amount applies in full. A filer may take NC itemized deductions instead even without itemizing federally (us.nc.itemized_deductions); line 11 takes whichever is claimed, and the composer selects the larger when given the components.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      single: { value: "1275000", type: "money" },
      joint: { value: "2550000", type: "money" }, // MFJ/QSS
      hoh: { value: "1912500", type: "money" },
      mfs: { value: "1275000", type: "money" }, // $0 when the spouse itemizes
    },
    formula: {
      kind: "if",
      cond: mfjQss,
      then: param("joint"),
      else: {
        kind: "if",
        cond: isStatus("hoh"),
        then: param("hoh"),
        else: {
          kind: "if",
          cond: isStatus("mfs"),
          then: { kind: "if", cond: fact("spouseItemizes"), then: money("0"), else: param("mfs") },
          else: param("single"),
        },
      },
    },
  },
  {
    id: "us.nc.child_deduction",
    version: 1,
    jurisdiction: "us.nc",
    title: "North Carolina child deduction — $3,000 to $0 per federal-CTC qualifying child, by filing status and federal AGI (D-400 line 10b)",
    citation: {
      source: "N.C.G.S. § 105-153.5(a1); 2025 D-401 p. 14 (Child Deduction Worksheet + Table)",
      section: "N.C.G.S. § 105-153.5(a1); D-400 lines 10a-10b",
      url: "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_105/GS_105-153.5.html",
      excerpt:
        "Statute (verbatim): 'A taxpayer who is allowed a federal child tax credit under section 24 of the Code for the taxable year is allowed a deduction under this subsection for each qualifying child for whom the taxpayer is allowed the federal tax credit.' D-401 line 10a (verbatim): 'Enter the number of qualifying children for whom you were allowed a federal child tax credit for tax year 2025. Important: If you do not have a qualifying child as defined under Internal Revenue Code section 24, you cannot claim the child deduction' — IRC § 24 qualifying children are UNDER 17; ODC-only dependents never count. Deduction = per-child table amount × count (Child Deduction Worksheet line 5). PRINTED 2025 TABLE (verbatim, deduction per qualifying child by federal AGI): MFJ/QW/SS — up to $40,000: $3,000; over $40,000-$60,000: $2,500; -$80,000: $2,000; -$100,000: $1,500; -$120,000: $1,000; -$140,000: $500; over $140,000: $0. HOH — up to $30,000: $3,000; -$45,000: $2,500; -$60,000: $2,000; -$75,000: $1,500; -$90,000: $1,000; -$105,000: $500; over $105,000: $0. Single/MFS — up to $20,000: $3,000; -$30,000: $2,500; -$40,000: $2,000; -$50,000: $1,500; -$60,000: $1,000; -$70,000: $500; over $70,000: $0. Statute table cross-verified tier by tier. Inputs: ncFederalAgi (D-400 line 6) and qualifyingChildren (the federal-CTC count, shared with the federal rules).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      amount1: { value: "300000", type: "money" },
      amount2: { value: "250000", type: "money" },
      amount3: { value: "200000", type: "money" },
      amount4: { value: "150000", type: "money" },
      amount5: { value: "100000", type: "money" },
      amount6: { value: "50000", type: "money" },
    },
    formula: (() => {
      const agi: Expr = fact("ncFederalAgi");
      const tiers = (bounds: string[]): Expr => {
        // bounds = 6 ascending thresholds in cents; amounts 3000..500 then $0
        let expr: Expr = money("0");
        for (let i = 5; i >= 0; i--) {
          expr = {
            kind: "if",
            cond: le(agi, money(bounds[i])),
            then: param(`amount${i + 1}`),
            else: expr,
          };
        }
        return expr;
      };
      const perChild: Expr = {
        kind: "if",
        cond: mfjQss,
        then: tiers(["4000000", "6000000", "8000000", "10000000", "12000000", "14000000"]),
        else: {
          kind: "if",
          cond: isStatus("hoh"),
          then: tiers(["3000000", "4500000", "6000000", "7500000", "9000000", "10500000"]),
          else: tiers(["2000000", "3000000", "4000000", "5000000", "6000000", "7000000"]),
        },
      };
      return { kind: "mulInt", base: perChild, count: fact("qualifyingChildren") } as Expr;
    })(),
  },
  {
    id: "us.nc.itemized_deductions",
    version: 1,
    jurisdiction: "us.nc",
    title: "North Carolina itemized deductions — $20,000 combined mortgage+property cap, uncapped charitable, 7.5%-floor medical (D-400 Schedule A)",
    citation: {
      source: "N.C.G.S. § 105-153.5(a)(2); 2025 D-401 p. 20 (D-400 Schedule A instructions)",
      section: "N.C.G.S. § 105-153.5(a)(2); D-400 Schedule A lines 1-10",
      url: "https://www.ncleg.gov/EnactedLegislation/Statutes/HTML/BySection/Chapter_105/GS_105-153.5.html",
      excerpt:
        "Four components only (Schedule A lines 1-8, total line 10 → D-400 line 11): (1) qualified MORTGAGE INTEREST plus REAL ESTATE PROPERTY TAXES, combined cap (D-401 verbatim): 'the sum of qualified mortgage interest and real estate property taxes claimed may not exceed $20,000. For spouses filing as married filing separately or married filing jointly, the total mortgage interest and real estate property taxes claimed by both spouses combined may not exceed $20,000' (statute: 'may not exceed twenty thousand dollars'); (2) CHARITABLE contributions per IRC § 170 — no NC dollar cap, and 'not subject to the overall limitation on itemized deductions under section 68 of the Code'; (3) MEDICAL/dental per IRC § 213 with the printed 7.5%-of-FAGI floor (Schedule A lines 7a-7d: expenses minus 7.5% × D-400 line 6), no NC dollar cap; (4) repayment of CLAIM-OF-RIGHT income over $3,000. NO state/local INCOME tax deduction exists (only real-estate property tax, inside the $20,000 cap). NC itemizing is independent of the federal election ('even if you did not claim itemized deductions on your federal return'). MFS: the $20,000 cap is shared across both spouses' returns — supply the already-allocated amounts (disclosed). Inputs: ncMortgageInterest, ncRealEstateTaxes, ncCharitable, ncMedicalExpenses (gross — the floor is applied here), ncClaimOfRightRepayment, ncFederalAgi.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2027-01-01",
    output: { type: "money" },
    parameters: {
      mortgagePropertyCap: { value: "2000000", type: "money" }, // $20,000 combined
      medicalFloorPct: { value: "75", type: "int" }, // 7.5% of federal AGI
    },
    formula: add(
      {
        kind: "min",
        args: [
          add(max0(fact("ncMortgageInterest")), max0(fact("ncRealEstateTaxes"))),
          param("mortgagePropertyCap"),
        ],
      },
      max0(fact("ncCharitable")),
      max0(
        sub(
          max0(fact("ncMedicalExpenses")),
          rd({
            kind: "mulRate",
            base: max0(fact("ncFederalAgi")),
            rate: { num: "75", den: "1000" },
            round: "half-up",
          }),
        ),
      ),
      max0(fact("ncClaimOfRightRepayment")),
    ),
  },
  {
    id: "us.nc.use_tax",
    version: 1,
    jurisdiction: "us.nc",
    title: "North Carolina consumer use tax — no-receipts estimate table keyed to NC taxable income (D-400 line 18)",
    citation: {
      source: "N.C.G.S. § 105-164.6; 2025 D-401 p. 26 (Use Tax Table)",
      section: "D-400 line 18; D-401 use tax worksheets",
      url: "https://www.ncdor.gov/2025-d-401-individual-income-tax-instructions/open",
      excerpt:
        "2025 D-401 (verbatim header): 'Taxpayers who owe consumer use tax and who do not have any records of out-of-state purchases for tax year 2025 may use the table below to estimate the amount of consumer use tax due... If Line 14, D-400 is: At Least / But Less Than / Use Tax Amount is' — KEYED TO LINE 14 NC TAXABLE INCOME (stateTaxableIncome), not gross income. Printed rows: $0-2,200 → $1; then $1 per ~$1,500 band up to $45,200 ($2,200-3,700 → $2; 3,700-5,200 → $3; 5,200-6,700 → $4; 6,700-8,100 → $5; 8,100-9,600 → $6; 9,600-11,100 → $7; 11,100-12,600 → $8; 12,600-14,100 → $9; 14,100-15,600 → $10; 15,600-17,000 → $11; 17,000-18,500 → $12; 18,500-20,000 → $13; 20,000-21,500 → $14; 21,500-23,000 → $15; 23,000-24,400 → $16; 24,400-25,900 → $17; 25,900-27,400 → $18; 27,400-28,900 → $19; 28,900-30,400 → $20; 30,400-31,900 → $21; 31,900-33,300 → $22; 33,300-34,800 → $23; 34,800-36,300 → $24; 36,300-37,800 → $25; 37,800-39,300 → $26; 39,300-40,700 → $27; 40,700-42,200 → $28; 42,200-43,700 → $29; 43,700-45,200 → $30); '45,200 and over ... Line 14 x .000675'. The with-records worksheet (purchases × the 6.75%-7.5% county rate minus other states' sales tax) is the caller's computation — this target is the NO-RECEIPTS estimate only. Boat/aircraft/2% food purchases are reported on separate forms (E-555/E-554), never here. A filer certifying no use tax due enters $0 and fills the certification circle.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    formula: (() => {
      const ti: Expr = max0(fact("stateTaxableIncome"));
      // "At Least / But Less Than" rows: [upper bound cents, tax cents]
      const rows: [string, string][] = [
        ["220000", "100"], ["370000", "200"], ["520000", "300"], ["670000", "400"],
        ["810000", "500"], ["960000", "600"], ["1110000", "700"], ["1260000", "800"],
        ["1410000", "900"], ["1560000", "1000"], ["1700000", "1100"], ["1850000", "1200"],
        ["2000000", "1300"], ["2150000", "1400"], ["2300000", "1500"], ["2440000", "1600"],
        ["2590000", "1700"], ["2740000", "1800"], ["2890000", "1900"], ["3040000", "2000"],
        ["3190000", "2100"], ["3330000", "2200"], ["3480000", "2300"], ["3630000", "2400"],
        ["3780000", "2500"], ["3930000", "2600"], ["4070000", "2700"], ["4220000", "2800"],
        ["4370000", "2900"], ["4520000", "3000"],
      ];
      let expr: Expr = rd({
        kind: "mulRate",
        base: ti,
        rate: { num: "675", den: "1000000" }, // .000675 of line 14, $45,200 and over
        round: "half-up",
      });
      for (let i = rows.length - 1; i >= 0; i--) {
        expr = { kind: "if", cond: lt(ti, money(rows[i][0])), then: money(rows[i][1]), else: expr };
      }
      return expr;
    })(),
  },
  {
    id: "us.nc.parameters",
    version: 1,
    jurisdiction: "us.nc",
    title: "North Carolina 2025 return parameters — Schedule S modifications, retirement exclusions, credits, conformity (D-400)",
    citation: {
      source:
        "2025 Form D-400 + D-401 instructions (ncdor.gov, read 2026-08-03); N.C.G.S. §§ 105-153.5, 105-153.11 (through S.L. 2025-4)",
      section: "D-400 Schedule S / Schedule A / D-400TC",
      url: "https://www.ncdor.gov/2025-d-401-individual-income-tax-instructions/open",
      excerpt:
        "IRC CONFORMITY (D-401 p. 17, verbatim): 'The starting point for North Carolina taxable income is federal adjusted gross income as of January 1, 2023. This means that any change made to the Internal Revenue Code after January 1, 2023, including changes made to the Code as part of the federal reconciliation act (OBBBA) DO NOT apply when calculating North Carolina taxable income for tax year 2025 unless North Carolina conforms' — OBBBA items inside federal AGI for 2025 (e.g., the Schedule 1-A tips/overtime deductions are BELOW-AGI federally so they never flow; above-AGI OBBBA changes need Schedule S add-backs) must be reviewed per NCDOR guidance; disclose when relevant."
        + "\n\nSCHEDULE S PART B DEDUCTIONS (verbatim highlights): line 17 state/local income tax refunds in FAGI; line 18 interest on 'notes, bonds, and other obligations of the United States'; line 19 SOCIAL SECURITY fully deductible ('Social Security and railroad retirement benefits are not subject to state income tax'); line 20 BAILEY SETTLEMENT retirement ('retirees of the state of North Carolina and its local governments or by United States government retirees (including military) ... if the retiree had five or more years of creditable service as of August 12, 1989', incl. state § 401(k)/§ 457 contributed before that date; NOT local § 457 or § 403(b)); line 21 MILITARY RETIREMENT — only for members who '1. Served at least 20 years in the uniformed services. 2. Medically retired under 10 U.S.C. Chapter 61' (either), plus SBP payments; never severance pay; no double-dip with Bailey. NO NC 529 deduction (repealed for tax years on/after 1/1/2014); NO unemployment subtraction (taxed as in FAGI). PART A ADDITIONS: non-NC state/local bond interest; 85% BONUS DEPRECIATION add-back ('You must add 85% of the amount of bonus depreciation deducted on your federal return', with 20%-per-year recoupment deductions in the five following years, lines 23/24); § 179 excess over NC's $25,000/$200,000 limits; federal NOL add-back (NC NOL on line 39); PTE SALT taxes; ARPA student-loan discharge."
        + "\n\nCREDITS (D-400TC): Part 1 credit for income tax paid to another state or country — RESIDENTS ONLY, 'No credit is allowed for income taxes paid to a city, county, or other political subdivision of a state or country or to the federal government'; credit = lesser of the net tax paid the other state or NC tax × (double-taxed income ÷ total NC income). NO NC child and dependent care credit and NO NC EITC (both repealed in the 2014 rewrite — verified absent from the entire 2025 D-400TC). NEW § 105-153.11 conservation real-property-donation credit (25% of FMV, TY2025-2026 donations) applies per its application-year timing rule — expect the claim line on TY2026 forms; the companion § 105-153.5(a)(2)a.3 bars the itemized charitable deduction for such donations."
        + "\n\nMECHANICS: no personal exemptions; no age/blind standard-deduction additions; whole-dollar rounding (drop under 50 cents, raise 50-99); filing thresholds = the standard-deduction amounts (federal GROSS income test); negative amounts print with filled circles on lines 6/8/12b/14/25; part-year/nonresidents prorate via Schedule PN's four-decimal percentage on line 13 (out of scope — resident target); consumer use tax county rates 6.75%-7.5% (with-records worksheet) or the us.nc.use_tax no-receipts table.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      bonusDepreciationAddbackPct: { value: "85", type: "int" },
      section179DollarLimit: { value: "2500000", type: "money" }, // $25,000 NC limit
      section179InvestmentLimit: { value: "20000000", type: "money" }, // $200,000
      conservationCreditPct: { value: "25", type: "int" }, // § 105-153.11 (TY2025-26 donations)
      claimOfRightFloor: { value: "300000", type: "money" }, // $3,000 (Schedule A line 8)
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: use lookup_tax_parameter for the NC amounts; tax → us.nc.income_tax, deductions → us.nc.standard_deduction / us.nc.itemized_deductions / us.nc.child_deduction, use tax → us.nc.use_tax; Schedule S modifications and the D-400TC other-state credit are agent-composed from the cited lines",
    },
  },
];
