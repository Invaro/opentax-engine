/**
 * MCP input schema — GENERATED from the corpus fact registry.
 *
 * The corpus is the single source of truth: a fact added there can never be
 * silently absent here (schema.test.ts pins a full PARTITION — every fact
 * belongs to exactly one domain tool and, within the individual domain, to
 * exactly one group), and tool inputs are validated STRICTLY — an unknown
 * key is an error naming the key, never a silent strip. A confident answer
 * computed from silently dropped facts is exactly the failure mode this
 * engine exists to prevent.
 *
 * Context economy (the tiered design):
 *  - calculate_tax advertises the INDIVIDUAL facts, nested into groups
 *    (filing, income, retirement, credits, …) so agents fill related fields
 *    together instead of navigating a 170-key wall.
 *  - Business-entity, fiduciary, and dependent-determination facts live on
 *    their own tools with flat, fully-described schemas.
 *  - The other fact-taking tools (verify_tax_claim, find_tax_cliffs,
 *    compare_filing_statuses) advertise one compact `facts` object param,
 *    runtime-validated by the same strict validator over ALL domains —
 *    identical strictness, advertised once.
 *
 * Every fact is optional at the schema level: the engine demands the facts
 * the requested target actually needs and names any that are missing.
 */

import { z } from "zod";
import { coerceFacts } from "@invaro/opentax-core";
import type { TypedValueJSON } from "@invaro/opentax-core";
import { DEFAULT_TARGET, getCorpus, matchOccupation } from "@invaro/opentax-corpus-us-federal";
import { compileDocuments, documentsShape } from "./documents.js";

export const corpus = getCorpus();

export const money = z
  .union([z.number(), z.string()])
  .describe('dollars, e.g. 50000 or "1234.56"');

type FactDef = (typeof corpus.facts)[number];

function zodForFact(f: FactDef): z.ZodTypeAny {
  // occupation stays free text — fuzzy-matched to the Treasury Tipped
  // Occupation list in buildFacts so agents can pass "bartender" verbatim
  if (f.id === "occupation") {
    return z
      .string()
      .describe(
        'tipped occupation, fuzzy-matched to the Treasury Tipped Occupation list (Treas. Reg. § 1.224-1) — e.g. "bartender", "nanny" — or "other" if genuinely unlisted. Only needed when qualifiedTips > 0.',
      );
  }
  switch (f.type) {
    case "money":
      return money.describe(f.description);
    case "bool":
      return z.boolean().describe(f.description);
    case "int":
      return z.union([z.number().int(), z.string()]).describe(f.description);
    case "enum":
      return z.enum(f.enumValues as [string, ...string[]]).describe(f.description);
    default:
      return z.string().describe(f.description);
  }
}

const targetParam = (defaultLabel: string, determinations?: string) =>
  z
    .string()
    .optional()
    .describe(`rule to derive (default: ${defaultLabel}).${determinations ? ` ${determinations}` : ""}`);

const asOfParam = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .describe(
    'REQUIRED for computation: the law-in-force date — use the intended tax year\'s year-end (e.g. "2025-12-31" for TY2025). Omitting it is an error, never a default.',
  );

// ---------------------------------------------------------------------------
// domain partition: business / fiduciary / dependent by prefix + explicit
// sets; everything remaining is INDIVIDUAL and must be claimed by exactly
// one group below (the partition test enforces both directions)
// ---------------------------------------------------------------------------

const BUSINESS_EXTRAS = new Set([
  "entityLegalForm",
  "llcMemberCount",
  "filedForm8832CorpElection",
  "filedForm2553SElection",
  "employeeAnnualWages",
  "qreCurrentYear",
  "qreAvgPrior3Years",
  "generalBusinessCredits",
]);

const DEPENDENT_EXTRAS = new Set([
  "taxpayerProvidedOverHalfSupport",
  "hasMultipleSupportAgreement",
  "taxpayerProvidedOver10PercentSupport",
  "taxpayerIsCustodialParent",
  "custodialParentReleasedClaim",
]);

