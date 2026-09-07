/**
 * 2025 Arkansas Form AR1000F line composer (full-year resident; line numbers
 * per the printed form). The Regular Income Tax Table tax, the Low Income Tax
 * Table lookup, the standard deduction, AR3 itemized deductions, the personal
 * tax credits, the additional tax credit for qualified individuals, the AR2441
 * child care credit, the $6,000 retirement exclusion, and the AR1000D capital
 * gain computation are oracle targets. Composed here per the printed form: the
 * income lines 8-25 (with Filing Status 4's two columns), the status 2 vs
 * status 4 comparison, the low-income-table election (including forgoing the
 * retirement/military exclusions), the standard-vs-itemized choice and the
 * status-4 proration, the AR1000TC credits, and the lines 30-52C tax, payment,
 * refund, and balance chain.
 */
import { c, rd, max0, min2, fmtD, type Cents } from "./money.js";
import type { StateReturnInput, StateTaxEvaluator } from "./types.js";

interface Build {
  lines: Record<string, string>;
  notes: string[];
  netTax: Cents;
  tax: Cents;
  status4: boolean;
  low: boolean;
}

type Attempt = Build | { ineligible: string } | { invalid: string };

const D = (x: unknown): Cents => rd(c(x));
const ITEMIZED_KEYS = ["arMedicalExpenses", "arTaxesPaid", "arInterestPaid", "arContributions", "arCasualtyLosses", "arTuitionDeduction", "arMiscExpenses", "arOtherMiscDeductions"] as const;

