/**
 * Pins the MCP input schema to the corpus fact registry.
 *
 * The failure this guards against was real: a hand-curated schema fell
 * behind the corpus (45 of 170 facts), and because unknown keys were
 * silently stripped, a calculate_tax call with $44,458 of retirement/SS
 * income returned ok:true computed on wages alone — a silent wrong from
 * the very tool whose contract is "compute or refuse loudly".
 *
 * The tiered design adds a second invariant: the domain partition. Every
 * corpus fact belongs to exactly one domain tool, and every individual
 * fact to exactly one group — so nothing can be advertised twice or not
 * at all.
 */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import { evaluate } from "@invaro/opentax-core";
import {
  buildFacts,
  buildFactsValidated,
  businessShape,
  corpus,
  dependentShape,
  domainOf,
  FACT_SHAPE,
  factIdsForDomain,
  fiduciaryShape,
  flattenFactsArg,
  INDIVIDUAL_GROUPS,
  individualNestedShape,
} from "../src/schema.js";

describe("the domain partition", () => {
  it("assigns every corpus fact to exactly one domain tool's schema", () => {
    for (const f of corpus.facts) {
      const domain = domainOf(f.id);
      if (domain === "business") expect(businessShape, f.id).toHaveProperty(f.id);
      if (domain === "fiduciary") expect(fiduciaryShape, f.id).toHaveProperty(f.id);
      if (domain === "dependent") expect(dependentShape, f.id).toHaveProperty(f.id);
    }
    const counts = [
      factIdsForDomain("individual"),
      factIdsForDomain("business"),
      factIdsForDomain("fiduciary"),
      factIdsForDomain("dependent"),
    ].map((a) => a.length);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(corpus.facts.length);
  });

  it("covers every individual fact in exactly one group — no gaps, no duplicates, no stale entries", () => {
    const individual = new Set(factIdsForDomain("individual"));
    const seen = new Map<string, string>();
    for (const [group, ids] of Object.entries(INDIVIDUAL_GROUPS)) {
      for (const id of ids) {
        expect(individual.has(id), `"${id}" in group "${group}" is not an individual corpus fact (stale or misplaced)`).toBe(true);
        expect(seen.has(id), `"${id}" appears in both "${seen.get(id)}" and "${group}"`).toBe(false);
        seen.set(id, group);
      }
    }
    for (const id of individual) {
      expect(seen.has(id), `individual fact "${id}" is not claimed by any group — assign it in INDIVIDUAL_GROUPS`).toBe(true);
    }
  });

  it("keeps the flat runtime validator covering every fact plus target/asOf", () => {
    for (const f of corpus.facts) expect(FACT_SHAPE).toHaveProperty(f.id);
    expect(FACT_SHAPE).toHaveProperty("target");
    expect(FACT_SHAPE).toHaveProperty("asOf");
  });
});

describe("strict validation (no silent stripping anywhere)", () => {
  it("rejects unknown top-level keys on the nested calculate_tax schema", () => {
    const schema = z.object(individualNestedShape).strict();
    const bad = schema.safeParse({ filing: { filingStatus: "mfj" }, wagez: 5 });
    expect(bad.success).toBe(false);
  });

  it("rejects unknown keys inside a group", () => {
    const schema = z.object(individualNestedShape).strict();
    const bad = schema.safeParse({ filing: { filingStatuz: "mfj" } });
    expect(bad.success).toBe(false);
  });

  it("rejects unknown keys in the runtime facts object, naming the key", () => {
    expect(() => buildFactsValidated({ filingStatus: "mfj", wages: 1000, wagez: 5 })).toThrowError(
      /wagez/,
    );
  });

  it("rejects the same fact given both flat and in a group", () => {
    expect(() =>
      flattenFactsArg({ wages: 1, income: { wages: 2 } }),
    ).toThrowError(/more than once/);
  });
});

describe("grouped and flat inputs build identical engine facts", () => {
  const flat = {
    filingStatus: "mfj",
    wages: 32000,
    spouseIsAge65OrOlder: true,
    taxableIraDistributions: 7350,
    taxablePensionsAndAnnuities: 10900,
    socialSecurityBenefits: 18535,
    federalTaxWithheld: 3200,
    asOf: "2025-12-31",
  };
  const grouped = {
    filing: { filingStatus: "mfj", spouseIsAge65OrOlder: true },
    income: { wages: 32000 },
    retirement: {
      taxableIraDistributions: 7350,
      taxablePensionsAndAnnuities: 10900,
      socialSecurityBenefits: 18535,
    },
    payments_estimates: { federalTaxWithheld: 3200 },
    asOf: "2025-12-31",
  };

  it("computes the retirement case the old schema silently mangled (Form 8606 value-set regression)", () => {
    const viaGrouped = buildFactsValidated(grouped);
    const viaFlat = buildFactsValidated(flat);
    expect(viaGrouped).toEqual(viaFlat);
    expect(viaGrouped.target).toBe("us.federal.balance_due");
    const { value } = evaluate(corpus, viaGrouped.facts, {
      asOf: viaGrouped.asOf,
      target: viaGrouped.target,
    });
    expect(value.type).toBe("money");
    if (value.type === "money") {
      // expected return: tax $2,754, withheld $3,200 → $446 refund
      expect(value.cents).toBe(-44600n);
    }
  });

  it("coerces int facts given as JSON numbers", () => {
    const { facts } = buildFacts({
      filingStatus: "mfj",
      wages: 50000,
      qualifyingChildren: 2,
      asOf: "2025-12-31",
    });
    expect(facts.qualifyingChildren).toEqual({ type: "int", value: "2" });
  });
});