export function domainOf(id: string): "business" | "fiduciary" | "dependent" | "individual" {
  if (id.startsWith("corp") || id.startsWith("sCorp") || BUSINESS_EXTRAS.has(id))
    return "business";
  if (id.startsWith("fiduciary")) return "fiduciary";
  // dep[A-Z]… are the § 152 candidate-person facts; "dependentCareExpenses"
  // (§ 21 credit input) must NOT match — the partition test caught exactly that
  if (/^dep[A-Z]/.test(id) || DEPENDENT_EXTRAS.has(id)) return "dependent";
  return "individual";
}

/** Individual facts, grouped for the nested calculate_tax schema. */
export const INDIVIDUAL_GROUPS: Record<string, readonly string[]> = {
  filing: [
    "mfsConsideredUnmarried",
    "mfsLivedApartAllYear",
    "filingStatus",
    "isAge65OrOlder",
    "isBlind",
    "spouseIsAge65OrOlder",
    "spouseIsBlind",
    "isClaimedAsDependent",
    "isFullTimeStudent",
    "spouseIsFullTimeStudent",
    "isAtLeastAge25",
    "spouseItemizes",
    "useFormulaMethod",
  ],
  income: [
    "alimonyReceivedPre2019",
    "wages",
    "taxableInterest",
    "taxExemptInterest",
    "longTermCapitalGains",
    "qualifiedDividends",
    "shortTermCapitalGains",
    "ordinaryDividends",
    "netCapitalLoss",
    "shortTermCapitalLoss",
    "longTermCapitalLoss",
    "rentalDepreciableBasis",
    "rentalPlacedInServiceMonth",
    "rentalIncomeBeforeDepreciation",
    "unemploymentCompensation",
    "otherOrdinaryIncome",
    "socialSecurityWages",
    "medicareWages",
    "foreignEarnedIncome",
  ],
  tips_overtime: [
    "qualifiedTips",
    "occupation",
    "tipsWereVoluntary",
    "employerIsSSTB",
    "qualifiedOvertimePremium",
  ],
  retirement: [
    "hsaDistributions",
    "hsaQualifiedMedicalExpenses",
    "hsaDistributionPenaltyExempt",
    "socialSecurityBenefits",
    "taxableIraDistributions",
    "taxablePensionsAndAnnuities",
    "earlyDistributionSubjectToPenalty",
    // § 72(d) Simplified Method — the engine computes the taxable portion
    "pensionGrossPayments",
    "pensionCostBasis",
    "pensionAgeAtStart",
    "pensionIsJointAndSurvivor",
    "pensionCombinedAgesAtStart",
    "pensionMonthsThisYear",
    "pensionBasisPreviouslyRecovered",
    // Form 8606 basis pro-rata — standalone target us.federal.ira8606.*
    "ira8606Basis",
    "ira8606NondeductibleContributions",
    "ira8606YearEndValue",
    "ira8606Distributions",
    "ira8606Conversions",
  ],
  self_employment: [
    "selfEmploymentNetProfit",
    "scheduleCNetLoss",
    "k1OrdinaryBusinessIncome",
    "qbiW2Wages",
    "qbiUBIA",
    "businessIsSSTB",
    "sepContribution",
    "selfEmployedHealthPremiums",
    "homeOfficeSquareFeet",
    "businessMilesDriven",
    "aggregateBusinessLoss",
  ],
  adjustments: [
    "alimonyPaidPre2019",
    "spouseEducatorExpenses",
    "iraContribution",
    "isActivePlanParticipant",
    "spouseIsActivePlanParticipant",
    "isAge50OrOlder",
    "hsaContribution",
    "hsaCoverage",
    "isAge55OrOlder",
    "studentLoanInterest",
    "carLoanInterest",
    "educatorExpenses",
    "earlyWithdrawalPenaltyPaid",
    "otherAdjustments",
  ],
  itemized: [
    "stateAndLocalTaxesPaid",
    "mortgageInterestPaid",
    "mortgageAverageBalance",
    "medicalExpenses",
    "charitableCashContributions",
    "noncashCharitableContributions",
    "investmentInterestDeduction",
    "gamblingLossesItemized",
    "otherItemizedDeductions",
    "casualtyFederalDisasterLosses",
    "casualtyQualifiedDisasterLosses",
    "forceItemized",
  ],
  credits: [
    "qualifyingChildren",
    "otherDependents",
    "dependentCareExpenses",
    "careQualifyingIndividuals",
    "secondaryEarnedIncome",
    "saversContributions",
    "saversContributionsSpouse",
    "qualifiedAdoptionExpenses",
    "adoptionIsSpecialNeeds",
    "aotcExpensesStudent1",
    "aotcExpensesStudent2",
    "aotcExpensesStudent3",
    "llcQualifiedExpenses",
    "eitcAdditionalQualifyingChildren",
    "isRetiredOnTotalDisability",
    "scheduleRDisabilityIncome",
    "nontaxableBenefitsForScheduleR",
  ],
  healthcare_ptc: [
    "mfsAbuseOrAbandonmentException",
    "slcspAnnualPremium",
    "marketplacePremiumsPaid",
    "advancePTC",
    "ptcHouseholdSize",
  ],
  kiddie_tax: [
    "isSubjectToKiddieTax",
    "parentTaxableIncome",
    "parentFilingStatus",
    "parentHasPreferentialIncome",
  ],
  investor_amt: [
    "amtIsoExerciseSpread",
    "amtOtherPreferences",
    "niitInvestmentExpenses",
    "qsbsGain",
    "qsbsAcquiredAfterJuly2025",
    "qsbsAcquiredAfterSept2010",
    "qsbsHoldingPeriodYears",
  ],
  rentals_passive: [
    "scheduleENetIncome",
    "passiveActivityIncome",
    "selfRentalNetIncome",
    "passiveActivityLosses",
    "rentalActiveParticipationLosses",
    "nonpassiveScheduleELoss",
    "qbiLossOffset",
  ],
  state: [
    "stateTaxableIncome",
    "hasChildUnderSix",
    "caRentedPrincipalResidence",
    "caAmti",
    "caRegularTax",
    "nyYonkersBase",
    "nyIt214Fagi",
    "nyIt214Eligible",
    "nyIt214TotalRent",
    "nyIt214RentPercent",
    "nyIt214MonthsPaid",
    "nyIt214HomeownerTaxes",
    "nyIt216StateCredit",
    "nyIt216Under4Expenses",
    "nyIt216TotalExpenses",
  ],
  household_employer: ["householdEmployeeCashWages", "householdFutaTestMet"],
  payments_estimates: [
    "federalEstimatedPayments",
    "federalExtensionPayment",
    "federalTaxWithheld",
    "priorYearTax",
    "priorYearAGI",
    "isFarmerOrFisherman",
    "wagesThroughMar31",
    "wagesThroughMay31",
    "wagesThroughAug31",
    "seProfitThroughMar31",
    "seProfitThroughMay31",
    "seProfitThroughAug31",
  ],
};

