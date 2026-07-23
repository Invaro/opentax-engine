/**
 * Compute every harness scenario with the opentax engine (in-process).
 *
 *   node harness/run-opentax.mjs harness/scenarios.json > harness/results-opentax.json
 */

import { readFileSync } from "node:fs";
import { coerceFacts, evaluate } from "../packages/core/dist/index.js";
import { getCorpus } from "../packages/corpus-us-federal/dist/index.js";

const scenarios = JSON.parse(readFileSync(process.argv[2], "utf8"));
const corpus = getCorpus();

const out = {};
for (const s of scenarios) {
  const plain = {
    filingStatus: s.status,
    // PolicyEngine computes the § 1 formula, not the Tax Table — compare
    // like-for-like (the Table method is separately validated against the
    // printed IRS table itself)
    useFormulaMethod: true,
    wages: s.wages,
    taxableInterest: s.interest ?? 0,
    longTermCapitalGains: s.gains ?? 0,
    qualifyingChildren: s.kids ?? 0,
    ...(s.tips ? { qualifiedTips: s.tips, occupation: "wait-staff" } : {}),
    ...(s.overtime ? { qualifiedOvertimePremium: s.overtime } : {}),
    ...(s.seProfit ? { selfEmploymentNetProfit: s.seProfit } : {}),
    ...(s.k1 ? { k1OrdinaryBusinessIncome: s.k1 } : {}),
    ...(s.sstb !== undefined ? { businessIsSSTB: s.sstb } : {}),
    ...(s.ss ? { socialSecurityBenefits: s.ss } : {}),
    ...(s.pensions ? { taxablePensionsAndAnnuities: s.pensions } : {}),
    ...(s.unemployment ? { unemploymentCompensation: s.unemployment } : {}),
    ...(s.studentLoan ? { studentLoanInterest: s.studentLoan } : {}),
    // Schedule A (PE takes deductible mortgage interest as GIVEN — keep
    // balances under the $750k limit so the comparison is like-for-like;
    // the proration itself is pinned by fixtures + Pub. 936)
    ...(s.salt ? { stateAndLocalTaxesPaid: s.salt } : {}),
    ...(s.mortgage
      ? { mortgageInterestPaid: s.mortgage, mortgageAverageBalance: s.mortgageBalance ?? 500000 }
      : {}),
    ...(s.medical ? { medicalExpenses: s.medical } : {}),
    ...(s.charity ? { charitableCashContributions: s.charity } : {}),
    ...(s.status === "mfs" ? { spouseItemizes: false } : {}),
    isAtLeastAge25: true,
    isAge65OrOlder: s.age65 ?? false,
    ...(s.status === "mfj" && s.age65 ? { spouseIsAge65OrOlder: true } : {}),
  };
  try {
    const { value } = evaluate(corpus, coerceFacts(corpus, plain), {
      asOf: s.asOf,
      target: "us.federal.net_tax",
    });
    out[s.id] = value.cents.toString();
  } catch (err) {
    out[s.id] = `ERROR:${err.code ?? err.message}`;
  }
}
process.stdout.write(JSON.stringify({ engine: "opentax", corpusMerkleRoot: corpus.merkleRoot, results: out }, null, 1) + "\n");