export function composeAR(input: StateReturnInput, evalStateTax: StateTaxEvaluator, notes: string[]): Record<string, string> {
  const fs = input.filingStatus as string | undefined;
  if (!fs) throw new Error("filingStatus is required for the Arkansas AR1000F composer");
  const married = fs === "mfj";
  const spouseGiven = typeof input.arSpouseIncome === "number";
  const deps = (input.dependents as number) ?? 0;
  const arStatus = { single: "1", mfj: "2", hoh: "3", mfs: "5", qss: "6" }[fs] ?? "1";
  if (!married && (input.arStatus4 === true || spouseGiven)) notes.push("AR filing status: arStatus4 / arSpouseIncome apply only to a married couple filing on ONE Arkansas return (federal MFJ → status 2 or 4) — ignored");
  if (fs === "qss") notes.push("AR filing status 6 (Surviving Spouse with dependent child): spouse died in 2023 or 2024, not remarried, dependent child, over half the cost of the home — same rate table as everyone, the HOH/surviving-spouse personal credit and Low Income Tax Table columns, a single $6,000 retirement exclusion");

  // ---- one full return for a given status / table election ----
  const compute = (status4: boolean, low: boolean): Attempt => {
    const n: string[] = [];
    const useExclusions = !low;
    const pTax = D(input.arPensionTaxablePrimary);
    const sTax = D(input.arPensionTaxableSpouse);
    const milP = D(input.arMilitaryRetirementPrimary);
    const milS = D(input.arMilitaryRetirementSpouse);
    const milPay = D(input.arMilitaryPay);
    const exclP = useExclusions && pTax > 0n ? rd(evalStateTax("us.ar.retirement_exclusion", 0n, { arPensionTaxable: pTax, arMilitaryRetirement: milP })) : 0n;
    const exclS = useExclusions && married && sTax > 0n ? rd(evalStateTax("us.ar.retirement_exclusion", 0n, { arPensionTaxable: sTax, arMilitaryRetirement: milS })) : 0n;
    if (!married && sTax > 0n) n.push("AR line 18B: arPensionTaxableSpouse ignored — only a married couple on one return has a spouse line; a surviving spouse (status 6) 'is limited to a single $6,000 exemption'");
    const l18A = pTax - exclP;
    const l18B = married ? sTax - exclS : 0n;
    if (exclP > 0n) n.push(`AR line 18A: $6,000 exclusion ${fmtD(exclP)} against ${fmtD(pTax)} of employer pension / qualified IRA${milP > 0n ? ` (reduced by the ${fmtD(milP)} military retirement exemption — § 26-51-307(f))` : ""}; premature IRA withdrawals belong on line 16 with no exclusion`);
    if (exclS > 0n) n.push(`AR line 18B: spouse's $6,000 exclusion ${fmtD(exclS)} against ${fmtD(sTax)}${milS > 0n ? ` (reduced by ${fmtD(milS)} military retirement)` : ""}`);

    const l8 = D(input.wages);
    const l10 = D(input.arInterest);
    const l11 = D(input.arDividends);
    const l12 = D(input.arAlimonyReceived);
    const l13 = D(input.arBusinessIncome);
    const l15 = D(input.arOtherGains);
    const l16 = D(input.arIraTaxable);
    const l19 = D(input.arRentsRoyalties);
    const l20 = D(input.arFarmIncome);
    const l21 = D(input.unemploymentCompensation);
    const l22 = D(input.arOtherIncome);
    const ltP = c(input.arLongTermGain);
    const stP = c(input.arShortTermGain);
    const ltS = married ? c(input.arSpouseLongTermGain) : 0n;
    const stS = married ? c(input.arSpouseShortTermGain) : 0n;
    if (!married && c(input.arSpouseLongTermGain) + c(input.arSpouseShortTermGain) !== 0n) n.push("AR line 14: arSpouseLongTermGain / arSpouseShortTermGain ignored — only a married couple on one return has a spouse column");
    const cg = (lt: Cents, st: Cents, s4: boolean): Cents => (lt !== 0n || st !== 0n ? rd(evalStateTax("us.ar.capital_gains", 0n, { arLongTermGain: lt, arShortTermGain: st, arStatus4: s4 })) : 0n);
    // AR1000D: status 4 runs each spouse's own column (its own $1,500 loss floor); every other status nets the household on one schedule
    const l14A = status4 ? cg(ltP, stP, true) : cg(ltP + ltS, stP + stS, false);
    const l14B = status4 ? cg(ltS, stS, true) : 0n;
    const l14 = l14A + l14B;
    if (l14 !== 0n || ltP + ltS + stP + stS !== 0n) n.push(`AR line 14 (AR1000D): taxable capital gain ${fmtD(l14)} from long-term ${fmtD(rd(ltP + ltS))} and short-term ${fmtD(rd(stP + stS))} — 50% of the net long-term gain is exempt; a net loss is limited to $3,000 ($1,500 per taxpayer for status 4 or 5)${status4 ? `; status 4 runs AR1000D per column (primary ${fmtD(l14A)}, spouse ${fmtD(l14B)} from arSpouseLongTermGain / arSpouseShortTermGain)` : ""}`);
    // the exempt half of the gain (and the excess over $10M) is still "income from all sources" for the Low Income Tax Table test
    const excludedGain = max0(max0(ltP + ltS + stP + stS) - l14);
    const milTaxA = low ? milP + milPay : 0n;
    const milTaxB = low ? milS : 0n;
    if (!low && milPay + milP + milS > 0n) n.push(`AR lines 9/17: active-duty military pay ${fmtD(milPay)} and military retirement ${fmtD(milP + milS)} are exempt — informational boxes only, not in column A`);
    const other = l8 + l10 + l11 + l12 + l13 + l15 + l16 + l19 + l20 + l21 + l22;
    const spouseShare = status4 ? D(input.arSpouseIncome) : 0n;
    let a23: Cents;
    let b23: Cents;
    if (status4) {
      a23 = other - spouseShare + l14A + l18A + milTaxA;
      b23 = spouseShare + l14B + l18B + milTaxB;
      if (a23 < 0n || b23 < 0n) return { invalid: `column ${a23 < 0n ? "A" : "B"} total income is negative (${fmtD(a23 < 0n ? a23 : b23)}) — 'IF ONE SPOUSE HAD A TOTAL NEGATIVE INCOME, YOU MUST FILE MARRIED FILING JOINTLY'` };
    } else {
      a23 = other + l14 + l18A + l18B + milTaxA + milTaxB;
      b23 = 0n;
    }
    const adjTotal = D(input.arAdjustments);
    const b24 = status4 ? D(input.arSpouseAdjustments) : 0n;
    const a24 = adjTotal - b24;
    if (adjTotal > 0n) n.push(`AR line 24 (AR1000ADJ): adjustments ${fmtD(adjTotal)} transcribed (IRA, HSA, student loan interest ≤ $2,500, tuition savings ≤ $5,000, self-employed health insurance, alimony paid, ABLE ≤ $5,000, …)${status4 ? ` — ${fmtD(b24)} in the spouse's column B` : ""}`);
    const a25 = a23 - a24;
    const b25 = b23 - b24;
    const agiAll = a25 + b25;

    // ---- Low Income Tax Table eligibility (booklet p. 24 qualifications 1-5) ----
    if (low) {
      if (status4) return { ineligible: "status 4 — 'Married couples must file a joint return (Filing Status 2) to qualify'" };
      if (fs === "mfs") return { ineligible: "status 5 (separate returns) — only statuses 1, 2, 3, and 6 have a Low Income Tax Table" };
      if (input.arItemize === true) return { ineligible: "arItemize — 'If you itemize your deductions, you must use the Regular Income Tax Table'" };
      const limit = fs === "single" ? 1750000n : fs === "hoh" || fs === "qss" ? (deps >= 2 ? 2900000n : 2530000n) : deps >= 2 ? 3610000n : 2900000n;
      const exempt = D(input.arExemptIncome);
      const totalAll = a23 + exempt + excludedGain;
      if (totalAll > limit) return { ineligible: `total income from all sources ${fmtD(totalAll)} (line 23 ${fmtD(a23)} + nontaxable ${fmtD(exempt)}${excludedGain > 0n ? ` + excluded capital gain ${fmtD(excludedGain)}` : ""}${milTaxA + milTaxB + pTax + sTax > 0n ? ", exclusions forgone" : ""}) exceeds the ${fmtD(limit)} table limit` };
      if (a25 > limit) return { ineligible: `AGI ${fmtD(a25)} exceeds the ${fmtD(limit)} table limit` };
      if (exempt === 0n) n.push("AR line 26: the Low Income Tax Table test uses 'total income from all sources (regardless of whether the income is taxable to Arkansas)' — assumed no Social Security or other nontaxable income (pass arExemptIncome)");
      const forgone = (pTax > 0n ? min2(pTax, 600000n) : 0n) + (married && sTax > 0n ? min2(sTax, 600000n) : 0n) + milP + milS + milPay;
      if (forgone > 0n) n.push(`AR line 26: the retirement / military exclusions (${fmtD(forgone)}) are NOT used on this return — 'You may elect NOT TO USE the exclusion(s) to which you are entitled and use a Low Income Tax Table'`);
    }

    // ---- line 27: table selection and deduction ----
    let a27 = 0n;
    let b27 = 0n;
    let method: string;
    if (low) {
      method = "low income table";
    } else {
      const hasItemized = ITEMIZED_KEYS.some((k) => c(input[k]) > 0n);
      const itemized = hasItemized
        ? rd(
            evalStateTax("us.ar.itemized_deductions", 0n, {
              arMedicalExpenses: c(input.arMedicalExpenses),
              arTaxesPaid: c(input.arTaxesPaid),
              arInterestPaid: c(input.arInterestPaid),
              arContributions: c(input.arContributions),
              arCasualtyLosses: c(input.arCasualtyLosses),
              arTuitionDeduction: c(input.arTuitionDeduction),
              arMiscExpenses: c(input.arMiscExpenses),
              arOtherMiscDeductions: c(input.arOtherMiscDeductions),
              arAgi: agiAll,
            }),
          )
        : 0n;
      const stdA = rd(evalStateTax("us.ar.standard_deduction", 0n, { arStatus4: status4, arAgi: a25 }));
      const stdB = status4 ? rd(evalStateTax("us.ar.standard_deduction", 0n, { arStatus4: true, arAgi: b25 })) : 0n;
      let itemize: boolean;
      if (input.arItemize === true && !hasItemized) {
        itemize = false;
        n.push("AR line 27: arItemize is true but no AR3 amounts were given — the standard deduction is composed (pass the arMedicalExpenses / arTaxesPaid / arInterestPaid / arContributions / … inputs to itemize)");
      } else if (input.arItemize === true) itemize = true;
      else if (input.arItemize === false || !hasItemized) itemize = false;
      else {
        itemize = itemized > stdA + stdB;
        n.push(itemize ? `AR line 27: AR3 itemized deductions ${fmtD(itemized)} beat the ${fmtD(stdA + stdB)} standard deduction (the election is independent of the federal return)` : `AR line 27: standard deduction ${fmtD(stdA + stdB)} kept (AR3 total ${fmtD(itemized)})`);
      }
      if (itemize) {
        method = "itemized";
        if (status4) {
          // AR3 lines 31-35: prorate by each spouse's share of combined AGI, "Round to the nearest whole percent"
          const pct = agiAll > 0n ? (a25 * 200n + agiAll) / (2n * agiAll) : 100n;
          a27 = (itemized * pct + 50n) / 100n;
          b27 = itemized - a27;
          n.push(`AR3 lines 31-35: itemized deductions ${fmtD(itemized)} prorated ${pct}% to the primary (${fmtD(a27)}) and ${fmtD(b27)} to the spouse by AGI share (whole percent)`);
        } else a27 = itemized;
        if (fs === "mfs") n.push("AR line 27 (status 5): both spouses must itemize or both take the standard deduction (§ 26-51-430(a)(2)); prorate the AR3 total between the two returns by AGI share (AR3 lines 31-35)");
      } else {
        method = "standard";
        a27 = stdA;
        b27 = stdB;
        if (fs === "mfs") n.push("AR line 27 (status 5): both spouses must use the same method (§ 26-51-430(a)(2)) — pass arItemize to match the spouse's return");
      }
    }
    const a28 = a25 - a27;
    const b28 = status4 ? b25 - b27 : 0n;

    // ---- lines 29-33: tax ----
    const lowTax = (agi: Cents): Cents => rd(evalStateTax("us.ar.low_income_tax", 0n, { arAgi: agi, arDependents: deps, arStatus4: false }));
    const a29 = low ? lowTax(a25) : rd(evalStateTax("us.ar.income_tax", max0(a28)));
    const b29 = status4 ? rd(evalStateTax("us.ar.income_tax", max0(b28))) : 0n;
    if (a28 < 0n || b28 < 0n) n.push("AR line 28: a negative net taxable income is shown as printed; the tax on it is $0");
    const l30 = a29 + b29;
    const l31 = D(input.arLumpSumTax);
    if (l31 > 0n) n.push(`AR line 31: lump-sum distribution averaging tax ${fmtD(l31)} from AR1000TD (transcribed)`);
    const fed5329 = D(input.arFederalEarlyWithdrawalTax);
    const l32 = rd(fed5329 / 10n);
    if (l32 > 0n) n.push(`AR line 32: ${fmtD(l32)} = 10% of the federal Form 5329 additional tax ${fmtD(fed5329)} on IRA / qualified plan / Coverdell distributions`);
    const l33 = l30 + l31 + l32;

    // ---- lines 34-38: credits ----
    // 65 Special: "Any taxpayer age 65 or over not claiming a retirement income exemption on line 18" — when the low-income
    // path forgoes the exclusion, a 65+ pensioner who could not check the box on the regular path now can
    const age65 = Math.min((input.arAge65Count as number) ?? 0, married ? 2 : 1);
    const pensioners = (pTax > 0n ? 1 : 0) + (married && sTax > 0n ? 1 : 0);
    const special65Extra = low ? Math.min(age65, pensioners) : 0;
    const boxes = ((input.arCreditBoxes as number) ?? 0) + special65Extra;
    if (special65Extra > 0) n.push(`AR line 7A: ${special65Extra} additional '65 Special' box(es) — with the line 18 exclusion forgone for the Low Income Tax Table, the 65-or-over pensioner(s) qualify ($29 each; arAge65Count)`);
    const l34 = rd(evalStateTax("us.ar.personal_tax_credits", 0n, { arCreditBoxes: boxes, arDependents: deps, arStatus4: status4 }));
    let childCare = 0n;
    const expenses = c(input.arChildCareExpenses);
    if (expenses > 0n) {
      if (typeof input.federalAGI !== "number") throw new Error("federalAGI is required for the Arkansas child care credit — AR2441 line 7 is Form 1040 line 11 (run compute_return first)");
      if (fs === "mfs" && input.arConsideredUnmarried !== true) n.push("AR line 35: a status 5 filer 'cannot claim a credit for child and dependent care expenses' unless considered unmarried (lived apart the last six months, kept up the qualifying person's home) — pass arConsideredUnmarried: true if so; $0 composed");
      else {
        childCare = rd(
          evalStateTax("us.ar.child_care_credit", 0n, {
            arChildCareExpenses: expenses,
            arChildCareQualifyingPersons: (input.arChildCareQualifyingPersons as number) ?? 1,
            arEarnedIncome: c(input.arEarnedIncome),
            arSpouseEarnedIncome: c(input.arSpouseEarnedIncome),
            arFederalAgi: c(input.federalAGI),
          }),
        );
      }
    }
    const early = input.arEarlyChildhoodApproved === true;
    const l35 = early ? 0n : childCare;
    const l43 = early ? childCare : 0n;
    if (childCare > 0n) n.push(early ? `AR line 43: early childhood program credit ${fmtD(childCare)} — the 20% AR2441 credit is REFUNDABLE when the child attends an APPROVED early childhood program (attach AR1000EC and AR2441; § 26-51-502(c)); nothing on line 35` : `AR line 35: child care credit ${fmtD(childCare)} = 20% of the AR2441 computation (2013-law § 21 percentages on federal AGI ${fmtD(rd(c(input.federalAGI)))}); nonrefundable — refundable on line 43 only for an approved early childhood program (arEarlyChildhoodApproved)`);

    const political = min2(D(input.arPoliticalContributions), married ? 10000n : 5000n);
    if (political > 0n) n.push(`AR1000TC line 1: state political contribution credit ${fmtD(political)} (cash contributions to Arkansas candidates, PACs, or parties by April 15, 2026; up to $50 per taxpayer, $100 for status 2 or 4)`);
    let osCredit = 0n;
    const osPaid = D(input.arOtherStateTaxPaid);
    const osIncome = D(input.arOtherStateIncome);
    if (osPaid > 0n && osIncome > 0n) {
      // AR1000TC line 2: the lesser of the other state's tax or the Arkansas tax on that income ("redo the AR1000F … with all the other states' income removed")
      const without = low ? lowTax(max0(a25 - osIncome)) : rd(evalStateTax("us.ar.income_tax", max0(a28 - osIncome)));
      const arTaxOnIt = max0(a29 - without);
      osCredit = min2(osPaid, arTaxOnIt);
      n.push(`AR1000TC line 2: other state tax credit ${fmtD(osCredit)} — lesser of ${fmtD(osPaid)} paid to the other state or the Arkansas tax on that income ${fmtD(arTaxOnIt)} (${fmtD(a29)} with it, ${fmtD(without)} without it)${status4 ? "; the other-state income is taken from the PRIMARY column" : ""}; attach the other state's signed return`);
    }
    const additional = status4
      ? rd(evalStateTax("us.ar.additional_tax_credit", max0(a28), { arStatus4: true })) + rd(evalStateTax("us.ar.additional_tax_credit", max0(b28), { arStatus4: true }))
      : rd(evalStateTax("us.ar.additional_tax_credit", max0(a28), { arStatus4: false }));
    if (additional > 0n) n.push(`AR1000TC line 6: additional tax credit for qualified individuals ${fmtD(additional)} (net taxable income $27,600 or less; $60 through $26,500 then −$5 per $100; ${status4 ? "each spouse's column" : married ? "doubled for status 2" : "one taxpayer"}) — requires a TIMELY filed return`);
    const ddCount = (input.arDevelopmentallyDisabledDependents as number) ?? 0;
    const dd = 50000n * BigInt(ddCount);
    if (dd > 0n) n.push(`AR1000TC line 7: ${fmtD(dd)} = $500 × ${ddCount} dependent(s) with developmental disabilities (AR1000-DD certification on file)`);
    const otherTc = D(input.nonrefundableCredits);
    if (otherTc > 0n) n.push(`AR1000TC lines 3-5, 8: other credits ${fmtD(otherTc)} transcribed (adoption 20% of federal, phenylketonuria, stillborn child ≤ $500, business incentive certificates)`);
    const l36 = political + osCredit + additional + dd + otherTc;
    const l37 = l34 + l35 + l36;
    const l38 = max0(l33 - l37);
    if (l37 > l33) n.push(`AR line 38: credits ${fmtD(l37)} exceed the total tax ${fmtD(l33)} — 'the difference is not refundable'`);

    // ---- lines 39A-52C: payments, refund, balance ----
    const l39A = D(input.stateWithholding) + D(input.spouseStateWithholding);
    const l39B = D(input.arWithholding1099);
    const l40 = D(input.estimatedPayments) + D(input.priorYearOverpaymentCredited);
    const l41 = D(input.extensionPayment);
    const l42 = D(input.arAmendedPaid);
    const l44 = l39A + l39B + l40 + l41 + l42 + l43;
    const l45 = D(input.arAmendedRefund);
    const l46 = l44 - l45;
    const l47 = max0(l46 - l38);
    const l48 = min2(D(input.arCreditForward), l47);
    const l49 = min2(D(input.arCheckoffs), l47 - l48);
    const l50 = l47 - l48 - l49;
    const l51 = max0(l38 - l46);
    const l52B = D(input.arUnderestimatePenalty);
    const l52C = l51 + l52B;
    if (l51 > 100000n && l52B === 0n) n.push(`AR line 51: amount due ${fmtD(l51)} is over $1,000 — 'continue to 52A': attach AR2210 (or AR2210A) and enter the exception number or the computed underestimate penalty (10% when withholding was under 90% of net tax)`);
    if (D(input.arCheckoffs) > l49) n.push(`AR line 49: check-off contributions ${fmtD(D(input.arCheckoffs))} limited to the ${fmtD(l49)} available from the overpayment (a filer who owes sends contributions separately)`);

    const col = (num: string, label: string, a: Cents, b: Cents): Record<string, string> =>
      status4 ? { [`${num}A_${label}`]: fmtD(a), [`${num}B_${label}`]: fmtD(b) } : { [`${num}_${label}`]: fmtD(a) };
    const lines: Record<string, string> = {
      _filing_status: status4 ? "4" : arStatus,
      "7C_personal_credits": fmtD(l34),
      ...(l8 !== 0n ? { "8_wages": fmtD(l8) } : {}),
      ...(l10 !== 0n ? { "10_interest": fmtD(l10) } : {}),
      ...(l11 !== 0n ? { "11_dividends": fmtD(l11) } : {}),
      ...(l12 !== 0n ? { "12_alimony": fmtD(l12) } : {}),
      ...(l13 !== 0n ? { "13_business_income": fmtD(l13) } : {}),
      ...(l14 !== 0n ? { "14_capital_gains": fmtD(l14) } : {}),
      ...(l15 !== 0n ? { "15_other_gains": fmtD(l15) } : {}),
      ...(l16 !== 0n ? { "16_ira_annuities": fmtD(l16) } : {}),
      ...(pTax !== 0n ? { "18A_pension_primary": fmtD(l18A) } : {}),
      ...(married && sTax !== 0n ? { "18B_pension_spouse": fmtD(l18B) } : {}),
      ...(l19 !== 0n ? { "19_rents_royalties": fmtD(l19) } : {}),
      ...(l20 !== 0n ? { "20_farm_income": fmtD(l20) } : {}),
      ...(l21 !== 0n ? { "21_unemployment": fmtD(l21) } : {}),
      ...(l22 !== 0n ? { "22_other_income": fmtD(l22) } : {}),
      ...(milTaxA + milTaxB !== 0n ? { _military_income_included: fmtD(milTaxA + milTaxB) } : {}),
      ...col("23", "total_income", a23, b23),
      ...(a24 + b24 !== 0n ? col("24", "adjustments", a24, b24) : {}),
      ...col("25", "agi", a25, b25),
      "26_table": method,
      ...col("27", "deduction", a27, b27),
      ...col("28", "net_taxable_income", a28, b28),
      ...col("29", "tax", a29, b29),
      "30_combined_tax": fmtD(l30),
      ...(l31 !== 0n ? { "31_lump_sum_tax": fmtD(l31) } : {}),
      ...(l32 !== 0n ? { "32_early_withdrawal_tax": fmtD(l32) } : {}),
      "33_total_tax": fmtD(l33),
      "34_personal_credits": fmtD(l34),
      ...(l35 !== 0n ? { "35_child_care_credit": fmtD(l35) } : {}),
      ...(l36 !== 0n ? { "36_other_credits": fmtD(l36) } : {}),
      "37_total_credits": fmtD(l37),
      "38_net_tax": fmtD(l38),
      ...(l39A !== 0n ? { "39A_withholding_w2": fmtD(l39A) } : {}),
      ...(l39B !== 0n ? { "39B_withholding_1099": fmtD(l39B) } : {}),
      ...(l40 !== 0n ? { "40_estimated_payments": fmtD(l40) } : {}),
      ...(l41 !== 0n ? { "41_extension_payment": fmtD(l41) } : {}),
      ...(l42 !== 0n ? { "42_amended_payments": fmtD(l42) } : {}),
      ...(l43 !== 0n ? { "43_early_childhood_credit": fmtD(l43) } : {}),
      "44_total_payments": fmtD(l44),
      ...(l45 !== 0n ? { "45_amended_refund": fmtD(l45) } : {}),
      "46_adjusted_payments": fmtD(l46),
      "47_overpayment": fmtD(l47),
      ...(l48 !== 0n ? { "48_credit_forward": fmtD(l48) } : {}),
      ...(l49 !== 0n ? { "49_checkoffs": fmtD(l49) } : {}),
      "50_refund": fmtD(l50),
      "51_amount_due": fmtD(l51),
      ...(l52B !== 0n ? { "52B_penalty": fmtD(l52B) } : {}),
      "52C_total_due": fmtD(l52C),
    };
    return { lines, notes: n, netTax: l38, tax: l30, status4, low };
  };

  // ---- table election for one status ----
  const best = (status4: boolean): Build | undefined => {
    const regular = compute(status4, false);
    if ("invalid" in regular) {
      notes.push(`AR filing status 4 not available: ${regular.invalid}`);
      return undefined;
    }
    if ("ineligible" in regular) return undefined; // unreachable: only the low path returns ineligible
    const low = compute(status4, true);
    const lowOk = !("ineligible" in low) && !("invalid" in low) ? (low as Build) : undefined;
    const why = "ineligible" in low ? low.ineligible : "invalid" in low ? low.invalid : "";
    if (input.arUseLowIncomeTable === true) {
      if (lowOk) {
        lowOk.notes.push(`AR line 26: Low Income Tax Table used as requested — tax ${fmtD(lowOk.tax)} (net ${fmtD(lowOk.netTax)}) vs ${fmtD(regular.tax)} (net ${fmtD(regular.netTax)}) with the ${regular.lines["26_table"]} deduction`);
        return lowOk;
      }
      regular.notes.push(`AR line 26: Low Income Tax Table requested but not available — ${why}; Regular Income Tax Table composed`);
      return regular;
    }
    if (!lowOk) {
      if (!status4 && fs !== "mfs" && input.arItemize !== true) regular.notes.push(`AR line 26: Low Income Tax Table not available — ${why}`);
      return regular;
    }
    if (input.arUseLowIncomeTable === false) {
      regular.notes.push(`AR line 26: Regular Income Tax Table used as requested — tax ${fmtD(regular.tax)} (net ${fmtD(regular.netTax)}); the Low Income Tax Table would give ${fmtD(lowOk.tax)} (net ${fmtD(lowOk.netTax)})`);
      return regular;
    }
    if (lowOk.netTax < regular.netTax) {
      lowOk.notes.push(`AR line 26: Low Income Tax Table chosen — tax ${fmtD(lowOk.tax)} (net ${fmtD(lowOk.netTax)}) vs ${fmtD(regular.tax)} (net ${fmtD(regular.netTax)}) with the ${regular.lines["26_table"]} deduction on the Regular Income Tax Table (line 27 = 0: 'The Standard Deduction is already built into the table'; pass arUseLowIncomeTable: false to override)`);
      return lowOk;
    }
    regular.notes.push(`AR line 26: Regular Income Tax Table kept — tax ${fmtD(regular.tax)} (net ${fmtD(regular.netTax)}) vs ${fmtD(lowOk.tax)} (net ${fmtD(lowOk.netTax)}) on the Low Income Tax Table (pass arUseLowIncomeTable: true to override)`);
    return regular;
  };

  // ---- status 2 vs status 4 ----
  const candidates: Build[] = [];
  if (married && input.arStatus4 !== false && (input.arStatus4 === true || spouseGiven)) {
    if (!spouseGiven) notes.push("AR filing status 4: arSpouseIncome not given — the spouse's column B carries only line 18B (pass arSpouseIncome = the spouse's share of lines 8-22 and arSpouseAdjustments)");
    const s4 = best(true);
    if (s4) candidates.push(s4);
  }
  if (!(married && input.arStatus4 === true) || candidates.length === 0) {
    const s2 = best(false);
    if (s2) candidates.push(s2);
  }
  let chosen = candidates[0];
  for (const cand of candidates) if (cand.netTax < chosen.netTax) chosen = cand;
  if (candidates.length === 2) {
    const s4 = candidates.find((x) => x.status4)!;
    const s2 = candidates.find((x) => !x.status4)!;
    notes.push(`AR filing status: married filing separately on the same return (status 4) nets ${fmtD(s4.netTax)}; married filing joint (status 2) nets ${fmtD(s2.netTax)} — status ${chosen.status4 ? "4" : "2"} composed ('Use the method that suits you best'; pass arStatus4 to force)`);
  } else if (married && input.arStatus4 === undefined && !spouseGiven) notes.push("AR filing status 2 (joint) composed — Arkansas has ONE rate table for every status, so a two-income couple usually saves with status 4 (separately on the same return); pass arSpouseIncome (the spouse's share of lines 8-22) to compare");
  notes.push(...chosen.notes);
  notes.push("AR scope: Form AR1000F is composed for a FULL-YEAR RESIDENT — nonresidents and part-year residents file AR1000NR (columns C and lines 38A-38D proration, not composed); Arkansas has no local income taxes; Social Security, VA, workers' compensation, Railroad Retirement, and U.S./Arkansas obligation interest are exempt and never enter lines 8-22; AR1000ADJ, AR-OI, AR1000TD, AR1000CO, and AR1000TC lines 3-5 and 8 are transcribed inputs");
  return chosen.lines;
}