const GROUP_NAMES = new Set(Object.keys(INDIVIDUAL_GROUPS));
const factById = new Map(corpus.facts.map((f) => [f.id, f]));

function shapeFor(ids: readonly string[]): Record<string, z.ZodTypeAny> {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const id of ids) {
    const f = factById.get(id);
    if (!f) continue; // partition test fails loudly on stale group entries
    shape[id] = zodForFact(f).optional();
  }
  return shape;
}

export function factIdsForDomain(
  domain: "business" | "fiduciary" | "dependent" | "individual",
): string[] {
  return corpus.facts.filter((f) => domainOf(f.id) === domain).map((f) => f.id);
}

// --- advertised schemas ------------------------------------------------------

const GROUP_DESCRIPTIONS: Record<string, string> = {
  filing: "who is filing: status, age/blindness, dependency, student status",
  income: "wages, interest, capital gains, unemployment, foreign earned income",
  tips_overtime: "§ 224 tips and § 225 overtime deductions (OBBBA)",
  retirement: "social security, IRA/pension distributions, early-distribution penalty",
  self_employment: "Schedule C / K-1, QBI inputs, SE deductions, home office",
  adjustments: "IRA/HSA contributions, student-loan and car-loan interest",
  itemized: "Schedule A: SALT, mortgage, medical, charitable",
  credits: "CTC/ODC counts, dependent care, saver's, adoption, education",
  healthcare_ptc: "§ 36B premium tax credit / Form 1095-A reconciliation",
  kiddie_tax: "Form 8615 inputs for a child subject to § 1(g)",
  investor_amt: "AMT preferences (ISO spread) and § 1202 QSBS exclusion",
  rentals_passive: "Schedule E rentals/royalties + § 469 passive-loss netting (Form 8582 via us.federal.passive_loss_allowed)",
  state: "state taxable income for the state tax targets (us.ca/us.va/us.il.income_tax; parameters via lookup_tax_parameter)",
  household_employer: "Schedule H nanny/household-employee taxes",
  payments_estimates: "withholding, prior-year safe harbor, annualized installments",
};

