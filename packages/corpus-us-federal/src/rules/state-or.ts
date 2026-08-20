import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, money, printedSchedule } from "./state-helpers.js";

/**
 * Oregon deep pack — TY2025 Form OR-40. All amounts verified from the
 * official 2025 Form OR-40 instructions (Rev. 01-29-26) and Publication
 * OR-17 (oregon.gov/dor). Load-bearing findings: the printed tax tables and
 * the >=$50,000 rate charts both chain from WHOLE-DOLLAR ROUNDED bracket
 * anchors ($661/$1,323 at the 8.75% boundary — this is why Chart J prints
 * $3,756 where the pure schedule gives $3,755.00, and why table row
 * [19,500-19,600) prints $1,400 not $1,401); the 2025 kicker is 9.863% of
 * the 2024 liability; and Oregon CONFORMS to the OBBBA tips/overtime/
 * vehicle-interest deductions via OR-ASC subtraction codes 390/391/392.
 */

const rd = (value: Expr): Expr => ({ kind: "roundToDollar", value, mode: "half-up" });
const lt = (left: Expr, right: Expr): Expr => ({ kind: "cmp", op: "lt", left, right });
const iff = (cond: Expr, then: Expr, els: Expr): Expr => ({ kind: "if", cond, then, else: els });
const mulInt = (base: Expr, count: Expr): Expr => ({ kind: "mulInt", base, count });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const isStatus = (v: string): Expr => ({ kind: "cmp", op: "eq", left: fact("filingStatus"), right: { kind: "enum", value: v } });
// Column S = single or MFS; Column J = MFJ, HOH, or QSS (printed table/chart split)
const isColumnS: Expr = { kind: "or", args: [isStatus("single"), isStatus("mfs")] };

// Rounded-anchor schedules (the printed convention): the 8.75% anchors are
// the exact bracket tax ROUNDED to whole dollars (661.25 -> 661; 1,322.50 ->
// 1,323), and every printed table row / chart value chains from them.
const SCHED_S = [
  { thresholdCents: "0", fixedCents: "0", rate: { num: "475", den: "10000" } },
  { thresholdCents: "440000", fixedCents: "20900", rate: { num: "675", den: "10000" } }, // $4,400 -> $209
  { thresholdCents: "1110000", fixedCents: "66100", rate: { num: "875", den: "10000" } }, // $11,100 -> $661 (exact 661.25)
];
const SCHED_J = [
  { thresholdCents: "0", fixedCents: "0", rate: { num: "475", den: "10000" } },
  { thresholdCents: "880000", fixedCents: "41800", rate: { num: "675", den: "10000" } }, // $8,800 -> $418
  { thresholdCents: "2220000", fixedCents: "132300", rate: { num: "875", den: "10000" } }, // $22,200 -> $1,323 (exact 1,322.50)
];

