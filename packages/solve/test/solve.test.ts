import { describe, expect, it } from "vitest";
import { coerceFacts } from "@invaro/opentax-core";
import { DEFAULT_TARGET, getCorpus } from "@invaro/opentax-corpus-us-federal";
import { compareAcross, findCliffs, HOSTED_CLIFF_LIMITS, invert, marginal, searchRules, sweep } from "@invaro/opentax-solve";

const corpus = getCorpus();
const ASOF = "2025-12-31";
const opts = { asOf: ASOF, target: DEFAULT_TARGET };

describe("sweep", () => {
  it("produces one exact evaluation per step", () => {
    const base = coerceFacts(corpus, { filingStatus: "single" });
    const result = sweep(corpus, base, {
      ...opts,
      vary: "wages",
      fromCents: 4000000n, // $40k — above the childless EITC zone
      toCents: 6000000n,
      stepCents: 1000000n, // $10k
    });
    expect(result.points).toHaveLength(3);
    // $50k point must equal the golden fixture value
    expect(result.points[1]).toEqual({
      inputCents: 5000000n,
      valueCents: 387500n, // Tax Table method
    });
    expect(result.corpusMerkleRoot).toBe(corpus.merkleRoot);
  });
});

describe("marginal", () => {
  it("reports the 12% statutory rate inside the second bracket", () => {
    const base = coerceFacts(corpus, { filingStatus: "single" });
    const m = marginal(corpus, base, {
      ...opts,
      vary: "wages",
      atCents: 5000000n, // $50,000 -> taxable $34,250, mid-12%-bracket
    });
    expect(m.rateBps).toBe(1200n);
    expect(m.marginalCents).toBe(1200n); // 12% of the $100 delta
  });
});

describe("findCliffs", () => {
  it("refuses scans too large to finish, before evaluating anything", () => {
    const base = coerceFacts(corpus, { filingStatus: "single" });
    const huge = { ...opts, vary: "wages", fromCents: 0n, toCents: 100_000_000_000_000n, stepCents: 1n };
    const started = Date.now();
    expect(() => findCliffs(corpus, base, { ...huge, limits: HOSTED_CLIFF_LIMITS })).toThrow(RangeError);
    expect(Date.now() - started).toBeLessThan(100);
    expect(() => findCliffs(corpus, base, { ...opts, vary: "wages", fromCents: 500n, toCents: 100n })).toThrow(RangeError);
  });

  it("stops at its evaluation budget when every cent is a cliff, instead of bisecting forever", () => {
    // the S-corp passive-income tax has a slope far above 1, so naive bisection probes every cent
    const base = coerceFacts(corpus, {
      sCorpHasAccumulatedEandP: true,
      sCorpGrossReceipts: 4000000,
      sCorpNetPassiveIncome: "1000000000000",
      sCorpTaxableIncomeAsC: "100000000000000",
      sCorpRecognizedBuiltInGain: 0,
    });
    const started = Date.now();
    const result = findCliffs(corpus, base, {
      ...opts,
      target: "us.federal.corp.s_corp_entity_taxes",
      vary: "sCorpPassiveInvestmentIncome",
      fromCents: 100000100n,
      toCents: 102000100n,
      stepCents: 500n * 100n,
      limits: HOSTED_CLIFF_LIMITS,
    });
    expect(result.truncated).toBe(true);
    expect(result.cliffs.length).toBeLessThanOrEqual(200);
    expect(Date.now() - started).toBeLessThan(20_000);
  });

  it("finds the EITC investment-income kill switch at exactly $11,950", () => {
    const base = coerceFacts(corpus, {
      filingStatus: "hoh",
      wages: 30000,
      qualifyingChildren: 2,
      // analysis mode: the EIC TABLE (the filing default) has a real ~$10.53
      // step at every $50 bracket edge, so a cliff scan would find dozens of
      // true mini-cliffs; the continuous formula isolates the kill switch
      useFormulaMethod: true,
    });
    const result = findCliffs(corpus, base, {
      ...opts,
      vary: "taxableInterest",
      fromCents: 1000000n, // $10k
      toCents: 1400000n, // $14k
      stepCents: 100000n, // $1,000 scan
    });
    expect(result.cliffs).toHaveLength(1);
    const cliff = result.cliffs[0];
    // last safe cent is $11,950.00; one more cent kills the whole credit
    expect(cliff.atCents).toBe(1195000n);
    // the jump is the entire remaining EITC (plus a negligible tax delta)
    expect(cliff.jumpCents >= 323000n && cliff.jumpCents <= 324000n).toBe(true);
  });

  it("finds a CTC phase-out step at the $412,000 boundary (fine scan)", () => {
    const base = coerceFacts(corpus, {
      filingStatus: "mfj",
      qualifyingChildren: 2,
    });
    const result = findCliffs(corpus, base, {
      ...opts,
      vary: "wages",
      fromCents: 41199000n, // $411,990
      toCents: 41201000n, // $412,010
      stepCents: 100n, // $1 scan
    });
    expect(result.cliffs.length).toBeGreaterThanOrEqual(1);
    const atBoundary = result.cliffs.find((c) => c.atCents === 41200000n);
    expect(atBoundary, "cliff at exactly $412,000").toBeDefined();
    // "or fraction thereof": one cent past an exact multiple costs $50
    expect(
      atBoundary!.jumpCents >= 5000n && atBoundary!.jumpCents <= 5001n,
    ).toBe(true);
  });
});