/** Nested individual schema advertised on calculate_tax. */
export const individualNestedShape: Record<string, z.ZodTypeAny> = (() => {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const [group, ids] of Object.entries(INDIVIDUAL_GROUPS)) {
    shape[group] = z
      .object(shapeFor(ids))
      .strict()
      .optional()
      .describe(GROUP_DESCRIPTIONS[group] ?? group);
  }
  shape.documents = documentsShape.optional();
  shape.target = targetParam(
    "net tax; balance due when payments_estimates.federalTaxWithheld is given",
    "Determinations: us.federal.eligible.tips_deduction, us.federal.estimated.quarterly_payment, us.federal.estimated.safe_harbor_met",
  );
  shape.asOf = asOfParam;
  return shape;
})();

/** Flat business-entity schema advertised on calculate_business_tax. */
export const businessShape: Record<string, z.ZodTypeAny> = (() => {
  const shape = shapeFor(factIdsForDomain("business"));
  shape.target = targetParam(
    "us.federal.corp.entity_level_income_tax — the classification-aware entity income tax",
    "Other targets: us.federal.corp.entity_classification, .taxable_income, .income_tax_after_credits, .beat, .estimated.quarterly_payment, .stock_buyback_excise, .accumulated_earnings_tax, .phc_tax, .s_corp_entity_taxes",
  );
  shape.asOf = asOfParam;
  return shape;
})();

/** Flat Form 1041 schema advertised on calculate_fiduciary_tax. */
export const fiduciaryShape: Record<string, z.ZodTypeAny> = (() => {
  const shape = shapeFor(factIdsForDomain("fiduciary"));
  shape.target = targetParam("us.federal.fiduciary.income_tax");
  shape.asOf = asOfParam;
  return shape;
})();

/** Flat § 152 dependent-determination schema advertised on determine_dependent. */
export const dependentShape: Record<string, z.ZodTypeAny> = (() => {
  const shape = shapeFor(factIdsForDomain("dependent"));
  shape.target = targetParam(
    "us.federal.dependent.is_dependent",
    "Other targets: us.federal.dependent.qualifying_child, us.federal.dependent.qualifying_relative",
  );
  shape.asOf = asOfParam;
  return shape;
})();

// --- runtime validation (shared by every fact-taking tool) -------------------

/** Flat validator over ALL facts + target/asOf — the single strict backstop. */
export const FACT_SHAPE: Record<string, z.ZodTypeAny> = (() => {
  const shape: Record<string, z.ZodTypeAny> = {};
  for (const f of corpus.facts) shape[f.id] = zodForFact(f).optional();
  shape.target = targetParam("net tax");
  shape.asOf = asOfParam;
  return shape;
})();

const STRICT_FLAT = z.object(FACT_SHAPE).strict();

export const factsObjectParam = z
  .record(z.unknown())
  .describe(
    "facts for the computation: either flat corpus fact ids (see list_input_facts) or the same group objects calculate_tax accepts (filing, income, retirement, …), plus optional target and asOf. Business/fiduciary/dependent facts are accepted flat. Unknown keys are rejected by name — nothing is ever silently dropped.",
  );

/** Accepts grouped, flat, or mixed input; returns one flat fact record. */
export function flattenFactsArg(input: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = {};
  const put = (key: string, value: unknown, from: string) => {
    if (value === undefined) return;
    if (key in flat)
      throw new Error(`fact "${key}" given more than once (via ${from}) — remove the duplicate`);
    flat[key] = value;
  };
  for (const [k, v] of Object.entries(input)) {
    if (GROUP_NAMES.has(k)) {
      if (v === undefined || v === null) continue;
      if (typeof v !== "object" || Array.isArray(v))
        throw new Error(`group "${k}" must be an object of facts`);
      for (const [fk, fv] of Object.entries(v as Record<string, unknown>)) put(fk, fv, `group ${k}`);
    } else {
      put(k, v, "top level");
    }
  }
  return flat;
}

