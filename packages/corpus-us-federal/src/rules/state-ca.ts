import type { Expr, Rule } from "@invaro/opentax-core";
import { fact, isStatus, money, ruleRef } from "./state-helpers.js";

export const caRules: Rule[] = [
  {
    id: "us.ca.income_tax",
    version: 5, // v2 refused MFJ/QSS entirely; v3 encodes Schedule Y per-bracket (not by doubling Schedule X's rounded constants); v4 discloses the Schedule CA social security exclusion alongside unemployment compensation; v5 encodes the FTB Tax Table convention (midpoint of the $100-wide bracket, sub-$100,000) as the default method, per the VA/NY table pattern
    jurisdiction: "us.ca",
    title:
      "California income tax — 2025 rate schedules X (single/MFS), Y (MFJ/QSS), and Z (HOH), Form 540 line 31",
    citation: {
      source:
        "2025 California Tax Rate Schedules (FTB); 2025 California Tax Table (FTB 540 booklet); Rev. & Tax. Code § 17041",
      section: "FTB 2025 Schedule X / Schedule Y / Schedule Z; 2025 California Tax Table",
      url: "https://www.ftb.ca.gov/forms/2025/2025-540-tax-rate-schedules.pdf",
      excerpt:
        "2025 Schedule Z (head of household), FTB: 1% to $22,173; 2% to $52,530; 4% to $67,716; 6% to $83,805; 8% to $98,990; 9.3% to $505,208 — income above $505,208 REFUSES here (higher 10.3/11.3/12.3% tiers and the 1% MHSA surcharge not yet encoded from source). Schedule X (single/MFS), 2025 FTB, web-verified July 2026: 1% to $11,079; 2% to $26,264; 4% to $41,452; 6% to $57,542; 8% to $72,724; 9.3% above (same $505,208 shared refusal boundary as this rule's HOH branch, applied before differentiating single from HOH) — corrected in v5 from stale/mistyped thresholds that broke the Schedule-Y-is-2x-Schedule-X identity below. SCHEDULE Y (married filing jointly / qualifying surviving spouse, 2025, FTB): thresholds are EXACTLY 2× Schedule X's — $0/$22,158/$52,528/$82,904/$115,084/$145,448/$742,958 at 1/2/4/6/8/9.3/10.3/11.3/12.3% — encoded PER-BRACKET (marginal accumulation over the doubled thresholds) rather than by doubling Schedule X's own printed (already-rounded) fixed-dollar constants, because independently rounding at each schedule drifts by pennies in the upper brackets; income above $742,958 REFUSES here on the same basis as X/Z (10.3%+ tiers not yet encoded)."
        + " CALIFORNIA TAX TABLE CONVENTION (2025 FTB 540 booklet, 'California Tax Table', pp.68-75; DEFAULT method for CA taxable income under $100,000, per Form 540/540NR line 19 instructions: 'Read down the column labeled \"If Your Taxable Income Is...\" to find the range that includes your taxable income... Read across the columns labeled \"The Tax For Filing Status\"...'): rows are $1-$50 as a SPECIAL FIRST ROW (tax $0 for every filing status), then $100-WIDE brackets thereafter (51-150, 151-250, ..., 99,951-100,000 — the last row is only $50 wide because the table truncates exactly at $100,000). Table tax = apply the Schedule X/Y/Z marginal formula above at the bracket's MIDPOINT, rounded to the nearest dollar (the SAME midpoint-of-bracket convention already used for the VA and NY tax tables — decisively confirmed for CA too, not merely assumed). Verified 9-for-9 exact against three incomes × three filing-status columns (FTB 2025 tax table + rate schedules, web-verified July 2026): row 40,051-40,150 (mid $40,100.50) → Single $968 / MFJ $580 / HOH $580; row 70,051-70,150 (mid $70,100.50) → Single $2,992 / MFJ $1,532 / HOH $1,579; row 95,051-95,150 (mid $95,100.50) → Single $5,283 / MFJ $2,776 / HOH $3,305. The truncated last row (99,951-100,000) uses its OWN true midpoint $99,975.50 (not the phantom $100,000.50 the general $100-bracket formula would otherwise produce) — verified: Single at that row = $5,736. CA taxable income of $100,000 OR ABOVE uses the RATE SCHEDULE directly (unrounded to the cent, per the schedule's own marginal math) — the table stops at exactly $100,000. useFormulaMethod=true bypasses the table entirely and uses the raw rate schedule at every income level (matches the pre-v5 default behavior)."
        + " Related 2025 parameters (FTB, web-verified July 2026): standard deduction $5,706 single/MFS, $11,412 MFJ/HOH/QSS; personal exemption CREDIT $153; dependent exemption credit $475. EXEMPTION CREDIT PHASEOUT (R&TC § 17054(a), (b); 2025 FTB Schedule CA/540 instructions): credits (personal + dependent, but NOT senior) phase out $6 for each $2,500 (or fraction thereof — the quotient is ROUNDED UP) of federal AGI over $252,203 single/MFS ($1,250 divisor increments instead of $2,500 for MFS — i.e. the SAME $6 reduction per HALF the increment), $504,411 MFJ/QSS, $378,310 HOH; fully phased out credits are not reduced below $0. [Input: California taxable income (Form 540 line 19). SCHEDULE CA (2025 instructions, line 7): California EXCLUDES unemployment compensation (and CA PFL benefits) from taxable income — subtract it from federal AGI when composing CA AGI. SCHEDULE CA (2025 instructions, line 6, column B): California ALSO EXCLUDES social security benefits — the federally-taxable amount (the § 86 includible amount, us.federal.taxable_social_security) is likewise subtracted from federal AGI when composing CA AGI. CalEITC → us.ca.caleitc; Young Child Tax Credit → us.ca.yctc; renter's credit → us.ca.renters_credit; CDCC → us.ca.cdcc; misc. parameters (use tax, SDI) → us.ca.parameters.]",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      standardDeductionSingleMfs: { value: "570600", type: "money" }, // $5,706
      standardDeductionJointHohQss: { value: "1141200", type: "money" }, // $11,412
      personalExemptionCredit: { value: "15300", type: "money" }, // $153
      dependentExemptionCredit: { value: "47500", type: "money" }, // $475
      exemptionPhaseoutStep: { value: "600", type: "money" }, // $6 reduction
      exemptionPhaseoutIncrementSingleMfs: { value: "125000", type: "money" }, // $1,250 (MFS uses this half-increment)
      exemptionPhaseoutIncrementOther: { value: "250000", type: "money" }, // $2,500
      exemptionPhaseoutThresholdSingleMfs: { value: "25220300", type: "money" }, // $252,203
      exemptionPhaseoutThresholdMfj: { value: "50441100", type: "money" }, // $504,411
      exemptionPhaseoutThresholdHoh: { value: "37831000", type: "money" }, // $378,310
      tableThreshold: { value: "10000000", type: "money" }, // $100,000 — table below, schedule at/above
      tableFirstRowCeiling: { value: "5000", type: "money" }, // $50 — special first row, tax $0
      tableLastRowFloor: { value: "9995100", type: "money" }, // $99,951 — start of the truncated last row
      tableLastRowMidpoint: { value: "9997550", type: "money" }, // $99,975.50 — the truncated row's own true midpoint
    },
    formula: (() => {
      // The Schedule X/Y/Z marginal computation, parameterized on `base` so it
      // can be applied either to actual taxable income (>= $100,000, or
      // useFormulaMethod) or to a Tax Table bracket's midpoint (< $100,000,
      // the default — FTB 2025 tax table convention, same shape as VA/NY).
      const scheduleFor = (base: Expr): Expr => ({
        kind: "if",
        cond: { kind: "or", args: [isStatus("mfj"), isStatus("qss")] },
        then: {
          kind: "if",
          cond: {
            kind: "cmp",
            op: "gt",
            left: base,
            right: money("74295800"), // $742,958 — Schedule Y's 9.3% band ends here
          },
          then: {
            kind: "unsupported",
            reason:
              "CA taxable income above $742,958 (Schedule Y) reaches the 10.3%+ tiers and the 1% MHSA surcharge, not yet encoded from the FTB schedule — compute yourself and disclose",
          },
          else: {
            // Schedule Y: MFJ & QSS (2025) — thresholds exactly 2x Schedule X, encoded per-bracket
            kind: "brackets",
            base: { kind: "max0", arg: base },
            table: [
              { threshold: "0", rate: { num: "1", den: "100" } },
              { threshold: "2215800", rate: { num: "2", den: "100" } },
              { threshold: "5252800", rate: { num: "4", den: "100" } },
              { threshold: "8290400", rate: { num: "6", den: "100" } },
              { threshold: "11508400", rate: { num: "8", den: "100" } },
              { threshold: "14544800", rate: { num: "93", den: "1000" } },
            ],
          },
        },
        else: {
          kind: "if",
          cond: {
            kind: "cmp",
            op: "gt",
            left: base,
            right: money("50520800"), // $505,208 — encoded bands end here
          },
          then: {
            kind: "unsupported",
            reason:
              "CA taxable income above $505,208 reaches the 10.3%+ tiers and the 1% MHSA surcharge, not yet encoded from the FTB schedule — compute yourself and disclose",
          },
          else: {
            kind: "if",
            cond: isStatus("hoh"),
            then: {
              kind: "brackets",
              base: { kind: "max0", arg: base },
              table: [
                { threshold: "0", rate: { num: "1", den: "100" } },
                { threshold: "2217300", rate: { num: "2", den: "100" } },
                { threshold: "5253000", rate: { num: "4", den: "100" } },
                { threshold: "6771600", rate: { num: "6", den: "100" } },
                { threshold: "8380500", rate: { num: "8", den: "100" } },
                { threshold: "9899000", rate: { num: "93", den: "1000" } },
              ],
            },
            else: {
              // Schedule X: single & MFS (2025). Thresholds corrected in v5 to
              // $11,079/$26,264/$41,452/$57,542/$72,724 (2025 FTB Schedule X,
              // web-verified July 2026; these are EXACTLY half of Schedule
              // Y's already-correct $22,158/$52,528/$82,904/$115,084/$145,448
              // — the pre-v5 table used stale/mistyped thresholds that were
              // NOT half of Y's, silently breaking the "Y = 2x X" identity
              // this rule's own citation has always claimed).
              kind: "brackets",
              base: { kind: "max0", arg: base },
              table: [
                { threshold: "0", rate: { num: "1", den: "100" } },
                { threshold: "1107900", rate: { num: "2", den: "100" } },
                { threshold: "2626400", rate: { num: "4", den: "100" } },
                { threshold: "4145200", rate: { num: "6", den: "100" } },
                { threshold: "5754200", rate: { num: "8", den: "100" } },
                { threshold: "7272400", rate: { num: "93", den: "1000" } },
              ],
            },
          },
        },
      });

      const base: Expr = { kind: "max0", arg: fact("stateTaxableIncome") };

      // Tax Table midpoint: $1-$50 special row aside, brackets are $100-wide
      // starting at $51 (51-150, 151-250, ...); midpoint = lower + $49.50.
      // The truncated last row (99,951-100,000, only $50 wide) uses its own
      // true midpoint $99,975.50 instead of the general formula's result.
      const lower: Expr = {
        kind: "add",
        args: [
          money("5100"), // $51
          {
            kind: "mulInt",
            base: money("10000"), // $100
            count: {
              kind: "stepUnits",
              value: { kind: "sub", left: base, right: money("5100") },
              unitCents: "10000",
              mode: "floor",
            },
          },
        ],
      };
      const generalMidpoint: Expr = { kind: "add", args: [lower, money("4950")] }; // + $49.50
      const midpoint: Expr = {
        kind: "if",
        cond: {
          kind: "cmp",
          op: "gt",
          left: base,
          right: { kind: "param", name: "tableLastRowFloor" }, // > $99,951
        },
        then: { kind: "param", name: "tableLastRowMidpoint" }, // $99,975.50
        else: generalMidpoint,
      };

      return {
        kind: "if",
        cond: {
          kind: "or",
          args: [
            fact("useFormulaMethod"),
            {
              kind: "cmp",
              op: "ge",
              left: base,
              right: { kind: "param", name: "tableThreshold" }, // >= $100,000
            },
          ],
        },
        then: scheduleFor(base),
        else: {
          kind: "if",
          cond: {
            kind: "cmp",
            op: "le",
            left: base,
            right: { kind: "param", name: "tableFirstRowCeiling" }, // <= $50
          },
          then: money("0"),
          else: { kind: "roundToDollar", value: scheduleFor(midpoint), mode: "half-up" },
        },
      } as Expr;
    })(),
  },
  {
    id: "us.ca.caleitc",
    version: 5, // v3's phase-in kept the floor-aligned midpoint, misplacing $50-multiple incomes into the next row; v4 aligns the phase-in to the table's true upper-bound rows (mid = ceil(x/50)*50 - 24.50), matching the post-peak segments; v5 recalibrates the 0-kid GENTLE phase-out anchor from an unverified construction ($216 @ mid $9,475.50, rate -43/4680, "unverified-but-consistent") to a printed-table-confirmed anchor ($183 @ mid $12,975.50 = bracket 12,951-13,000, rate -9/1000 = -0.9%/$1) — the prior anchor produced $184 for that row, one dollar off the 2025 FTB 3514 booklet's printed credit
    jurisdiction: "us.ca",
    title: "California Earned Income Tax Credit (R&TC § 17052, FTB 3514) — 2025, full range",
    citation: {
      source: "R&TC § 17052; 2025 FTB 3514 booklet (EITC table + General Information)",
      section: "R&TC § 17052",
      url: "https://www.ftb.ca.gov/forms/2025/2025-3514-booklet.pdf",
      excerpt:
        "2025 CalEITC: income ceiling $32,900 (all family sizes, both earned income AND federal AGI must be under $32,901 or the credit is $0); maximum credit $302 (0 kids, peak bracket $4,651-$4,700) / $2,016 (1 kid, peak $6,951-$7,000) / $3,339 (2 kids, peak $9,801-$9,850) / $3,756 (3+ kids, same $9,801-$9,850 peak). DECODED STRUCTURE (July 2026 web-verification: the printed table was parsed in full, all 658 $50-wide brackets from $1-$32,900, `pdftotext -layout`, and formula-fit): no plateau — every column peaks at a single $50 bracket and immediately begins declining. The decline is NOT one straight line: it has a KINK where the phase-out slope changes from steep to gentle, at 0 kids $5,450/$5,451, 1 kid $11,800/$11,801, 2 kids $17,800/$17,801, 3+ kids $18,000/$18,001 — confirmed by row-to-row deltas dropping from roughly $17-19 per $50 bracket (steep) to roughly $2-3 per bracket (gentle) exactly at each boundary. THIS RULE NOW COMPUTES ALL THREE SEGMENTS: (1) PHASE-IN (unchanged from v1): credit = round(bracket-midpoint × combined rate), combined rate = federal § 32(b) phase-in rate × the 85% § 17052(c) adjustment factor (7.65/34/40/45% × 85% = 6.5025/28.90/34.00/38.25%), using the floor-aligned $50-bracket midpoint — verified against the printed row 2,201-2,250 → 851 for 3+ children (2,225.50 × 45% × 85% = 851.25 → 851). (2) STEEP PHASE-OUT (peak to kink): the printed table declines at (within rounding) the SAME rate magnitude as the phase-in line (a symmetric V through the peak) — credit = round(anchor value − combined phase-in rate × (bracket-midpoint − anchor-bracket-midpoint)), using the TRUE (upper-bound-aligned) $50-bracket midpoint. For 1/2/3+ kids the line is anchored to an actual printed table row (1 kid: bracket 9,451-9,500, $1,306; 2 kids and 3+ kids: bracket 9,951-10,000, $3,288/$3,699) rather than the theoretical peak itself — the peak POINT sits fractionally off this line for 1 kid specifically (a peak-anchored construction understates by roughly $13 there), so a real table row is used everywhere data exists. Verified EXACT against every printed row in this zone for 1/2/3+ kids (e.g. 2 kids: $10,000 → 3,288 exact, $16,500 → 1,078 exact, $17,500 → 738 exact; 3+ kids: $16,500 → 1,213 exact; 1 kid: $9,500 → 1,306 exact, $11,000 → 873 exact). (3) GENTLE PHASE-OUT (kink to ceiling): a SEPARATE, shallower line anchored to a printed table row just past the kink, at the independently-fit rate (0 kids = −0.9%/$1 i.e. −9/1000 per $1 of midpoint, CONFIRMED against the printed 2025 FTB 3514 booklet row $12,951-$13,000 → $183 exact, web-verified July 2026 — corrects a prior unverified anchor that produced $184 for that row; 1 kid ≈ −3.01%/$1 i.e. −541/18000, 2 kids ≈ −4.19%/$1 i.e. −25/596, 3+ kids ≈ −4.26%/$1 i.e. −613/14400) — verified within ≤$1 across every printed row from the kink to $32,900 (e.g. 0 kids: $17,000 → 147 exact; 2 kids: $18,000 → 626 exact, $25,000 → 333 vs. computed 332, $30,000 → 123 vs. computed 123). Max residual across all 658 rows, all four columns: ≤ $2 pre-rounding (a single pre-existing phase-in-region anomaly just below the 2/3+-kid peak, at $9,500, runs to $17-19 — inherited from the v1 floor-aligned phase-in formula, unchanged here per the phase-in region's own design, and confined to that one boundary row). The 0-kid STEEP segment (peak to $5,450) has no printed table data in the range this session could source ($9,500+) to verify against; it uses the peak-anchor construction (disclosed as unverified-but-consistent with the confirmed symmetric-V structure elsewhere) — only the GENTLE segment's 0-kid anchor is table-confirmed as of v5. Earned income here = wages (line 1z, INCLUDING any taxable dependent-care benefits on line 1e) + max(0, SE profit − ½SE tax) − Schedule C loss, same composition as the federal § 32(c)(2) input. CAUTION: when a spouse's own Schedule C loss makes that spouse's Form 2441 earned income zero or negative, the § 129 exclusion for W-2 box 10 dependent care benefits is $0 — the FULL box-10 amount becomes taxable wages (line 1e), raising both federal AGI and this credit's earned income (federal earned 10,500 + 6,000 fully-taxable DCB → CA earned 16,500 → credit 1,078 from the printed row). Kids = qualifyingChildren + eitcAdditionalQualifyingChildren.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      ceiling: { value: "3290000", type: "money" }, // $32,900
      max0kids: { value: "30200", type: "money" }, // $302 (also the steep segment's peak anchor)
      max1kid: { value: "201600", type: "money" }, // $2,016
      max2kids: { value: "333900", type: "money" }, // $3,339
      max3kids: { value: "375600", type: "money" }, // $3,756
      adjustmentFactorPct: { value: "85", type: "int" },
      peakUpper0kids: { value: "470000", type: "money" }, // $4,700 (last dollar of the peak $50-bracket)
      peakUpper1kid: { value: "700000", type: "money" }, // $7,000
      peakUpper2kids: { value: "985000", type: "money" }, // $9,850
      peakUpper3kids: { value: "985000", type: "money" }, // $9,850 (same bracket as 2 kids)
      peakMid0kids: { value: "467550", type: "money" }, // $4,675.50 true midpoint of $4,651-$4,700
      peakMid1kid: { value: "697550", type: "money" }, // $6,975.50 true midpoint of $6,951-$7,000
      peakMid2kids3kids: { value: "982550", type: "money" }, // $9,825.50 true midpoint of $9,801-$9,850
      // STEEP segment anchors: a printed table row's (true bracket midpoint,
      // credit) pair, NOT the theoretical peak — for 1/2/3+ kids the peak
      // point itself sits fractionally off the steep line's true regression
      // (verified: the peak-anchor construction is off by ~$13 for 1 kid),
      // so the steep line is anchored to real table data instead. 0 kids has
      // no printed steep-zone data in the sourced range and keeps the
      // peak-anchor (peakMid0kids/max0kids) construction, disclosed above.
      steepAnchorMid1kid: { value: "947550", type: "money" }, // bracket 9,451-9,500, mid $9,475.50
      steepAnchorValue1kid: { value: "130600", type: "money" }, // $1,306 printed
      steepAnchorMid2kids: { value: "997550", type: "money" }, // bracket 9,951-10,000, mid $9,975.50
      steepAnchorValue2kids: { value: "328800", type: "money" }, // $3,288 printed
      steepAnchorMid3kids: { value: "997550", type: "money" }, // bracket 9,951-10,000, mid $9,975.50
      steepAnchorValue3kids: { value: "369900", type: "money" }, // $3,699 printed
      kinkUpper0kids: { value: "545000", type: "money" }, // $5,450 (last dollar of the last steep bracket)
      kinkUpper1kid: { value: "1180000", type: "money" }, // $11,800
      kinkUpper2kids: { value: "1780000", type: "money" }, // $17,800
      kinkUpper3kids: { value: "1800000", type: "money" }, // $18,000
      // gentle-segment anchor: (true bracket midpoint, printed credit) of one
      // printed row just past the kink, used to continue the gentle line
      gentleAnchorMid0kids: { value: "1297550", type: "money" }, // bracket 12,951-13,000, mid $12,975.50 (2025 FTB 3514 booklet, confirmed printed row)
      gentleAnchorValue0kids: { value: "18300", type: "money" }, // $183 printed (confirmed row 12,951-13,000)
      gentleAnchorMid1kid: { value: "1197550", type: "money" }, // bracket 11,951-12,000, mid $11,975.50
      gentleAnchorValue1kid: { value: "62900", type: "money" }, // $629 printed
      gentleAnchorMid2kids: { value: "1797550", type: "money" }, // bracket 17,951-18,000, mid $17,975.50
      gentleAnchorValue2kids: { value: "62600", type: "money" }, // $626 printed
      gentleAnchorMid3kids: { value: "1847550", type: "money" }, // bracket 18,451-18,500, mid $18,475.50
      gentleAnchorValue3kids: { value: "61400", type: "money" }, // $614 printed
    },
    formula: (() => {
      const earned: Expr = {
        kind: "max0",
        arg: {
          kind: "sub",
          left: {
            kind: "add",
            args: [
              fact("wages"),
              {
                kind: "max0",
                arg: {
                  kind: "sub",
                  left: fact("selfEmploymentNetProfit"),
                  right: { kind: "rule", ruleId: "us.federal.se_tax_half_deduction" },
                },
              },
            ],
          },
          right: fact("scheduleCNetLoss"),
        },
      };
      // post-peak midpoint: TRUE $50-bracket midpoint, aligned to the printed
      // table's own "at least X - but not over Y" rows (Y a multiple of $50,
      // X = Y-49) — ceil(earned/$50)*$50 - $24.50. Needed because the peak and
      // kink boundaries in this rule are dollar-exact printed cutoffs.
      const midCeil: Expr = {
        kind: "sub",
        left: {
          kind: "mulInt",
          base: money("5000"),
          count: { kind: "stepUnits", value: earned, unitCents: "5000", mode: "ceil" },
        },
        right: money("2450"), // $24.50
      };
      const kids: Expr = {
        kind: "add",
        args: [fact("qualifyingChildren"), fact("eitcAdditionalQualifyingChildren")],
      };
      const kidsEq = (n: string): Expr => ({
        kind: "cmp",
        op: "eq",
        left: kids,
        right: { kind: "int", value: n },
      });
      // phase-in: combined rate = federal phase-in × 85% adjustment factor
      const tentative = (num: string, den: string): Expr => ({
        kind: "roundToDollar",
        value: {
          kind: "mulRate",
          // v4: the FTB table's rows are upper-bound-aligned everywhere —
          // "at least X, but not over Y" with Y a multiple of $50 — so the
          // phase-in uses the same TRUE midpoint as the post-peak segments
          // (the v2/v3 floor-aligned midpoint misplaced $50-multiple incomes
          // into the NEXT row: earned 5,500 belongs to 5,451-5,500, mid
          // 5,475.50, not 5,501-5,550). max0 guards the earned=0 corner.
          base: { kind: "max0", arg: midCeil },
          rate: { num, den },
          round: "half-up",
        },
        mode: "half-up",
      });
      // steep/gentle: anchorValue + rate × (midCeil - anchorMid), single
      // whole-dollar rounding at the end
      const linear = (anchorMid: Expr, anchorValue: Expr, num: string, den: string): Expr => ({
        kind: "roundToDollar",
        value: {
          kind: "add",
          args: [
            anchorValue,
            {
              kind: "mulRate",
              base: { kind: "sub", left: midCeil, right: anchorMid },
              rate: { num, den },
              round: "half-up",
            },
          ],
        },
        mode: "half-up",
      });
      const param = (name: string): Expr => ({ kind: "param", name });
      const segment = (
        peakUpperParam: string,
        kinkUpperParam: string,
        phaseIn: Expr,
        steep: Expr,
        gentle: Expr,
      ): Expr => ({
        kind: "if",
        cond: { kind: "cmp", op: "le", left: earned, right: param(peakUpperParam) },
        then: phaseIn,
        else: {
          kind: "if",
          cond: { kind: "cmp", op: "le", left: earned, right: param(kinkUpperParam) },
          then: steep,
          else: gentle,
        },
      });
      const col0 = segment(
        "peakUpper0kids",
        "kinkUpper0kids",
        tentative("65025", "1000000"), // 7.65% × 85%
        linear(param("peakMid0kids"), param("max0kids"), "-2601", "40000"), // mirror of the phase-in rate
        linear(param("gentleAnchorMid0kids"), param("gentleAnchorValue0kids"), "-9", "1000"),
      );
      const col1 = segment(
        "peakUpper1kid",
        "kinkUpper1kid",
        tentative("2890", "10000"), // 34% × 85%
        linear(param("steepAnchorMid1kid"), param("steepAnchorValue1kid"), "-289", "1000"),
        linear(param("gentleAnchorMid1kid"), param("gentleAnchorValue1kid"), "-541", "18000"),
      );
      const col2 = segment(
        "peakUpper2kids",
        "kinkUpper2kids",
        tentative("3400", "10000"), // 40% × 85%
        linear(param("steepAnchorMid2kids"), param("steepAnchorValue2kids"), "-17", "50"),
        linear(param("gentleAnchorMid2kids"), param("gentleAnchorValue2kids"), "-25", "596"),
      );
      const col3 = segment(
        "peakUpper3kids",
        "kinkUpper3kids",
        tentative("3825", "10000"), // 45% × 85%
        linear(param("steepAnchorMid3kids"), param("steepAnchorValue3kids"), "-153", "400"),
        linear(param("gentleAnchorMid3kids"), param("gentleAnchorValue3kids"), "-613", "14400"),
      );
      return {
        kind: "if",
        // BOTH earned income AND federal AGI must be under the ceiling
        // (R&TC § 17052 / FTB 3514: "Both your earned income and federal AGI
        // must be less than $32,901") — either at/over the ceiling → $0
        cond: {
          kind: "or",
          args: [
            {
              kind: "cmp",
              op: "ge",
              left: earned,
              right: { kind: "param", name: "ceiling" },
            },
            {
              kind: "cmp",
              op: "ge",
              left: ruleRef("us.federal.agi"),
              right: { kind: "param", name: "ceiling" },
            },
          ],
        },
        then: money("0"),
        else: {
          kind: "if",
          cond: kidsEq("0"),
          then: col0,
          else: {
            kind: "if",
            cond: kidsEq("1"),
            then: col1,
            else: {
              kind: "if",
              cond: kidsEq("2"),
              then: col2,
              else: col3,
            },
          },
        },
      } as Expr;
    })(),
  },
  {
    id: "us.ca.yctc",
    version: 1,
    jurisdiction: "us.ca",
    title: "California Young Child Tax Credit (R&TC § 17052.1, FTB 3514) — 2025",
    citation: {
      source: "R&TC § 17052.1; 2025 FTB 3514 booklet, General Information",
      section: "R&TC § 17052.1",
      url: "https://www.ftb.ca.gov/forms/2025/2025-3514-booklet.pdf",
      excerpt:
        "2025 YCTC (verbatim from the FTB 3514 booklet): 'the maximum amount of credit allowable for a qualified taxpayer is $1,189 and the credit amount phases out as earned income exceeds the threshold amount of $27,425, and completely phases out at $32,901.' Requires CalEITC eligibility and a qualifying child UNDER SIX at year end (hasChildUnderSix). This rule returns the full $1,189 at or below the $27,425 threshold and $0 at or above $32,901; the phase-out band between them refuses (the per-$100 reduction schedule is table-published, not formula-published — read FTB 3514 and disclose).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      maxCredit: { value: "118900", type: "money" }, // $1,189
      phaseOutStart: { value: "2742500", type: "money" }, // $27,425
      phaseOutComplete: { value: "3290100", type: "money" }, // $32,901
    },
    formula: (() => {
      const earned: Expr = {
        kind: "max0",
        arg: {
          kind: "sub",
          left: {
            kind: "add",
            args: [
              fact("wages"),
              {
                kind: "max0",
                arg: {
                  kind: "sub",
                  left: fact("selfEmploymentNetProfit"),
                  right: { kind: "rule", ruleId: "us.federal.se_tax_half_deduction" },
                },
              },
            ],
          },
          right: fact("scheduleCNetLoss"),
        },
      };
      return {
        kind: "if",
        cond: { kind: "not", arg: fact("hasChildUnderSix") },
        then: money("0"),
        else: {
          kind: "if",
          cond: { kind: "cmp", op: "ge", left: earned, right: { kind: "param", name: "phaseOutComplete" } },
          then: money("0"),
          else: {
            kind: "if",
            cond: { kind: "cmp", op: "le", left: earned, right: { kind: "param", name: "phaseOutStart" } },
            then: { kind: "param", name: "maxCredit" },
            else: {
              kind: "unsupported",
              reason:
                "YCTC phase-out band ($27,425–$32,901 earned income): the per-increment reduction is table-published, not formula-published — read the 2025 FTB 3514 worksheet and disclose",
            },
          },
        },
      } as Expr;
    })(),
  },
  {
    id: "us.ca.renters_credit",
    version: 1,
    jurisdiction: "us.ca",
    title: "California nonrefundable renter's credit (R&TC § 17053.5, FTB 540)",
    citation: {
      source: "R&TC § 17053.5; 2025 FTB 540 booklet (Nonrefundable Renter's Credit qualification record)",
      section: "R&TC § 17053.5",
      url: "https://www.ftb.ca.gov/forms/2025/2025-540-booklet.pdf",
      excerpt:
        "2025 nonrefundable renter's credit: $60 for single or married/RDP filing separately with AGI $53,994 or less; $120 for married/RDP filing jointly, head of household, or qualifying surviving spouse with AGI $107,987 or less — $0 (no credit) once AGI exceeds the applicable threshold (a CLIFF, not a phase-out). NONREFUNDABLE. Eligibility (attested by caRentedPrincipalResidence): rented property in California as a principal residence for at least half of 2025, was not claimed as a dependent by another taxpayer, and the property was not exempt from California property tax. AB 130 (2025) authorized higher $250/$500 amounts CONTINGENT on a future appropriation that has not been made as of this web-verification (July 2026) — this rule defaults to the base $60/$120 statutory amounts, not the contingent AB 130 figures.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      creditSingleMfs: { value: "6000", type: "money" }, // $60
      creditJointHohQss: { value: "12000", type: "money" }, // $120
      agiCeilingSingleMfs: { value: "5399400", type: "money" }, // $53,994
      agiCeilingJointHohQss: { value: "10798700", type: "money" }, // $107,987
    },
    formula: {
      kind: "if",
      cond: { kind: "not", arg: fact("caRentedPrincipalResidence") },
      then: money("0"),
      else: {
        kind: "if",
        cond: {
          kind: "or",
          args: [isStatus("mfj"), isStatus("hoh"), isStatus("qss")],
        },
        then: {
          kind: "if",
          cond: {
            kind: "cmp",
            op: "le",
            left: ruleRef("us.federal.agi"),
            right: { kind: "param", name: "agiCeilingJointHohQss" },
          },
          then: { kind: "param", name: "creditJointHohQss" },
          else: money("0"),
        },
        else: {
          kind: "if",
          cond: {
            kind: "cmp",
            op: "le",
            left: ruleRef("us.federal.agi"),
            right: { kind: "param", name: "agiCeilingSingleMfs" },
          },
          then: { kind: "param", name: "creditSingleMfs" },
          else: money("0"),
        },
      },
    },
  },
  {
    id: "us.ca.cdcc",
    version: 1,
    jurisdiction: "us.ca",
    title: "California child and dependent care expenses credit (R&TC § 17052.6, FTB 3506) — 2025",
    citation: {
      source: "R&TC § 17052.6; 2025 FTB 3506 (Child and Dependent Care Expenses Credit)",
      section: "R&TC § 17052.6",
      url: "https://www.ftb.ca.gov/forms/2025/2025-3506.pdf",
      excerpt:
        "2025 CA CDCC: a PERCENTAGE of the FEDERAL child and dependent care credit (us.federal.cdcc), keyed to federal AGI: 50% if AGI ≤ $40,000; 43% if AGI is over $40,000 but not over $70,000; 34% if AGI is over $70,000 but not over $100,000; $0 (no credit) if AGI exceeds $100,000 — a CLIFF at each breakpoint, not a smooth phase-down. NONREFUNDABLE. Requires the same earned-income-of-both-spouses gate as the federal credit (both spouses must have earned income on a joint return, per instructions). Parameters-only: the federal CDCC base (us.federal.cdcc) is the oracle target for the underlying credit; this rule documents the CA percentage table — apply the percentage to that result and disclose.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      pctAgiUpTo40k: { value: "50", type: "int" },
      pctAgi40kTo70k: { value: "43", type: "int" },
      pctAgi70kTo100k: { value: "34", type: "int" },
      agiTier1Max: { value: "4000000", type: "money" }, // $40,000
      agiTier2Max: { value: "7000000", type: "money" }, // $70,000
      agiTier3Max: { value: "10000000", type: "money" }, // $100,000
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: California's CDCC is a % of the federal CDCC (us.federal.cdcc) selected by the AGI tier documented in this rule's parameters — evaluate us.federal.cdcc, apply the tier percentage, and disclose",
    },
  },
  {
    id: "us.ca.amt",
    version: 1,
    jurisdiction: "us.ca",
    title: "California alternative minimum tax — Schedule P (540), Part II (2025)",
    citation: {
      source: "R&TC §§ 17062, 17062.1; 2025 FTB Schedule P (540) instructions",
      section: "R&TC § 17062(a)-(e); § 17062.1",
      url: "https://www.ftb.ca.gov/forms/2025/2025-540-p-instructions.html",
      excerpt:
        "THIS RULE TAKES caAmti AS AN INPUT — it applies the exemption/TMT/comparison mechanics only; it does not construct AMTI itself. CONSTRUCTION OF caAmti (disclosed on the fact, repeated here): California individual AMT is FROZEN to IRC §§ 55-59 as they read on January 1, 2015 (R&TC § 17062.1, re-enacted by SB 711 (Stats. 2025, Ch. 231) WITHOUT moving the freeze forward, even though SB 711 rolled CA's general IRC conformity date to January 1, 2025 for other provisions). Starting from CA taxable income (Form 540 line 19), the STANDARD DEDUCTION IS ADDED BACK (R&TC § 17062(c)(1), denying § 56(b)(1)(E)). The ISO exercise spread follows § 56(b)(3) as modified by R&TC § 17062(c)(2) (plus the California Qualified Stock Option addback, R&TC § 17502). There is NO tax-exempt private-activity-bond-interest preference (R&TC § 17062(d) turns off § 57(a)(5)) and NO AMT foreign tax credit (R&TC § 17062(e) turns off § 59(a)). A taxpayer with aggregate trade/business gross receipts under $1,000,000 (a flat threshold, NOT doubled for MFJ) excludes ALL trade/business income, adjustments, and preferences from AMTI (R&TC § 17062(b)(4), the CA small-business AMTI exclusion). 2025 exemption/phase-out amounts (Exemption Worksheet, 2025 FTB Schedule P (540) instructions, web-verified July 2026): exemption $92,749 single/HOH, $123,667 MFJ/QSS, $61,830 MFS; phased out 25 cents per dollar of caAmti over $347,808 single/HOH, $463,745 MFJ/QSS, $231,868 MFS, floored at $0. Rate — 7% (R&TC § 17062(b)(3)(A)(iv)) of caAmti minus the exemption = the tentative minimum tax. AMT (R&TC § 17062(a)) = the excess, if any, of the tentative minimum tax over the regular CA tax (caRegularTax — Schedule P (540) line 25: the Form 540 LINE 31 regular tax BEFORE exemption credits; worked example: TMT 25,484 − line-31 12,038 = AMT 13,446 — passing the after-credits line 48 amount overstates AMT by exactly the exemption credits). MFS AMTI STACKING ADD-BACK: a caAmti above $479,188 for an MFS filer requires adding to AMTI, before this rule's own exemption/phase-out math, the lesser of 25% of the excess over $479,188 or $61,830 (Schedule P (540) 'Line 21' worksheet) — NOT modeled here; this rule REFUSES for MFS above that threshold rather than silently omitting the add-back. Also not modeled: the § 59(j) certain-children-under-24 exemption cap, and Part III credit ordering (e.g. the PTE elective tax credit's below-TMT exception).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      exemptSingleHoh: { value: "9274900", type: "money" }, // $92,749
      exemptMfj: { value: "12366700", type: "money" }, // $123,667
      exemptMfs: { value: "6183000", type: "money" }, // $61,830
      threshSingleHoh: { value: "34780800", type: "money" }, // $347,808
      threshMfj: { value: "46374500", type: "money" }, // $463,745
      threshMfs: { value: "23186800", type: "money" }, // $231,868
      mfsStackingThreshold: { value: "47918800", type: "money" }, // $479,188
    },
    formula: (() => {
      const byStatus = (single: string, joint: string, mfs: string): Expr => ({
        kind: "match",
        on: fact("filingStatus"),
        cases: [
          { when: "single", value: { kind: "param", name: single } },
          { when: "hoh", value: { kind: "param", name: single } },
          { when: "mfj", value: { kind: "param", name: joint } },
          { when: "qss", value: { kind: "param", name: joint } },
          { when: "mfs", value: { kind: "param", name: mfs } },
        ],
      });
      const exemption = byStatus("exemptSingleHoh", "exemptMfj", "exemptMfs");
      const threshold = byStatus("threshSingleHoh", "threshMfj", "threshMfs");
      const exemptionPhased: Expr = {
        kind: "max0",
        arg: {
          kind: "sub",
          left: exemption,
          right: {
            kind: "mulRate",
            base: { kind: "max0", arg: { kind: "sub", left: fact("caAmti"), right: threshold } },
            rate: { num: "25", den: "100" },
            round: "half-up",
          },
        },
      };
      const tmt: Expr = {
        kind: "mulRate",
        base: { kind: "max0", arg: { kind: "sub", left: fact("caAmti"), right: exemptionPhased } },
        rate: { num: "7", den: "100" },
        round: "half-up",
      };
      const amt: Expr = { kind: "max0", arg: { kind: "sub", left: tmt, right: fact("caRegularTax") } };
      return {
        kind: "if",
        cond: {
          kind: "and",
          args: [
            isStatus("mfs"),
            {
              kind: "cmp",
              op: "gt",
              left: fact("caAmti"),
              right: { kind: "param", name: "mfsStackingThreshold" },
            },
          ],
        },
        then: {
          kind: "unsupported",
          reason:
            "MFS caAmti above $479,188 requires the Schedule P (540) Line 21 stacking add-back (the lesser of 25% of the excess over $479,188 or $61,830) applied to caAmti BEFORE this rule's exemption/phase-out math — not modeled; recompute caAmti with that add-back and re-run, or work Schedule P (540) directly",
        },
        else: amt,
      } as Expr;
    })(),
  },
  {
    id: "us.ca.bhst",
    version: 1,
    jurisdiction: "us.ca",
    title: "California Behavioral Health Services Tax (formerly Mental Health Services Tax) — Form 540 line 62 (2025)",
    citation: {
      source: "R&TC § 17043; 2025 FTB Form 540 instructions, \"Line 62 – Behavioral Health Services Tax\"",
      section: "R&TC § 17043",
      url: "https://www.ftb.ca.gov/forms/2025/2025-540-instructions.html",
      excerpt:
        "Flat 1% tax on the portion of CA taxable income (Form 540 line 19) over $1,000,000 (R&TC § 17043(a)) — renamed the 'Behavioral Health Services Tax' by Prop 1 (2024)'s restructuring of the Mental Health Services Act into the Behavioral Health Services Act; same statute, same $1,000,000 threshold, unchanged since operative January 1, 2005. The $1,000,000 threshold is FLAT for every filing status — R&TC § 17043(c) turns off § 17041 filing-status bracket recomputation and § 17045 joint-return combining, but does NOT halve the threshold for MFS. The commonly-repeated '$500,000 MFS' figure belongs to a DIFFERENT rule entirely — the FTB 5805 high-income estimated-tax safe harbor — and must not be applied to this tax. No credits reduce this tax (§ 17043(c)(1) turns off § 17039 generally). Computed directly on Form 540 line 62, not on Schedule P — independent of the AMT computation (us.ca.amt), though both feed the estimated-tax base.",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      threshold: { value: "100000000", type: "money" }, // $1,000,000
    },
    formula: {
      kind: "mulRate",
      base: {
        kind: "max0",
        arg: { kind: "sub", left: fact("stateTaxableIncome"), right: { kind: "param", name: "threshold" } },
      },
      rate: { num: "1", den: "100" },
      round: "half-up",
    },
  },
  {
    id: "us.ca.parameters",
    version: 1,
    jurisdiction: "us.ca",
    title: "California 2025 miscellaneous parameters — use tax table, SDI rate, TY2026 enacted changes",
    citation: {
      source: "Rev. & Tax. Code §§ 6452, 17041; 2025 FTB 540 use tax worksheet; EDD SDI rate notice; SB 951",
      section: "Use Tax Worksheet; SDI rate",
      url: "https://www.ftb.ca.gov/forms/2025/2025-540-booklet.pdf",
      excerpt:
        "USE TAX (2025 FTB 540 use tax lookup table, no-receipts estimate keyed to CA AGI, illustrative low/high rows): under $10,000 → $1 … $150,000–$174,999 → $17, $175,000–$199,999 → $19; above $199,999, multiply CA AGI by 0.010% and round to the nearest whole dollar. SDI (State Disability Insurance, EDD, SB 951): 2025 rate is 1.2% of ALL wages with NO taxable wage cap (SB 951 removed the cap starting 2024) — the pre-2024 'excess SDI' credit line no longer applies (no wage base is ever exceeded, so no excess withholding can occur). TY2026 ENACTED CHANGES (not encoded this pass — informational only): SDI rate rises to 1.3% for 2026; the 2026 CPI inflation adjustment factor is 2.971% (exact 2026 dollar brackets for Schedules X/Y/Z and the standard deduction/exemption credits were not yet confirmed from FTB as of this July 2026 web-verification — do not extrapolate them).",
    },
    effectiveFrom: "2025-01-01",
    effectiveTo: "2026-01-01",
    output: { type: "money" },
    parameters: {
      sdiRatePct: { value: "12", type: "int" }, // 1.2% (×10 to keep as int; see sdiRateDen)
      sdiRateDen: { value: "1000", type: "int" },
    },
    formula: {
      kind: "unsupported",
      reason:
        "parameters-only rule: California use-tax lookup table and SDI rate are documented in this rule's citation for lookup_tax_parameter — no single oracle formula (use tax is agent-composed from the FTB table; SDI is withheld, not computed on the return)",
    },
  },
];