describe("domain tools compute through the shared validator", () => {
  it("business: § 163(j) fixture 102 reproduces to the cent", () => {
    const { facts, asOf, target } = buildFactsValidated(
      {
        entityLegalForm: "corporation",
        corpGrossIncome: 2000000,
        corpOrdinaryDeductions: 500000,
        corpBusinessInterestExpense: 600000,
        corpAvgGrossReceipts3yr: 40000000,
        asOf: "2026-07-07",
      },
      "us.federal.corp.entity_level_income_tax",
    );
    expect(target).toBe("us.federal.corp.entity_level_income_tax");
    const { value } = evaluate(corpus, facts, { asOf, target });
    if (value.type === "money") expect(value.cents).toBe(22050000n);
    else expect.fail("expected money");
  });

  it("business default target is NOT overridden by federalTaxWithheld", () => {
    const { target } = buildFactsValidated(
      { entityLegalForm: "corporation", asOf: "2026-07-07" },
      "us.federal.corp.entity_level_income_tax",
    );
    expect(target).toBe("us.federal.corp.entity_level_income_tax");
  });

  it("refuses to compute without asOf instead of defaulting to today", () => {
    expect(() => buildFactsValidated({ filingStatus: "mfs", wages: 1000 })).toThrowError(
      /asOf is required/,
    );
  });
});

describe("the documents compiler (transcription, not judgment)", () => {
  it("derives ages, classifications, Part IV withholding, and penalty exemptions", () => {
    const { facts, documentNotes } = buildFactsValidated({
      filing: { filingStatus: "mfs", spouseItemizes: false },
      documents: {
        taxpayerDateOfBirth: "1961-05-10", // 64 at end of 2025: over 59½, under 65
        w2s: [{ box1: 160368, box2: 5000, box3: 168600, box5: 164772, box6: 2400 }],
        f1099rs: [{ box1: 7000, box2a: 7000, box7: "1", iraSepSimple: true }],
        dependents: [
          { dateOfBirth: "2021-12-12" }, // 4: CTC qualifying child, always
          { dateOfBirth: "1988-01-15", isPermanentlyDisabled: true }, // ODC + EIC child + CDCC
        ],
      },
      asOf: "2025-12-31",
    });
    expect(facts.wages).toEqual({ type: "money", value: "16036800" });
    expect(facts.socialSecurityWages).toEqual({ type: "money", value: "16860000" });
    expect(facts.medicareWages).toEqual({ type: "money", value: "16477200" });
    // box 5 under the $200k § 3102(f) trigger: the small box-6 excess over
    // 1.45% (2,400 − 2,389.19) is employer rounding noise, NOT Part IV
    // withholding — box 2 only
    expect(facts.federalTaxWithheld).toEqual({ type: "money", value: "500000" });
    // code-1 but over 59½ → NO penalty; IRA routing by checkbox
    expect(facts.taxableIraDistributions).toEqual({ type: "money", value: "700000" });
    expect(facts.earlyDistributionSubjectToPenalty).toBeUndefined();
    // statute classification, not checkbox labels
    expect(facts.qualifyingChildren).toEqual({ type: "int", value: "1" });
    expect(facts.otherDependents).toEqual({ type: "int", value: "1" });
    expect(facts.eitcAdditionalQualifyingChildren).toEqual({ type: "int", value: "1" });
    // BOTH qualify for the CDCC: the 4-year-old (under 13) and the disabled adult
    expect(facts.careQualifyingIndividuals).toEqual({ type: "int", value: "2" });
    expect(facts.isAge65OrOlder).toEqual({ type: "bool", value: false });
    expect(documentNotes.length).toBeGreaterThan(3);
  });

  it("rejects the same value arriving both raw and pre-digested", () => {
    expect(() =>
      buildFactsValidated({
        income: { wages: 160368 },
        documents: { w2s: [{ box1: 160368 }] },
        asOf: "2025-12-31",
      }),
    ).toThrowError(/derived from the documents block AND passed directly/);
  });

  it("routes code-3 disability-before-retirement-age to wages and Schedule R income", () => {
    const { facts } = buildFactsValidated({
      filing: { filingStatus: "qss" },
      documents: {
        w2s: [{ box1: 1000, box2: 0 }],
        f1099rs: [
          { box1: 11000, box2a: 11000, box4: 1100, box7: "3", disabilityBeforeRetirementAge: true },
        ],
      },
      asOf: "2025-12-31",
    });
    expect(facts.wages).toEqual({ type: "money", value: "1200000" }); // 1,000 + 11,000
    expect(facts.scheduleRDisabilityIncome).toEqual({ type: "money", value: "1100000" });
    expect(facts.taxablePensionsAndAnnuities).toBeUndefined();
    expect(facts.federalTaxWithheld).toEqual({ type: "money", value: "110000" });
  });

  it("sums SSA-1099 box 5 into socialSecurityBenefits and box 6 into withholding", () => {
    const { facts } = buildFactsValidated({
      filing: { filingStatus: "single" },
      documents: {
        w2s: [{ box1: 20000, box2: 1500 }],
        ssa1099s: [
          { box5: 18000, box6: 900 },
          { box5: 6000 }, // no withholding on this one
        ],
      },
      asOf: "2025-12-31",
    });
    expect(facts.socialSecurityBenefits).toEqual({ type: "money", value: "2400000" }); // 18,000 + 6,000
    // W-2 box 2 (1,500) + SSA-1099 box 6 (900)
    expect(facts.federalTaxWithheld).toEqual({ type: "money", value: "240000" });
  });
});