const INT_FACTS = new Set(corpus.facts.filter((f) => f.type === "int").map((f) => f.id));

export function buildFacts(
  args: Record<string, unknown>,
  defaultTarget: string = DEFAULT_TARGET,
): {
  facts: Record<string, TypedValueJSON>;
  asOf: string;
  target: string;
} {
  const plain: Record<string, unknown> = {};
  for (const f of corpus.facts) {
    let v = args[f.id];
    if (v === undefined) continue;
    if (INT_FACTS.has(f.id) && typeof v === "number") {
      v = String(v);
    }
    if (f.id === "occupation" && typeof v === "string") {
      const match = matchOccupation(v);
      if ("slug" in match) v = match.slug;
      else {
        throw new Error(
          match.candidates.length
            ? `occupation "${v}" matches several listed occupations: ${match.candidates.join(", ")} — pick one`
            : `occupation "${v}" is not on the Treasury Tipped Occupation list — pass "other" if the job is genuinely unlisted`,
        );
      }
    }
    plain[f.id] = v;
  }
  if (typeof args.asOf !== "string") {
    throw new Error(
      'asOf is required — pass the year-end date of the intended tax year (e.g. "2025-12-31" for TY2025). This tool refuses to default to today: a 2025 return computed under 2026 parameters is a silent wrong answer.',
    );
  }
  return {
    facts: coerceFacts(corpus, plain),
    asOf: args.asOf,
    target:
      (args.target as string | undefined) ??
      (defaultTarget === DEFAULT_TARGET && args.federalTaxWithheld !== undefined
        ? "us.federal.balance_due"
        : defaultTarget),
  };
}

/**
 * Strict-validate a facts input (grouped, flat, or mixed), then build engine
 * facts. Unknown keys error by name — identical strictness on every tool.
 */
export function buildFactsValidated(
  factsArg: unknown,
  defaultTarget?: string,
): ReturnType<typeof buildFacts> & { documentNotes: string[]; w2Box1Cents?: bigint } {
  const input =
    factsArg && typeof factsArg === "object" && !Array.isArray(factsArg)
      ? { ...(factsArg as Record<string, unknown>) }
      : {};
  let documentNotes: string[] = [];
  let w2Box1Cents: bigint | undefined;
  const docsRaw = input.documents;
  delete input.documents;
  const flat = flattenFactsArg(input);
  if (docsRaw !== undefined) {
    const parsedDocs = documentsShape.safeParse(docsRaw);
    if (!parsedDocs.success) {
      const detail = parsedDocs.error.issues
        .map((i) => (i.path.length ? `documents.${i.path.join(".")}: ${i.message}` : i.message))
        .join("; ");
      throw new Error(`invalid documents block — ${detail}`);
    }
    if (typeof flat.asOf !== "string") {
      throw new Error(
        'asOf is required — pass the year-end date of the intended tax year (e.g. "2025-12-31" for TY2025). This tool refuses to default to today: a 2025 return computed under 2026 parameters is a silent wrong answer.',
      );
    }
    const compiled = compileDocuments(parsedDocs.data, flat.asOf);
    documentNotes = compiled.notes;
    w2Box1Cents = compiled.w2Box1Cents;
    for (const [id, v] of Object.entries(compiled.facts)) {
      if (id in flat) {
        throw new Error(
          `fact "${id}" was derived from the documents block AND passed directly — remove the direct value (the compiled document value is authoritative; to override, drop the document entry and disclose)`,
        );
      }
      flat[id] = v;
    }
  }
  const parsed = STRICT_FLAT.safeParse(flat);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message))
      .join("; ");
    throw new Error(
      `invalid facts object — ${detail}. Every valid fact id is listed by list_input_facts; calculate_tax's parameters show the grouped form.`,
    );
  }
  return {
    ...buildFacts(parsed.data as Record<string, unknown>, defaultTarget),
    documentNotes,
    ...(w2Box1Cents !== undefined ? { w2Box1Cents } : {}),
  };
}