describe("invert", () => {
  it("recovers the wages that first reach a known tax", () => {
    const base = coerceFacts(corpus, { filingStatus: "single" });
    const result = invert(corpus, base, {
      ...opts,
      vary: "wages",
      goalCents: 387150n, // the fixture-pinned tax at $50,000
      loCents: 3000000n, // above the childless-EITC region (monotone here)
      hiCents: 10000000n,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.valueCents).toBe(387500n);
      // the TRUE minimal input is a few cents below $50,000 — half-up
      // rounding maps a 4-cent band of wages onto the same tax. The
      // bisection finds the exact first cent, which is the point.
      expect(
        result.inputCents <= 5000000n && result.inputCents >= 4999900n,
      ).toBe(true);
    }
  });

  it("refuses when the target is not monotone in the range", () => {
    // include the low-income region where EITC makes net tax DECREASE
    const base = coerceFacts(corpus, {
      filingStatus: "single",
      isAtLeastAge25: true,
    });
    const result = invert(corpus, base, {
      ...opts,
      vary: "wages",
      goalCents: 100000n,
      loCents: 0n,
      hiCents: 10000000n,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("not-monotone");
  });
});

describe("compareAcross", () => {
  it("evaluates every filing status independently", () => {
    const base = coerceFacts(corpus, {
      filingStatus: "single", // replaced per scenario
      wages: 50000,
      spouseItemizes: false, // demanded by the MFS scenario
    });
    const result = compareAcross(corpus, base, {
      ...opts,
      vary: "filingStatus",
    });
    const byStatus = Object.fromEntries(
      result.scenarios.map((s) => [s.value, s]),
    );
    expect(byStatus.single.valueCents).toBe(387500n);
    expect(byStatus.mfs.valueCents).toBe(387500n); // same table below 37%
    expect(byStatus.mfj.valueCents).toBe(185300n); // table row 18,500-18,550
    expect(byStatus.qss.valueCents).toBe(185300n); // joint table
    expect(byStatus.hoh.valueCents).toBe(282500n);
  });
});

describe("searchRules", () => {
  it("finds the kiddie-tax rule by keyword with citation and snippet", () => {
    const hits = searchRules(corpus, "kiddie tax", ASOF);
    expect(hits.length).toBeGreaterThan(0);
    const top = hits[0];
    expect(top.ruleId.toLowerCase()).toContain("kiddie");
    expect(top.citation.source.length).toBeGreaterThan(0);
    expect(top.snippet.length).toBeGreaterThan(0);
    expect(top.snippet.length).toBeLessThanOrEqual(282); // 280 + ellipses
  });

  it("reaches state rules through jurisdiction-name expansion", () => {
    const hits = searchRules(corpus, "california renters credit", ASOF);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].jurisdiction).toBe("us.ca");
  });

  it("returns nothing for out-of-corpus topics instead of guessing", () => {
    expect(searchRules(corpus, "zzz cryptozoology levy", ASOF)).toHaveLength(0);
    // one real corpus word ("allowance") must not make a foreign topic "covered"
    expect(searchRules(corpus, "crypto mining depletion allowance", ASOF)).toHaveLength(0);
  });

  it("respects the asOf window — every hit's effective range contains the date", () => {
    for (const when of ["2025-12-31", "2026-12-31"]) {
      const hits = searchRules(corpus, "standard deduction", when);
      expect(hits.length).toBeGreaterThan(0);
      for (const h of hits) {
        expect(h.effectiveFrom <= when).toBe(true);
        if (h.effectiveTo !== undefined) expect(when < h.effectiveTo).toBe(true);
      }
    }
  });
});
