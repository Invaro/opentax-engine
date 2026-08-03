/**
 * @invaro/opentax-corpus-us-federal — US federal individual income tax rules as
 * data: cited, temporally versioned, content-addressed.
 *
 * Corpus v0.1 scope (TY2025, figures per Rev. Proc. 2024-40):
 *   filing statuses single/mfj/hoh · standard deduction (base, age/blind
 *   additions, dependent limitation) · ordinary income brackets · child tax
 *   credit (nonrefundable) · tax after credits.
 * Anything outside that scope FAILS LOUD (NoApplicableRule/UnhandledEnumCase)
 * rather than producing a plausible wrong answer.
 */

import { loadCorpus } from "@invaro/opentax-core";
import type { CorpusInput, LoadedCorpus } from "@invaro/opentax-core";
import { facts } from "./facts.js";
import { adjustmentRules } from "./rules/adjustments.js";
import { amtRules } from "./rules/amt.js";
import { annualizedInstallmentRules } from "./rules/annualized-installments.js";
import { capitalLossRules } from "./rules/capital-losses.js";
import { carLoanRules } from "./rules/car-loan.js";
import { charityRules } from "./rules/charity.js";
import { corporateRules } from "./rules/corporate.js";
import { corporate1120Rules } from "./rules/corporate-1120.js";
import { corporateAnnualizedRules } from "./rules/corporate-annualized.js";
import { corporatePenaltyTaxRules } from "./rules/corporate-penalty-taxes.js";
import { qsbsRules } from "./rules/qsbs.js";
import { creditBlockRules } from "./rules/credits.js";
import { ctcRules } from "./rules/ctc.js";
import { dependentRules } from "./rules/dependents.js";
import { educationCreditRules } from "./rules/education-credits.js";
import { eitcRules } from "./rules/eitc.js";
import { feieRules } from "./rules/feie.js";
import { fiduciaryRules } from "./rules/fiduciary.js";
import { ptcRules } from "./rules/ptc.js";
import { residualRules } from "./rules/residual.js";
import { employerRules } from "./rules/employer.js";
import { estimatedTaxRules } from "./rules/estimated-tax.js";
import { incomeRules } from "./rules/income.js";
import { incomeTaxRules } from "./rules/income-tax.js";
import { internationalAndRemainderRules } from "./rules/international.js";
import { investmentTaxRules } from "./rules/investment-taxes.js";
import { iraRules } from "./rules/ira.js";
import { ira8606Rules } from "./rules/ira-8606.js";
import { itemizedRules } from "./rules/itemized.js";
import { kiddieRules } from "./rules/kiddie.js";
import { netTaxRules } from "./rules/net-tax.js";
import { passiveLossRules, mileageRules } from "./rules/passive-losses.js";
import { pensionRules } from "./rules/pension.js";
import { rentalRules } from "./rules/rental.js";
import { scheduleDRules } from "./rules/schedule-d.js";
import { scheduleRRules } from "./rules/schedule-r.js";
import { stateParameterRules } from "./rules/state-parameters.js";
import { qbiRules } from "./rules/qbi.js";
import { selfEmploymentRules } from "./rules/self-employment.js";
import { seniorDeductionRules } from "./rules/senior-deduction.js";
import { socialSecurityRules } from "./rules/social-security.js";
import { standardDeductionRules } from "./rules/standard-deduction.js";
import { tipsEligibilityRules } from "./rules/tips-eligibility.js";
import { tipsOvertimeRules } from "./rules/tips-overtime.js";

export const corpusInput: CorpusInput = {
  name: "@invaro/opentax-corpus-us-federal",
  version: "0.39.0",
  rules: [
    ...corporateRules,
    ...corporate1120Rules,
    ...corporatePenaltyTaxRules,
    ...corporateAnnualizedRules,
    ...internationalAndRemainderRules,
    ...qsbsRules,
    ...standardDeductionRules,
    ...amtRules,
    ...itemizedRules,
    ...educationCreditRules,
    ...iraRules,
    ...ira8606Rules,
    ...scheduleDRules,
    ...rentalRules,
    ...pensionRules,
    ...capitalLossRules,
    ...kiddieRules,
    ...incomeRules,
    ...incomeTaxRules,
    ...ctcRules,
    ...creditBlockRules,
    ...ptcRules,
    ...feieRules,
    ...fiduciaryRules,
    ...residualRules,
    ...seniorDeductionRules,
    ...socialSecurityRules,
    ...tipsOvertimeRules,
    ...tipsEligibilityRules,
    ...carLoanRules,
    ...charityRules,
    ...eitcRules,
    ...employerRules,
    ...selfEmploymentRules,
    ...passiveLossRules,
    ...scheduleRRules,
    ...stateParameterRules,
    ...mileageRules,
    ...adjustmentRules,
    ...qbiRules,
    ...investmentTaxRules,
    ...netTaxRules,
    ...estimatedTaxRules,
    ...annualizedInstallmentRules,
    ...dependentRules,
  ],
  facts,
};

let cached: LoadedCorpus | null = null;

/** The validated, hashed corpus (computed once, cached). */
export function getCorpus(): LoadedCorpus {
  if (!cached) cached = loadCorpus(corpusInput);
  return cached;
}

/**
 * The conventional top-level question this corpus answers: net federal
 * income tax after refundable credits. NEGATIVE = refund.
 */
export const DEFAULT_TARGET = "us.federal.net_tax";

export { facts } from "./facts.js";
export {
  matchOccupation,
  OCCUPATION_ENUM,
  TIPPED_OCCUPATIONS,
} from "./occupations.js";