export const orRules: Rule[] = [
  {
    id: "us.or.income_tax",
    version: 1,
    jurisdiction: "us.or",
    title:
      "Oregon income tax — 4.75%/6.75%/8.75%/9.9% (2025 brackets $4,400/$11,100/$125,000 single-MFS, $8,800/$22,200/$250,000 joint-HOH-QSS) via the printed tables and rate charts (OR-40 line 20)",
    citation: {
      source:
        "ORS 316.037 (indexed under ORS 316.045); 2025 Form OR-40 Instructions (150-101-040-1 Rev. 01-29-26): tax tables pp. 27-31, 2025 Tax rate charts p. 32; Publication OR-17 rate table",
      section: "ORS 316.037; OR-40 line 20; 2025 tables/charts",
      url: "https://www.oregon.gov/dor/forms/FormsPubs/form-or-40-inst_101-040-1_2025.pdf",
      excerpt:
        "TWO COLUMNS (instructions verbatim): 'Use Column S if your filing status is single or married filing separately. Use Column J if your filing status is married filing jointly, head of household, or qualifying surviving spouse.' 2025 INDEXED BRACKETS (OR-17): S — 4.75% first $4,400; 6.75% $4,401-$11,100; 8.75% $11,101-$125,000; 9.9% over $125,000. J — 4.75% first $8,800; 6.75% $8,801-$22,200; 8.75% $22,201-$250,000; 9.9% over $250,000. METHOD: taxable income UNDER $50,000 must use the printed TAX TABLES; '$50,000 or more' uses the printed RATE CHARTS: Chart S 'your tax is $4,065 plus 8.75% of excess over $50,000' ($50,000-$125,000) then '$10,627 plus 9.9% of excess over $125,000'; Chart J '$3,756 plus 8.75%' ($50,000-$250,000) then '$21,256 plus 9.9% of excess over $250,000' — all four chart constants encoded AS PRINTED. BOUNDARY: Chart S row 1 covers '$50,000 or more but not over $125,000', so exactly $125,000 computes 4,065 + 8.75% x 75,000 = 10,627.50 -> $10,628 — $1 ABOVE the over-$125,000 row's own $10,627 anchor (the printed chart is internally inconsistent at this point; this rule follows the printed row assignment). At exactly $250,000, Chart J gives $21,256 either way. CONVENTION (decoded from 20+ printed rows AND the charts): every value chains from WHOLE-DOLLAR ROUNDED bracket anchors — the 8.75% anchors are $661 (exact 661.25) and $1,323 (exact 1,322.50) — evaluated at the ROW MIDPOINT and rounded half-up (verified: S [19,500-19,600)→$1,400 — the pure unrounded schedule gives 1,400.625→1,401 WRONG; J chart $3,756 = 1,323 + 2,432.50 → 3,755.50 up, where the pure schedule gives exactly 3,755). Row widths: [0,20), [20,50), [50,100), then $100-wide to $50,000 — the generic midpoint covers every row incl. the first three. useFormulaMethod=true evaluates the rounded-anchor marginal schedule at the exact income (the charts' own method extended below $50,000). ALTERNATE METHODS (checkboxes 20a-c, transcribed, not computed): farm income averaging (OR-FIA-40), farm capital gain rate (Worksheet FCG), and the IRREVOCABLE Oregon PTE reduced rate (OR-PTE-FY). Part-year (OR-40-P) and nonresident (OR-40-N) returns not composed. Brackets index annually — the 2026 table publishes ~January 2027.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      sBracket2: { value: "440000", type: "money" }, // $4,400
      sBracket3: { value: "1110000", type: "money" }, // $11,100
      jBracket2: { value: "880000", type: "money" }, // $8,800
      jBracket3: { value: "2220000", type: "money" }, // $22,200
      topBracketS: { value: "12500000", type: "money" }, // $125,000
      topBracketJ: { value: "25000000", type: "money" }, // $250,000
      chartAnchorS50k: { value: "406500", type: "money" }, // $4,065 as printed
      chartAnchorJ50k: { value: "375600", type: "money" }, // $3,756 as printed
      chartAnchorS125k: { value: "1062700", type: "money" }, // $10,627 as printed
      chartAnchorJ250k: { value: "2125600", type: "money" }, // $21,256 as printed
      tableThreshold: { value: "5000000", type: "money" }, // $50,000
    },
    formula: (() => {
      const base: Expr = { kind: "max0", arg: fact("stateTaxableIncome") };
      const sched = (b: Expr): Expr => iff(isColumnS, printedSchedule(b, SCHED_S), printedSchedule(b, SCHED_J));
      // rows: [0,20), [20,50), [50,100), then $100-wide — generic midpoints
      const mid = (width: string, offset: string): Expr => ({
        kind: "add",
        args: [mulInt(money(width), { kind: "stepUnits", value: base, unitCents: width, mode: "floor" }), money(offset)],
      });
      const table: Expr = iff(
        lt(base, money("2000")),
        sched(money("1000")), // [0,20) midpoint $10
        iff(
          lt(base, money("5000")),
          sched(money("3500")), // [20,50) midpoint $35
          iff(lt(base, money("10000")), sched(money("7500")), sched(mid("10000", "5000"))),
        ),
      );
      // printed rate charts (>= $50,000), constants as printed
      // the first chart row covers 'but not over' the top bracket, so exactly
      // $125,000/$250,000 computes on row 1 (S: 10,627.50 -> 10,628 — $1 above
      // the over-row anchor's printed $10,627; J: exactly 21,256 either way)
      const chart = (a50k: string, top: string, aTop: string): Expr =>
        iff(
          { kind: "cmp", op: "le", left: base, right: money(top) },
          { kind: "add", args: [money(a50k), { kind: "mulRate", base: sub(base, money("5000000")), rate: { num: "875", den: "10000" }, round: "half-up" }] },
          { kind: "add", args: [money(aTop), { kind: "mulRate", base: sub(base, money(top)), rate: { num: "99", den: "1000" }, round: "half-up" }] },
        );
      const charts: Expr = iff(
        isColumnS,
        chart("406500", "12500000", "1062700"),
        chart("375600", "25000000", "2125600"),
      );
      return rd(iff(fact("useFormulaMethod"), sched(base), iff(lt(base, money("5000000")), table, charts)));
    })(),
  },
  {
    id: "us.or.federal_tax_subtraction",
    version: 1,
    jurisdiction: "us.or",
    title:
      "Oregon federal tax liability subtraction — capped $8,500 ($4,250 MFS) and phased out by federal AGI in five steps ($125,000-$145,000 single/MFS; $250,000-$290,000 joint/HOH/QSS) (OR-40 line 10)",
    citation: {
      source:
        "ORS 316.685/316.695 (indexed); 2025 Form OR-40 Instructions, line 10 worksheet and Table 4 (Federal tax liability subtraction AGI phaseout)",
      section: "ORS 316.685; OR-40 line 10; Table 4",
      url: "https://www.oregon.gov/dor/forms/FormsPubs/form-or-40-inst_101-040-1_2025.pdf",
      excerpt:
        "'Your federal tax liability subtraction amount is your federal income tax after all credits other than the earned income tax credit (EITC). For 2025, the amount you may subtract is limited to $8,500 ($4,250 if married filing separately)' and further limited by AGI. WORKSHEET (printed, verbatim structure): line 1 = federal Form 1040 LINE 22; line 2 = excess advance premium tax credit repayment (Schedule 2 line 1a) — SUBTRACTED (floor 0); line 4 = other INCOME taxes and recaptures from Schedule 2 lines 8, 16, 17 (never SE tax, SS/Medicare tip tax, household employment taxes, penalties, interest, excise) — ADDED; minus the refundable credits: line 6 American Opportunity (1040 line 29), line 7 refundable adoption (line 30), line 8 PREMIUM TAX CREDIT (Form 8962 LINE 24 — the full allowable credit, 'regardless of any excess advance payments'); floor $0. NOTE which refundables are NOT subtracted: the EITC and the additional child tax credit. TABLE 4 CAPS (verbatim): single — $8,500 (AGI < $125,000), $6,800 (< $130,000), $5,100 (< $135,000), $3,400 (< $140,000), $1,700 (< $145,000), $0 at $145,000+; MFS — $4,250/$3,400/$2,550/$1,700/$850/$0 at the SAME AGI breakpoints; MFJ, HOH, and QSS — $8,500 (AGI < $250,000), $6,800 (< $260,000), $5,100 (< $270,000), $3,400 (< $280,000), $1,700 (< $290,000), $0 at $290,000+. Joint-federal/separate-Oregon filers and RDPs use ACTUAL federal returns, not 'as if' returns. [Inputs: orFederalTaxLiability (the worksheet line 10 result — composed per the printed steps), orAgi, filingStatus.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      capRegular: { value: "850000", type: "money" }, // $8,500
      capMfs: { value: "425000", type: "money" }, // $4,250
      phaseoutStartSingleMfs: { value: "12500000", type: "money" }, // $125,000
      phaseoutStartJoint: { value: "25000000", type: "money" }, // $250,000
    },
    formula: (() => {
      const agi: Expr = fact("orAgi");
      // five-step phaseout: cap - stepAmount x steps, where steps are $5,000
      // wide (single/MFS) or $10,000 wide (joint/HOH/QSS)
      const tier = (bounds: string[], caps: string[]): Expr => {
        let e: Expr = money("0");
        for (let i = bounds.length - 1; i >= 0; i--) {
          e = iff(lt(agi, money(bounds[i])), money(caps[i]), e);
        }
        return e;
      };
      const capSingle = tier(
        ["12500000", "13000000", "13500000", "14000000", "14500000"],
        ["850000", "680000", "510000", "340000", "170000"],
      );
      const capMfs = tier(
        ["12500000", "13000000", "13500000", "14000000", "14500000"],
        ["425000", "340000", "255000", "170000", "85000"],
      );
      const capJoint = tier(
        ["25000000", "26000000", "27000000", "28000000", "29000000"],
        ["850000", "680000", "510000", "340000", "170000"],
      );
      const cap: Expr = iff(isStatus("mfs"), capMfs, iff(isStatus("single"), capSingle, capJoint));
      return { kind: "min", args: [{ kind: "max0", arg: fact("orFederalTaxLiability") }, cap] };
    })(),
  },
  {
    id: "us.or.standard_deduction",
    version: 1,
    jurisdiction: "us.or",
    title:
      "Oregon standard deduction — 2025: $2,835 single/MFS, $5,670 MFJ/QSS, $4,560 HOH; +$1,200 (single/HOH) or +$1,000 (others) per 65+/blind box; dependent-claimed limit; $0 for MFS with itemizing spouse (OR-40 line 17)",
    citation: {
      source: "ORS 316.695(1)(c) (indexed); 2025 Form OR-40 Instructions, Table 5 and the standard deduction worksheets",
      section: "OR-40 line 17; Table 5",
      url: "https://www.oregon.gov/dor/forms/FormsPubs/form-or-40-inst_101-040-1_2025.pdf",
      excerpt:
        "TABLE 5 (2025, verbatim): single $2,835; married filing jointly $5,670; married filing separately $2,835 if the spouse claims the standard deduction, $0 IF THE SPOUSE ITEMIZES ('This applies even if the standard deduction is more than your itemized deductions'); head of household $4,560; qualifying surviving spouse $5,670. AGE 65+/BLIND: for each box checked (turned 65 by January 1, 2026, or blind at year end — you/spouse), ADD $1,200 (single or head of household) or $1,000 (all other statuses). DEPENDENT-CLAIMED filers: the basic deduction is limited to the larger of $1,350 or earned income + $450, capped at the filing status's Table 5 amount ('even if the other person doesn't actually claim you'); the 65+/blind additions apply ON TOP of the limited basic amount (printed worksheet lines 8-10). Non-U.S. citizens without permanent-resident status: $0 (itemizing allowed). Oregon itemized deductions (Schedule OR-A — NOT the federal amounts) are claimed instead when larger; line 18 takes the LARGER of lines 16 and 17. [Inputs: filingStatus, orStdBoxes, spouseItemizes (MFS), isClaimedAsDependent, orDependentEarnedIncome.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      single: { value: "283500", type: "money" },
      mfj: { value: "567000", type: "money" },
      hoh: { value: "456000", type: "money" },
      addlSingleHoh: { value: "120000", type: "money" }, // $1,200 per box
      addlOther: { value: "100000", type: "money" }, // $1,000 per box
      dependentMinimum: { value: "135000", type: "money" }, // $1,350
      dependentEarnedAddon: { value: "45000", type: "money" }, // $450
    },
    formula: (() => {
      const basic: Expr = iff(
        { kind: "or", args: [isStatus("mfj"), isStatus("qss")] },
        money("567000"),
        iff(isStatus("hoh"), money("456000"), money("283500")),
      );
      const dependentLimited: Expr = {
        kind: "min",
        args: [
          basic,
          {
            kind: "max",
            args: [money("135000"), { kind: "add", args: [{ kind: "max0", arg: fact("orDependentEarnedIncome") }, money("45000")] }],
          },
        ],
      };
      const base: Expr = iff(fact("isClaimedAsDependent"), dependentLimited, basic);
      const perBox: Expr = iff(
        { kind: "or", args: [isStatus("single"), isStatus("hoh")] },
        money("120000"),
        money("100000"),
      );
      const withBoxes: Expr = { kind: "add", args: [base, mulInt(perBox, fact("orStdBoxes"))] };
      return iff({ kind: "and", args: [isStatus("mfs"), fact("spouseItemizes")] }, money("0"), withBoxes);
    })(),
  },
  {
    id: "us.or.exemption_credit",
    version: 1,
    jurisdiction: "us.or",
    title:
      "Oregon exemption credit — $256 per exemption for 2025, denied above $100,000 federal AGI (single/MFS) or $200,000 (others); disability exemptions denied above $100,000 for ALL statuses (OR-40 line 25)",
    citation: {
      source: "ORS 316.085 (indexed); 2025 Form OR-40 Instructions, line 25 exemption credit worksheet",
      section: "OR-40 line 25; exemption credit worksheet",
      url: "https://www.oregon.gov/dor/forms/FormsPubs/form-or-40-inst_101-040-1_2025.pdf",
      excerpt:
        "2025 amount: $256 per exemption (worksheet line 5: 'Line 4 multiplied by $256'). REGULAR exemptions (self/spouse boxes 6a-6b + dependents 6c): $0 'If your federal AGI is more than $200,000 ($100,000 if your filing status is single or married filing separately)' — a CLIFF, not a phase-out. SEVERE-DISABILITY exemptions (boxes 6a/6b) and exemptions for CHILDREN WITH A QUALIFYING DISABILITY (line 6d): $0 if federal AGI is more than $100,000 — the $100,000 disability cliff applies to EVERY filing status including joint (worksheet lines 2-3). A standard credit (nonrefundable, no carryforward). [Inputs: orRegularExemptions (6a+6b regular boxes + 6c dependents), orDisabilityExemptions (severe-disability boxes + 6d qualifying-disability children), orAgi, filingStatus.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      perExemption: { value: "25600", type: "money" }, // $256
      regularAgiLimitSingleMfs: { value: "10000000", type: "money" }, // $100,000
      regularAgiLimitOther: { value: "20000000", type: "money" }, // $200,000
      disabilityAgiLimit: { value: "10000000", type: "money" }, // $100,000 all statuses
    },
    formula: (() => {
      const agi: Expr = fact("orAgi");
      const regularLimit: Expr = iff(isColumnS, money("10000000"), money("20000000"));
      const regular: Expr = iff(
        { kind: "cmp", op: "le", left: agi, right: regularLimit },
        mulInt(money("25600"), fact("orRegularExemptions")),
        money("0"),
      );
      const disability: Expr = iff(
        { kind: "cmp", op: "le", left: agi, right: money("10000000") },
        mulInt(money("25600"), fact("orDisabilityExemptions")),
        money("0"),
      );
      return { kind: "add", args: [regular, disability] };
    })(),
  },
  {
    id: "us.or.eic",
    version: 1,
    jurisdiction: "us.or",
    title:
      "Oregon earned income credit — 9% of the federal EITC (12% with a dependent younger than 3 at year end), refundable (OR-40 line 37)",
    citation: {
      source: "ORS 315.266; 2025 Form OR-40 Instructions, line 37 and Table 9 (EITC percentage)",
      section: "ORS 315.266; OR-40 line 37; Table 9",
      url: "https://www.oregon.gov/dor/forms/FormsPubs/form-or-40-inst_101-040-1_2025.pdf",
      excerpt:
        "TABLE 9 (verbatim): youngest dependent 'At least 3 years old, or no dependents' → 9 percent (0.09) of the federal EITC (1040 line 27a); 'Younger than 3' → 12 percent (0.12). REFUNDABLE. RDPs may claim it using the 'as if' federal return. ITIN filers who cannot claim the federal EITC (filer, spouse, or children lacking work-valid SSNs) may qualify via Schedule OR-EIC-ITIN — the Oregon-computed equivalent (transcribed, not modeled). [Inputs: orFederalEic, orYoungestUnder3.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      pctRegular: { value: "9", type: "int" },
      pctUnder3: { value: "12", type: "int" },
    },
    formula: rd(
      iff(
        fact("orYoungestUnder3"),
        { kind: "mulRate", base: { kind: "max0", arg: fact("orFederalEic") }, rate: { num: "12", den: "100" }, round: "half-up" },
        { kind: "mulRate", base: { kind: "max0", arg: fact("orFederalEic") }, rate: { num: "9", den: "100" }, round: "half-up" },
      ),
    ),
  },
  {
    id: "us.or.kids_credit",
    version: 1,
    jurisdiction: "us.or",
    title:
      "Oregon Kids Credit — $1,050 per dependent age 5 or younger (max 5), phased out ratably over qualifying income $26,550-$31,550, refundable; MFS denied (OR-40 line 38)",
    citation: {
      source:
        "ORS 315.273; 2025 Form OR-40 Instructions (updated January 29, 2026 to correct this credit's worksheet), line 38 and the Oregon Kids Credit worksheet",
      section: "ORS 315.273; OR-40 line 38",
      url: "https://www.oregon.gov/dor/forms/FormsPubs/form-or-40-inst_101-040-1_2025.pdf",
      excerpt:
        "2025 maximum: '$1,050 per qualifying dependent, for up to five dependents' (max $5,250), REFUNDABLE. DENIED to married filing separately. QUALIFYING INCOME (worksheet Part A): OR-40 line 15 income-after-subtractions PLUS any tips/overtime/vehicle-interest subtractions claimed (Schedule OR-ASC codes 390, 391, 392 — the OBBBA-parallel items are ADDED BACK for this test) PLUS the Part B loss-and-exclusion addback (federal losses and OR-ASC loss-subtractions beyond a $20,000 allowance, and ALL excluded foreign earned income). PHASE-OUT (worksheet verbatim): qualifying income '$26,550 or less' → full credit; '$31,550 or more' → $0; between, the reduction ratio = (QI − $26,550) ÷ $5,000 'Round to two decimal places', credit = (dependents × $1,050) × (1 − ratio) — the two-decimal rounding of the RATIO is the printed convention. Custodial-parent rule: a child claimed only via a released dependent exemption does NOT qualify; the custodial parent may claim even after releasing the exemption. [Inputs: orKidsQualifyingIncome (the worksheet line 4 result, composed), orKidsUnder6 (count, capped at 5 by this rule).]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      perChild: { value: "105000", type: "money" }, // $1,050
      maxChildren: { value: "5", type: "int" },
      phaseoutStart: { value: "2655000", type: "money" }, // $26,550
      phaseoutEnd: { value: "3155000", type: "money" }, // $31,550
    },
    formula: (() => {
      const qi: Expr = fact("orKidsQualifyingIncome");
      // cap at 5 children ('Don't enter more than 5')
      const base: Expr = iff(
        { kind: "cmp", op: "gt", left: fact("orKidsUnder6"), right: { kind: "int", value: "5" } },
        mulInt(money("105000"), { kind: "int", value: "5" }),
        mulInt(money("105000"), fact("orKidsUnder6")),
      );
      const excess: Expr = { kind: "max0", arg: sub(qi, money("2655000")) };
      // ratio to two decimals = round(excess x 100 / $5,000) hundredths
      // (half-up per the worksheet's 'Round to two decimal places')
      const hundredths: Expr = { kind: "mulDiv", a: excess, b: money("100"), c: money("500000"), round: "half-up" };
      const reduction: Expr = { kind: "mulDiv", a: base, b: hundredths, c: money("100"), round: "half-up" };
      const credit: Expr = { kind: "max0", arg: sub(base, reduction) };
      return iff(
        { kind: "cmp", op: "ge", left: qi, right: money("3155000") },
        money("0"),
        iff(isStatus("mfs"), money("0"), rd(credit)),
      );
    })(),
  },
  {
    id: "us.or.kicker",
    version: 1,
    jurisdiction: "us.or",
    title:
      "Oregon surplus credit (kicker) — 9.863% of the 2024 total Oregon personal income tax liability, claimed on the 2025 return (OR-40 line 32)",
    citation: {
      source:
        "ORS 291.349; 2025 Form OR-40 Instructions, line 32 ('For 2025, your kicker is 9.863 percent of your 2024 total Oregon personal income tax liability')",
      section: "ORS 291.349; OR-40 line 32",
      url: "https://www.oregon.gov/dor/forms/FormsPubs/form-or-40-inst_101-040-1_2025.pdf",
      excerpt:
        "2025 kicker (verbatim): '9.863 percent of your 2024 total Oregon personal income tax liability' — where the 2024 liability is 'your Oregon income tax before all payments or credits OTHER THAN the credit for income taxes paid to another state on mutually-taxed income' (i.e. after the other-state credit, before everything else). ELIGIBILITY: (1) filed the 2024 Oregon return before the 2025 return, (2) had a 2024 Oregon tax liability, (3) file a 2025 return even with no other filing requirement. Claimed as a PAYMENT-like refundable amount on line 32. Filing-status changes prorate by 2024 Oregon-AGI share (worksheet Parts B/C); a 2024 amendment adjusts the kicker (and can be billed back). The filer may irrevocably donate the ENTIRE kicker to the State School Fund instead (enter 0 on line 32 + checkbox 55). The kicker exists only in surplus years (odd-year returns when certified) — there is NO kicker on 2024 or 2026 returns. [Input: or2024TaxLiability (the 2024 after-other-state-credit liability, transcribed from the 2024 return).]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      kickerPctTimes1000: { value: "9863", type: "int" }, // 9.863%
    },
    formula: rd({
      kind: "mulRate",
      base: { kind: "max0", arg: fact("or2024TaxLiability") },
      rate: { num: "9863", den: "100000" },
      round: "half-up",
    }),
  },
  {
    id: "us.or.parameters",
    version: 1,
    jurisdiction: "us.or",
    title:
      "Oregon 2025 OR-40 parameters — Social Security subtraction, OBBBA conformity via OR-ASC codes, political contribution credit, alternate tax methods, and composition conventions",
    citation: {
      source:
        "2025 Form OR-40 + Instructions (150-101-040-1 Rev. 01-29-26); Publication OR-17 (101-431, 143pp); web-verified August 2026",
      section: "Form OR-40; 2025 instructions; OR-17",
      url: "https://www.oregon.gov/dor/forms/FormsPubs/form-or-40-inst_101-040-1_2025.pdf",
      excerpt:
        "STRUCTURE (lines 7-53): 7 federal AGI (1040 line 11; the federal return with Schedules 1/1-A/2/3 ATTACHES); 8 additions (Schedule OR-ASC line A5); 9 = 7+8; SUBTRACTIONS: 10 federal tax liability subtraction (→ us.or.federal_tax_subtraction), 11 SOCIAL SECURITY/tier 1 RR = federal line 6b IN FULL (Oregon never taxes SS; tier 2/windfall RR subtract on OR-ASC), 12 Oregon state refund from federal Schedule 1 line 1 (never other states'), 13 OR-ASC subtractions (line B7) — including the NEW OBBBA-CONFORMING subtractions ('You may be able to claim the same deductions for tip income, overtime wages, and passenger vehicle loan interest that you're claiming on your federal return' — codes 390/391/392; note these ADD BACK for the Kids Credit income test) and the new 2025 First-Time Home Buyer Savings Account subtraction (OR-HOME); 14 = 10+11+12+13; 15 = 9−14; 16 OREGON itemized (Schedule OR-A — never the federal Schedule A total); 17 standard deduction (→ us.or.standard_deduction); 18 = LARGER of 16/17; 19 taxable income = 15−18 (floor 0). TAX: 20 → us.or.income_tax (or checkbox methods 20a OR-FIA-40 farm averaging / 20b Worksheet FCG farm gain / 20c OR-PTE-FY reduced rate, transcribed); 21 installment-sale interest (9% rate for 2025, 8% for 2026); 22 OR-ASC recaptures (C5); 23 = 21+22; 24 = 20+23. STANDARD CREDITS: 25 exemption credit (→ us.or.exemption_credit); 26 POLITICAL CONTRIBUTION credit — up to $50 ($100 joint), DENIED when federal AGI exceeds $75,000 ($150,000 joint); 27 OR-ASC standard credits (D16 — retirement income credit, other-state credit, etc., transcribed); 28 = 25+26+27; 29 = max0(24−28); 30 OR-ASC carryforward credits (E9 — political NOT carryforward; these are); 31 = 29−30. PAYMENTS/REFUNDABLES: 32 KICKER (→ us.or.kicker); 33 withholding (W-2/1099 attach; NEVER the statewide transit tax); 34 prior-year refund applied; 35 estimates INCLUDING extension payments made by April 15, 2026; 36 OR-K-1/OR-19 PTE payments; 37 EIC (→ us.or.eic); 38 Kids Credit (→ us.or.kids_credit); 39 OR-ASC refundables (F7); 40 = 32..39. SETTLE: 41 overpayment = 40−31; 42 tax to pay = 31−40; 43 penalty AND interest for filing/paying late (one combined line: 5% late-pay, +20% over 3 months, 100% for 3 consecutive unfiled years); 44 = Form OR-10 interest on UNDERPAYMENT of estimated tax; 45 = 43+44 (when line 45 exceeds a line 41 overpayment, line 46 = 45 − 41 per the printed note); 46 = 42+45 OWED; 47 = 41−45 REFUND (refunds under $1 not issued; 3-year claim window); 48-51 applications (2026 estimates, OR-DONATE charities, political party contribution, OR-529 deposits); 52 = their total (≤ line 47); 53 net refund. NOT ON THIS RETURN: the statewide transit tax (0.1% of wages, employer-withheld, Form OR-STI only if untaxed), Portland Metro SHS 1% and Multnomah County PFA (separate local returns), TriMet/LTD self-employment transit taxes (OR-TM/OR-LTD). Whole-dollar rounding throughout. Federal conformity: ROLLING (ORS 316.048 ties to the IRC 'as amended' for personal income) — the OBBBA tips/overtime/vehicle-interest deductions are BELOW-the-line federally (they do not reduce federal AGI), which is why Oregon grants them via the OR-ASC subtraction codes above. RDPs: Oregon recognizes registered domestic partners filing jointly via 'as if' federal returns (not composed).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      politicalContributionMax: { value: "5000", type: "money" }, // $50 ($100 joint)
      politicalContributionMaxJoint: { value: "10000", type: "money" },
      politicalContributionAgiLimit: { value: "7500000", type: "money" }, // $75,000
      politicalContributionAgiLimitJoint: { value: "15000000", type: "money" },
      installmentInterestPct2025: { value: "9", type: "int" },
      transitTaxRateBps: { value: "10", type: "int" }, // 0.1% statewide transit (separate)
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: Oregon OR-40 composition conventions and transcription parameters — use lookup_tax_parameter / read the citation; the computable pieces are us.or.income_tax, us.or.federal_tax_subtraction, us.or.standard_deduction, us.or.exemption_credit, us.or.eic, us.or.kids_credit, and us.or.kicker",
    },
  },
];
