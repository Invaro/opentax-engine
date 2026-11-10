import { describe, expect, it } from "vitest";
import { coerceFacts } from "@invaro/opentax-core";
import { DEFAULT_TARGET, getCorpus } from "@invaro/opentax-corpus-us-federal";
import { compareAcross, factCheck, findCliffs, HOSTED_CLIFF_LIMITS, invert, lookupParameters, marginal, queryScope, searchRules, sweep } from "@invaro/opentax-solve";

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
  it("scans the last, shorter interval when the range is not a whole number of steps", () => {
    const hoh = coerceFacts(corpus, { filingStatus: "hoh", wages: 30000, qualifyingChildren: 2, isAtLeastAge25: true });
    const at = { asOf: "2026-12-31", target: "us.federal.net_tax", vary: "taxableInterest" };
    // the § 32(i) investment-income cliff at $12,200 sits in the tail of [10,000, 12,500] at a $1,000 step
    const tail = findCliffs(corpus, hoh, { ...at, fromCents: 1_000_000n, toCents: 1_250_000n }).cliffs;
    expect(tail).toContainEqual({ atCents: 1_220_000n, jumpCents: 345_500n });
    // and a range shorter than one step is scanned at all
    expect(findCliffs(corpus, hoh, { ...at, fromCents: 1_210_000n, toCents: 1_230_000n }).cliffs).toContainEqual({ atCents: 1_220_000n, jumpCents: 345_500n });
    expect(tail).toEqual(findCliffs(corpus, hoh, { ...at, fromCents: 1_000_000n, toCents: 1_400_000n }).cliffs);
  });

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

const STATES: Record<string, string> = {
  al: "Alabama", ak: "Alaska", az: "Arizona", ar: "Arkansas", ca: "California", co: "Colorado",
  ct: "Connecticut", de: "Delaware", fl: "Florida", ga: "Georgia", hi: "Hawaii", id: "Idaho",
  il: "Illinois", in: "Indiana", ia: "Iowa", ks: "Kansas", ky: "Kentucky", la: "Louisiana",
  me: "Maine", md: "Maryland", ma: "Massachusetts", mi: "Michigan", mn: "Minnesota",
  ms: "Mississippi", mo: "Missouri", mt: "Montana", ne: "Nebraska", nv: "Nevada",
  nh: "New Hampshire", nj: "New Jersey", nm: "New Mexico", ny: "New York", nc: "North Carolina",
  nd: "North Dakota", oh: "Ohio", ok: "Oklahoma", or: "Oregon", pa: "Pennsylvania",
  ri: "Rhode Island", sc: "South Carolina", sd: "South Dakota", tn: "Tennessee", tx: "Texas",
  ut: "Utah", vt: "Vermont", va: "Virginia", wa: "Washington", wv: "West Virginia",
  wi: "Wisconsin", wy: "Wyoming",
};
const TOPICS = ["standard deduction", "personal exemption", "income tax", "earned income credit", "child tax credit", "retirement income exclusion"];
const jurisdictionOf = (ruleId: string) => ruleId.split(".").slice(0, 2).join(".");

describe("queryScope", () => {
  it("reads a query with no state as federal", () => {
    expect(queryScope("standard deduction").jurisdictions).toEqual(["us.federal"]);
    expect(queryScope("NIIT threshold for MFJ").jurisdictions).toEqual(["us.federal"]);
  });

  it("names the state from its full name, whatever the case", () => {
    for (const [code, name] of Object.entries(STATES)) {
      for (const q of [`${name} standard deduction`, `standard deduction in ${name.toLowerCase()}`, `${name.toUpperCase()} EITC`]) {
        expect(queryScope(q).jurisdictions, q).toEqual([`us.${code}`]);
      }
    }
  });

  it("does not confuse a state with one whose name contains it", () => {
    expect(queryScope("west virginia personal exemption").jurisdictions).toEqual(["us.wv"]);
    expect(queryScope("arkansas standard deduction").jurisdictions).toEqual(["us.ar"]);
    expect(queryScope("kansas city earnings tax").jurisdictions).toEqual(["us.mo"]);
    for (const dc of ["washington dc", "Washington DC", "Washington, D.C.", "D.C.", "District of Columbia"]) {
      expect(queryScope(`${dc} standard deduction`).jurisdictions, dc).toEqual(["us.dc"]);
    }
    expect(queryScope("Washington state capital gains tax").jurisdictions).toEqual(["us.wa"]);
    expect(queryScope("nyc resident tax").jurisdictions).toEqual(["us.ny"]);
    expect(queryScope("new mexico rebate").jurisdictions).toEqual(["us.nm"]);
  });

  it("reads a state and the word federal as the state, and factCheck asks which", () => {
    expect(queryScope("Missouri federal tax deduction").jurisdictions).toEqual(["us.mo"]);
    expect(factCheck(corpus, "federal standard deduction for a California resident", 1575000n, "2025-12-31").verdict).toBe("unknown");
    expect(factCheck(corpus, "New York and New Jersey standard deduction", 800000n, "2025-12-31").verdict).toBe("unknown");
  });

  it("reads a capitalized two-letter code, and flags the ones that are also words", () => {
    expect(queryScope("CA standard deduction").jurisdictions).toEqual(["us.ca"]);
    expect(queryScope("standard deduction (NY)").jurisdictions).toEqual(["us.ny"]);
    expect(queryScope("ca standard deduction").jurisdictions).toEqual(["us.federal"]);
    const or = queryScope("standard deduction single OR mfj");
    expect(or.jurisdictions).toEqual(["us.federal"]);
    expect(or.unclearStateCodes).toEqual(["OR"]);
    expect(queryScope("DC plan contribution limit").unclearStateCodes).toEqual(["DC"]);
    // written as N.Y., as a possessive, or in an all-caps query
    for (const q of ["N.Y. standard deduction", "NY's standard deduction", "NY STANDARD DEDUCTION"]) {
      expect(queryScope(q).jurisdictions, q).toEqual(["us.ny"]);
    }
    expect(queryScope("STANDARD DEDUCTION IN 2026").unclearStateCodes).toEqual(["IN"]);
    expect(queryScope("Guam standard deduction").jurisdictions).toEqual(["us.gu"]);
    // a form number is not a state
    expect(queryScope("Form MO-1040 line 14 and Schedule SE").jurisdictions).toEqual(["us.federal"]);
  });

  it("reads a tax year, a filing status and whether the query asks for a rate", () => {
    expect(queryScope("standard deduction married filing jointly 2025")).toMatchObject({ taxYear: 2025, filingStatus: "mfj" });
    expect(queryScope("TY2026 head of household standard deduction")).toMatchObject({ taxYear: 2026, filingStatus: "hoh" });
    expect(queryScope("standard deduction for tax year 2025, mfj")).toMatchObject({ taxYear: 2025, filingStatus: "mfj" });
    expect(queryScope("standard deduction 2009").taxYear).toBe(2009);
    expect(queryScope("section 2032A valuation").taxYear).toBeUndefined();
    expect(queryScope("single-family home sale exclusion").filingStatus).toBeUndefined();
    expect(queryScope("standard deduction").taxYear).toBeUndefined();
    expect(queryScope("standard deduction 2025 vs 2026").taxYear).toBeUndefined();
    expect(queryScope("Rev. Proc. 2025-32 standard deduction").taxYear).toBeUndefined();
    expect(queryScope("is the CTC $2,000 per child").taxYear).toBeUndefined();
    expect(queryScope("single or joint standard deduction").filingStatus).toBeUndefined();
    expect(queryScope("net investment income tax rate").asksForRate).toBe(true);
    expect(queryScope("what percent is the NIIT").asksForRate).toBe(true);
    expect(queryScope("3.8% surtax").asksForRate).toBe(true);
    expect(queryScope("NIIT threshold").asksForRate).toBe(false);
  });
});

describe("lookupParameters", () => {
  it("answers a query that names no state from federal law", () => {
    for (const when of ["2025-12-31", "2026-06-30", "2027-12-31"]) {
      const hits = lookupParameters(corpus, "standard deduction", when);
      expect(hits[0].ruleId).toBe("us.federal.standard_deduction.base_amount");
      for (const h of hits) expect(h.jurisdiction).toBe("us.federal");
    }
    expect(lookupParameters(corpus, "standard deduction", "2026-06-30")[0].byFilingStatus.mfj).toBe("3220000");
  });

  it("never mixes another jurisdiction into a federal answer", () => {
    for (const topic of [...TOPICS, "child tax credit per child", "net investment income threshold", "salt cap", "tips deduction cap"]) {
      const hits = lookupParameters(corpus, topic, "2026-06-30");
      for (const h of hits) expect(h.jurisdiction, `${topic} -> ${h.ruleId}`).toBe("us.federal");
    }
  });

  it("answers a query that names a state from that state only", () => {
    for (const [code, name] of Object.entries(STATES)) {
      for (const topic of TOPICS) {
        for (const h of lookupParameters(corpus, `${name} ${topic}`, "2025-12-31")) {
          expect(h.jurisdiction, `${name} ${topic} -> ${h.ruleId}`).toBe(`us.${code}`);
          expect(jurisdictionOf(h.ruleId)).toBe(`us.${code}`);
        }
      }
    }
    expect(lookupParameters(corpus, "alabama standard deduction", "2025-12-31")[0].ruleId).toBe("us.al.standard_deduction");
    expect(lookupParameters(corpus, "AL standard deduction", "2025-12-31")[0].ruleId).toBe("us.al.standard_deduction");
    expect(lookupParameters(corpus, "CA renter's credit", "2025-12-31")[0].ruleId).toBe("us.ca.renters_credit");
  });

  it("uses the year in the query when no date is given", () => {
    const hits = lookupParameters(corpus, "standard deduction 2025");
    expect(hits[0].byFilingStatus.mfj).toBe("3150000");
    for (const h of hits) expect(h.effectiveFrom <= "2025-12-31").toBe(true);
    // an explicit date wins
    expect(lookupParameters(corpus, "standard deduction 2025", "2026-06-30")[0].byFilingStatus.mfj).toBe("3220000");
  });

  it("finds the child tax credit amount", () => {
    const top = lookupParameters(corpus, "child tax credit per child", "2025-12-31")[0];
    expect(top.ruleId).toBe("us.federal.ctc.tentative");
    expect(top.parameters.perChild).toBe("220000");
  });

  it("returns nothing for a place the corpus does not hold", () => {
    expect(lookupParameters(corpus, "washington dc standard deduction", "2025-12-31")).toEqual([]);
    expect(lookupParameters(corpus, "puerto rico standard deduction", "2025-12-31")).toEqual([]);
  });
});

describe("factCheck", () => {
  const WHEN = "2026-06-30";
  it("verifies the federal standard deduction against the federal rule", () => {
    for (const [status, cents] of [["mfj", 3220000n], ["single", 1610000n], ["hoh", 2415000n]] as const) {
      const r = factCheck(corpus, "standard deduction", cents, WHEN, status);
      expect(r.verdict).toBe("verified");
      if (r.verdict !== "verified") continue;
      expect(r.matchedRuleId).toBe("us.federal.standard_deduction.base_amount");
      expect(r.matchedField).toBe(`byFilingStatus.${status}`);
      expect(r.jurisdiction).toBe("us.federal");
      expect(r.citation.section).toContain("Rev. Proc. 2025-32");
    }
  });

  it("refutes a wrong federal figure with the federal amount for that status", () => {
    const r = factCheck(corpus, "standard deduction", 3000000n, WHEN, "mfj");
    expect(r.verdict).toBe("refuted");
    if (r.verdict !== "refuted") return;
    expect(r.matchedRuleId).toBe("us.federal.standard_deduction.base_amount");
    expect(r.actualCents).toBe("3220000");
    // the single amount is not the joint amount
    expect(factCheck(corpus, "standard deduction", 1610000n, WHEN, "mfj").verdict).toBe("refuted");
    // nor is a state's amount for another status: Alabama's joint maximum is not its single one
    const al = lookupParameters(corpus, "Alabama standard deduction", "2025-12-31")[0];
    expect(al.parameters.maxMfj).not.toBe(al.parameters.maxSingle);
    expect(factCheck(corpus, "Alabama standard deduction", BigInt(al.parameters.maxMfj), "2025-12-31", "mfj").verdict).toBe("verified");
    // the joint figure claimed for a single filer is in the law under another name: not confirmed, not refuted
    expect(factCheck(corpus, "Alabama standard deduction", BigInt(al.parameters.maxMfj), "2025-12-31", "single").verdict).toBe("unknown");
    expect(factCheck(corpus, "Alabama standard deduction", BigInt(al.parameters.maxHof), "2025-12-31", "single").verdict).toBe("unknown");
    expect(factCheck(corpus, "Alabama standard deduction", 999900n, "2025-12-31", "single")).toMatchObject({ verdict: "refuted", matchedField: "maxSingle" });
  });

  it("reads the year and the filing status from the query", () => {
    const ok = factCheck(corpus, "standard deduction married filing jointly 2025", 3150000n);
    expect(ok).toMatchObject({ verdict: "verified", matchedField: "byFilingStatus.mfj", asOf: "2025-12-31" });
    const no = factCheck(corpus, "standard deduction married filing jointly 2025", 3220000n);
    expect(no).toMatchObject({ verdict: "refuted", actualCents: "3150000", matchedField: "byFilingStatus.mfj" });
  });

  it("never reaches a verdict through a jurisdiction the query did not name", () => {
    // every money value any state rule holds, claimed for a federal query
    const stateValues = new Set<string>();
    for (const rule of corpus.rules) {
      if (rule.jurisdiction === "us.federal") continue;
      for (const p of Object.values(rule.parameters ?? {})) if (p.type === "money") stateValues.add(String(p.value));
    }
    expect(stateValues.size).toBeGreaterThan(300);
    for (const topic of ["standard deduction", "personal exemption", "earned income credit"]) {
      for (const v of stateValues) {
        const r = factCheck(corpus, topic, BigInt(v), WHEN);
        if (r.verdict === "unknown") continue;
        expect(r.jurisdiction, `${topic} ${v} -> ${r.matchedRuleId}`).toBe("us.federal");
        expect(jurisdictionOf(r.matchedRuleId)).toBe("us.federal");
      }
    }
  }, 60_000);

  it("checks a state claim against that state only", () => {
    for (const [code, name] of Object.entries(STATES)) {
      for (const topic of TOPICS) {
        for (const cents of [3220000n, 1610000n, 100000n]) {
          const r = factCheck(corpus, `${name} ${topic}`, cents, "2025-12-31");
          expect(r.jurisdictions).toEqual([`us.${code}`]);
          if (r.verdict === "unknown") continue;
          expect(jurisdictionOf(r.matchedRuleId), `${name} ${topic} -> ${r.matchedRuleId}`).toBe(`us.${code}`);
        }
      }
    }
  }, 60_000);

  it("does not refute a state claim with an unrelated rule of that state", () => {
    // Colorado and Texas hold no standard deduction of their own
    expect(factCheck(corpus, "Colorado standard deduction", 1610000n, "2025-12-31").verdict).toBe("unknown");
    expect(factCheck(corpus, "Texas standard deduction", 1610000n, "2025-12-31").verdict).toBe("unknown");
    expect(factCheck(corpus, "washington dc standard deduction", 1610000n, "2025-12-31").verdict).toBe("unknown");
  });

  it("answers unknown, not refuted, for a rate", () => {
    for (const q of ["net investment income tax rate", "NIIT rate", "what percent is the net investment income tax", "net investment income tax 3.8%"]) {
      for (const cents of [380n, 4n, 3800n]) {
        const r = factCheck(corpus, q, cents, WHEN);
        expect(r.verdict, q).toBe("unknown");
        if (r.verdict === "unknown") expect(r.message).toMatch(/dollar amounts/);
      }
    }
    // the dollar threshold of the same tax is still checked
    expect(factCheck(corpus, "net investment income tax threshold", 25000000n, WHEN, "mfj")).toMatchObject({ verdict: "verified", matchedRuleId: "us.federal.niit" });
    expect(factCheck(corpus, "net investment income tax threshold", 20000000n, WHEN, "mfj")).toMatchObject({ verdict: "refuted", actualCents: "25000000" });
  });

  it("asks for the state name when a two-letter code is also a word", () => {
    const r = factCheck(corpus, "OR standard deduction", 1610000n, WHEN);
    expect(r.verdict).toBe("unknown");
    if (r.verdict === "unknown") expect(r.message).toMatch(/Oregon/);
  });

  it("answers unknown when nothing matches or the query names no amount", () => {
    expect(factCheck(corpus, "zzz cryptozoology levy", 100n, WHEN).verdict).toBe("unknown");
    expect(factCheck(corpus, "alabama", 100n, WHEN).verdict).toBe("unknown");
    expect(factCheck(corpus, "standard deduction 2019", 1220000n).verdict).toBe("unknown");
  });

  it("compares the parameter the query names, not the rule's other amounts", () => {
    // the SALT rule also holds the old $10,000 as its floor
    expect(factCheck(corpus, "SALT cap", 4040000n, WHEN)).toMatchObject({ verdict: "verified", matchedRuleId: "us.federal.salt_deduction", matchedField: "cap" });
    expect(factCheck(corpus, "SALT cap", 1000000n, WHEN)).toMatchObject({ verdict: "refuted", matchedField: "cap", actualCents: "4040000" });
    expect(factCheck(corpus, "SALT floor", 1000000n, WHEN)).toMatchObject({ verdict: "verified", matchedField: "floor" });
  });

  // asOf null: no date, so a year in the query selects the rules
  const check = (q: string, dollars: number, status?: string, asOf: string | null = "2025-12-31") => {
    const r = factCheck(corpus, q, BigInt(Math.round(dollars * 100)), asOf ?? undefined, status);
    return r.verdict === "unknown" ? "unknown" : `${r.verdict} ${r.matchedRuleId}.${r.matchedField}=${r.actualCents}`;
  };

  it("needs a rule named for everything the query asks about", () => {
    // one shared word ("cap", "exclusion", "deduction") settles nothing
    expect(check("unicorn cap", 10000)).toBe("unknown");
    expect(check("gift tax annual exclusion", 19000)).toBe("unknown");
    expect(check("QCD limit", 108000)).toBe("unknown");
    expect(check("New Jersey standard deduction", 8000)).toBe("unknown");
    // a misspelled or abbreviated state is not read as a federal question
    expect(check("Californa standard deduction", 5706)).toBe("unknown");
    expect(check("Calif. standard deduction", 5706)).toBe("unknown");
    expect(check("NYS standard deduction", 8000)).toBe("unknown");
    expect(check("Guam standard deduction", 15750)).toBe("unknown");
    expect(check("Virginia Woolf royalties standard deduction", 8750)).toBe("unknown");
    // a year with no rules in force
    expect(check("SALT cap 2028", 10000, undefined, null)).toBe("unknown");
    expect(check("standard deduction mfj 2009", 31500, undefined, null)).toBe("unknown");
  });

  it("reads plain questions", () => {
    expect(check("what is the standard deduction for a single filer in 2025?", 15750, undefined, null)).toBe("verified us.federal.standard_deduction.base_amount.byFilingStatus.single=1575000");
    expect(check("standard deduction for head of household", 23625)).toBe("verified us.federal.standard_deduction.base_amount.byFilingStatus.hoh=2362500");
    expect(check("eitc investment income limit", 11950)).toBe("verified us.federal.eitc.investmentLimit=1195000");
    expect(check("CTC is $2,000 per child", 2000)).toBe("refuted us.federal.ctc.tentative.perChild=220000");
  });

  it("does not verify a stale or secondary amount of the right rule", () => {
    // $10,000 is the SALT rule's floor, not its limit
    expect(check("SALT cap", 40000)).toBe("verified us.federal.salt_deduction.cap=4000000");
    expect(check("SALT cap", 10000)).toBe("refuted us.federal.salt_deduction.cap=4000000");
    expect(check("SALT deduction limit 2025", 10000)).toBe("refuted us.federal.salt_deduction.cap=4000000");
    expect(check("SALT floor", 10000)).toBe("verified us.federal.salt_deduction.floor=1000000");
    // with no kind named, the floor's figure is neither confirmed nor refuted
    const r = factCheck(corpus, "salt deduction", 1000000n, "2025-12-31");
    expect(r.verdict).toBe("unknown");
    if (r.verdict === "unknown") expect(r.message).toMatch(/floor.*cap.*\$40,000\.00/);
    // the phase-out threshold is compared only when asked for
    expect(check("CTC", 400000, "mfj")).toBe("unknown");
    expect(check("CTC phase-out threshold", 400000, "mfj")).toBe("verified us.federal.ctc.phaseout_threshold.byFilingStatus.mfj=40000000");
    expect(check("CTC phase-out threshold", 300000, "mfj")).toBe("refuted us.federal.ctc.phaseout_threshold.byFilingStatus.mfj=40000000");
  });

  it("compares a parameter only when the query names what it is an amount of", () => {
    // a bare "CTC" does not say per child or per other dependent
    expect(check("CTC", 2200)).toBe("unknown");
    expect(check("CTC per child", 2200)).toBe("verified us.federal.ctc.tentative.perChild=220000");
    expect(check("child tax credit", 500)).toBe("unknown");
    // parameters of a catch-all rule that are about something else
    expect(check("New York standard deduction", 10000)).toBe("unknown");
    expect(check("earned income credit", 18290, undefined, "2026-06-30")).toBe("unknown");
    expect(check("HSA deduction cap", 4400, undefined, "2026-06-30")).toBe("unknown");
    expect(check("Arkansas child tax credit", 3000)).toBe("unknown");
    expect(check("Connecticut child tax credit", 11950)).toBe("unknown");
    expect(check("child tax credit phase-out", 2200)).toBe("unknown");
  });

  it("says so when the figure is in the law under another name", () => {
    // $2,000 is the ADDITIONAL standard deduction for an unmarried filer
    const r = factCheck(corpus, "standard deduction single", 200000n, "2025-12-31");
    expect(r.verdict).toBe("unknown");
    if (r.verdict === "unknown") expect(r.message).toContain("us.federal.standard_deduction.additional");
    expect(check("additional standard deduction", 2000, "single")).toBe("verified us.federal.standard_deduction.additional.amountUnmarried=200000");
    // $1,700 is the refundable part, a different credit
    expect(check("child tax credit", 1700)).toBe("unknown");
    // a true figure on a sibling rule is never refuted
    expect(check("adoption credit", 17670, "single", "2026-06-30")).toBe("unknown");
    expect(check("child tax credit maximum", 2200)).toBe("unknown");
    // and a refuted answer reports the asked rule's amount, not a sibling's
    expect(check("standard deduction", 16100, "mfj", "2026-06-30")).toBe("refuted us.federal.standard_deduction.base_amount.byFilingStatus.mfj=3220000");
  });

  it("compares the amount for the claim's filing status", () => {
    expect(check("overtime deduction cap", 25000, "mfj")).toBe("verified us.federal.overtime_deduction.capJoint=2500000");
    expect(check("overtime deduction cap", 30000, "mfj")).toBe("refuted us.federal.overtime_deduction.capJoint=2500000");
    // the other statuses' cap, a surviving spouse, a status the formula treats specially: not settled
    expect(check("overtime deduction cap", 12500, "mfj")).toBe("unknown");
    expect(check("overtime deduction cap", 25000, "qss")).toBe("unknown");
    expect(check("overtime deduction cap", 12500, "mfs")).toBe("unknown");
    expect(check("capital loss limit married filing separately", 1500)).toBe("verified us.federal.capital_loss_ordinary_offset.limitMfs=150000");
    expect(check("capital loss limit married filing separately", 3000)).toBe("unknown");
    expect(check("Georgia standard deduction mfj", 24000)).toBe("verified us.ga.standard_deduction.joint=2400000");
    expect(check("Georgia standard deduction mfj", 12000)).toBe("unknown");
    expect(check("Georgia standard deduction", 24000, "qss")).toBe("unknown");
    expect(check("Nebraska standard deduction", 8600, "mfs")).toBe("unknown");
    expect(check("Missouri standard deduction", 31500, "mfj")).toBe("unknown");
    // the formula halves the SALT cap for separate filers, which no parameter states
    expect(check("SALT cap married filing separately", 40000)).toBe("unknown");
    expect(check("SALT cap married filing separately", 20000)).toBe("unknown");
    // three different filing-status tables in one rule cannot be told apart
    expect(check("saver's credit", 47500, "mfj")).toBe("unknown");
    // "married" alone is not one status
    expect(check("standard deduction married", 32200, undefined, "2026-06-30")).toBe("verified us.federal.standard_deduction.base_amount.byFilingStatus.mfj=3220000");
  });

  it("treats a short or lowercase word as part of the question", () => {
    // a lowercase state code is not dropped, leaving a federal question
    for (const q of ["ca standard deduction", "ny standard deduction", "Ga. standard deduction", "il exemption"]) {
      const r = factCheck(corpus, q, 1575000n, "2025-12-31", "single");
      expect(r.verdict, q).toBe("unknown");
    }
    expect(queryScope("ca standard deduction").unclearStateCodes).toEqual(["CA"]);
    expect(queryScope("standard deduction in 2026 or 2027").unclearStateCodes).toEqual([]);
    // nor is a two-letter subject
    expect(check("EV credit", 7500)).toBe("unknown");
    expect(check("SE tax", 250000, "mfj")).toBe("unknown");
  });

  it("does not let the date override a year the query names", () => {
    expect(check("standard deduction 2025", 16100, "single", "2026-06-30")).toBe("unknown");
    expect(check("2025 standard deduction", 15750, "single", "2026-06-30")).toBe("unknown");
    expect(check("2025 standard deduction", 15750, "single", "2025-06-30")).toBe("verified us.federal.standard_deduction.base_amount.byFilingStatus.single=1575000");
  });

  it("does not answer from a lower-ranked rule, a mention in a title, or an amount it cannot see", () => {
    // Ohio's exemption amounts are numbered by income tier; the $20 credit is another rule
    expect(check("Ohio exemption amount", 20)).toBe("unknown");
    // the homestead credit's title mentions the senior credit
    expect(check("West Virginia senior citizens tax credit", 1000)).toBe("unknown");
    // "joint filing credit" is a credit's name, not a filing status
    expect(check("Ohio joint filing credit", 650)).toBe("verified us.oh.joint_filing_credit.creditCap=65000");
    // a true figure the query names loosely, or that only the formula holds, is never refuted
    expect(check("tips deduction MAGI limit", 150000)).toBe("unknown");
    expect(check("Maryland personal exemption", 1600)).toBe("unknown");
    expect(check("Maryland personal exemption", 3200)).toBe("verified us.md.exemption_amount.perExemption=320000");
    expect(check("qbi threshold", 197300, "single")).toBe("unknown");
    // a query too long to be read whole
    expect(check("alpha bravo charlie delta echo foxtrot golf hotel india juliet kilo lima mike standard deduction", 15750)).toBe("unknown");
  });

  it("compares the numbered parameter the query names", () => {
    expect(check("New Jersey child tax credit tier 1 max", 30000)).toBe("verified us.nj.ctc.tier1Max=3000000");
    expect(check("New Jersey child tax credit tier 1 max", 80000)).toBe("unknown");
    // Delaware's formula holds its own copy of the brackets, so the parameter's role is not known
    expect(check("Delaware income tax bracket 2", 5000)).toBe("unknown");
    // no number named: which maximum is not said
    expect(check("earned income credit", 8046)).toBe("unknown");
    expect(check("EITC max 3", 8046)).toBe("verified us.federal.eitc.max3=804600");
    expect(check("EITC max 2", 7152)).toBe("verified us.federal.eitc.max2=715200");
    expect(check("EITC max 2", 7000)).toBe("refuted us.federal.eitc.max2=715200");
    // the figure for three children claimed for two
    expect(check("EITC max 2", 8046)).toBe("unknown");
  });

  it("answers unknown for a figure that may be a rate, or that the rule derives", () => {
    expect(check("NIIT", 3.8)).toBe("unknown");
    expect(check("Illinois income tax", 4.95)).toBe("unknown");
    // 20% of the $10,000 expense cap
    expect(check("lifetime learning credit maximum", 2000)).toBe("unknown");
  });

  it("does not take the base of a percentage, one of two fitting amounts, or a gated amount as the answer", () => {
    // 26 U.S.C. § 25A(c)(1): 20 percent of expenses up to $10,000, so the credit's maximum is $2,000
    expect(check("lifetime learning credit maximum", 10000)).toBe("unknown");
    expect(check("lifetime learning credit cap", 10000)).toBe("unknown");
    expect(check("lifetime learning credit", 10000)).toBe("unknown");
    // Rev. Proc. 2025-32 § 2.12: a $400 minimum deduction, for at least $1,000 of qualified business income
    expect(check("QBI deduction minimum", 1000, undefined, "2026-06-30")).toBe("unknown");
    expect(check("QBI deduction minimum", 400, undefined, "2026-06-30")).toBe("unknown");
    // a married taxpayer must file jointly to claim the tips deduction
    expect(check("tips deduction cap", 25000, "mfs")).toBe("unknown");
    expect(check("tips deduction cap", 25000, "mfj")).toBe("unknown");
    expect(check("tips deduction cap", 25000)).toBe("verified us.federal.tips_deduction.cap=2500000");
    expect(check("tips deduction cap", 20000)).toBe("refuted us.federal.tips_deduction.cap=2500000");
    // the wage base is a base too, and is compared when named
    // (the taxpayer's and the spouse's Schedule SE rules hold the same base)
    expect(check("SE tax wage base", 176100)).toMatch(/^verified us\.federal\.se_tax\.(taxpayer|spouse)\.wageBase=17610000$/);
  });

  it("never settles a query that asks for a rate, whatever the figure", () => {
    expect(check("standard deduction rate", 32200, "mfj", "2026-06-30")).toBe("unknown");
    expect(check("SALT cap rate", 40400, undefined, "2026-06-30")).toBe("unknown");
    expect(check("top marginal rate", 37)).toBe("unknown");
    const r = factCheck(corpus, "standard deduction", 5000n, "2026-06-30", "mfj");
    expect(r.verdict).toBe("unknown");
    if (r.verdict === "unknown") expect(r.message).toMatch(/under \$100.*explain_rule/);
  });

  it("does not answer a question about an unnamed state from federal law", () => {
    expect(check("state standard deduction", 32200, "mfj", "2026-06-30")).toBe("unknown");
    expect(check("my state's standard deduction", 32200, "mfj", "2026-06-30")).toBe("unknown");
    // beside a named state the word adds nothing; in "state and local tax" it is the rule's name
    expect(check("California state standard deduction", 5706, "single")).toBe("verified us.ca.standard_deduction.singleMfs=570600");
    expect(check("state and local tax deduction cap", 40000)).toBe("verified us.federal.salt_deduction.cap=4000000");
    // "IRS" and "federal" are federal
    expect(check("IRS standard deduction", 32200, "mfj", "2026-06-30")).toBe("verified us.federal.standard_deduction.base_amount.byFilingStatus.mfj=3220000");
  });

  it("reads a bare joint or separate as the status unless a rule is named with it", () => {
    expect(check("joint standard deduction", 32200, undefined, "2026-06-30")).toBe("verified us.federal.standard_deduction.base_amount.byFilingStatus.mfj=3220000");
    expect(check("joint standard deduction", 16100, undefined, "2026-06-30")).toBe("refuted us.federal.standard_deduction.base_amount.byFilingStatus.mfj=3220000");
    expect(check("separate standard deduction", 16100, undefined, "2026-06-30")).toBe("verified us.federal.standard_deduction.base_amount.byFilingStatus.mfs=1610000");
    expect(check("Ohio joint filing credit", 650)).toBe("verified us.oh.joint_filing_credit.creditCap=65000");
    expect(check("standard deduction TY2025", 31500, "mfj", null)).toBe("verified us.federal.standard_deduction.base_amount.byFilingStatus.mfj=3150000");
    // "married" is joint or separate, never single
    expect(check("standard deduction for married couples", 16100, undefined, "2026-06-30")).toBe("verified us.federal.standard_deduction.base_amount.byFilingStatus.mfs=1610000");
    expect(check("standard deduction for married couples", 24150, undefined, "2026-06-30")).toBe("unknown");
    // "me" is a pronoun
    expect(queryScope("what standard deduction applies to me").unclearStateCodes).toEqual([]);
  });

  it("holds the examples the changelog gives", () => {
    const Y26 = "2026-06-30";
    expect(check("standard deduction", 32200, "mfj", Y26)).toBe("verified us.federal.standard_deduction.base_amount.byFilingStatus.mfj=3220000");
    // Rev. Proc. 2025-32 § 4.14(3): $2,050 is the additional amount for an unmarried filer
    const extra = factCheck(corpus, "standard deduction", 205000n, Y26);
    expect(extra.verdict).toBe("unknown");
    if (extra.verdict === "unknown") expect(extra.message).toContain("us.federal.standard_deduction.additional");
    // nothing federal is named for a renter's credit
    expect(check("renters credit", 60, undefined, Y26)).toBe("unknown");
    // a filing status passed that differs from the query's is not settled either way
    expect(check("standard deduction married filing jointly", 32200, "single", Y26)).toBe("unknown");
    expect(check("standard deduction head of household", 16100, "single", Y26)).toBe("unknown");
    expect(check("standard deduction married filing jointly", 32200, "mfj", Y26)).toBe("verified us.federal.standard_deduction.base_amount.byFilingStatus.mfj=3220000");
    // the floor does not stand in the way of refuting a claim about the cap, nor a table's other statuses
    expect(check("SALT cap", 10000, undefined, Y26)).toBe("refuted us.federal.salt_deduction.cap=4040000");
    expect(check("standard deduction", 16100, "mfj", Y26)).toBe("refuted us.federal.standard_deduction.base_amount.byFilingStatus.mfj=3220000");
  });

  it("does not answer for a year from a rule that has run out", () => {
    // Vermont's 2025 standard deduction rule ends with 2025; another rule still lists the 2025 amount
    expect(check("Vermont standard deduction", 7650, "single", "2025-12-31")).toBe("verified us.vt.standard_deduction.single=765000");
    const r = factCheck(corpus, "Vermont standard deduction", 765000n, "2026-12-31", "single");
    expect(r.verdict).toBe("unknown");
    if (r.verdict === "unknown") expect(r.message).toMatch(/us\.vt\.standard_deduction.*no version in force on 2026-12-31/);
    expect(check("Vermont standard deduction", 7850, "single", "2026-12-31")).toBe("unknown");
  });

  it("answers from the rule whose own id is the query, not one that mentions it", () => {
    // each figure belongs to a credit or deduction whose title has the words "income" and "tax"
    expect(check("New Mexico income tax maximum", 350, undefined, "2026-06-30")).toBe("unknown");
    expect(check("Rhode Island income tax limit", 40730)).toBe("unknown");
    expect(check("California income tax limit", 32901)).toBe("unknown");
    expect(check("Missouri income tax cap", 5000)).toBe("unknown");
  });

  it("compares only the statuses a query lists", () => {
    const Y26 = "2026-06-30";
    expect(check("standard deduction single vs head of household", 32200, undefined, Y26)).toBe("unknown");
    expect(check("standard deduction single vs head of household", 24150, undefined, Y26)).toBe("verified us.federal.standard_deduction.base_amount.byFilingStatus.hoh=2415000");
  });

  it("compares an amount at a filing status only where the rule states it for that status", () => {
    // $312 is North Dakota's marriage penalty credit maximum: a joint-return credit
    expect(check("North Dakota marriage penalty credit maximum", 312, "single")).toBe("unknown");
    // New Jersey's $15,000 property tax deduction cap is $7,500 for separate filers in one home
    expect(check("New Jersey property tax deduction cap", 15000, "mfs")).toBe("unknown");
    expect(check("child tax credit per child", 2200, "mfj")).toBe("unknown");
    expect(check("child tax credit per child", 2200)).toBe("verified us.federal.ctc.tentative.perChild=220000");
    // labelled for the status
    expect(check("EITC threshold kids", 30470, "mfj")).toBe("verified us.federal.eitc.thresholdMFJKids=3047000");
    // "other" is everyone else, which a formula can still shut out (Oklahoma's credit is $0 for separate filers)
    expect(check("EITC threshold kids", 23350, "single")).toBe("unknown");
    expect(check("Oklahoma earned income credit threshold 0", 8790, "mfs")).toBe("unknown");
    expect(check("EITC threshold kids", 23350)).toBe("verified us.federal.eitc.thresholdOtherKids=2335000");
    // a status passed that is not one the query lists
    expect(check("standard deduction single or head of household", 32200, "mfj", "2026-06-30")).toBe("unknown");
    expect(check("standard deduction married", 24150, "hoh", "2026-06-30")).toBe("unknown");
  });

  it("does not take a rule titled for one year as another year's figure", () => {
    // North Dakota's and Vermont's 2025 parameter sets stay in force into 2026
    expect(check("North Dakota stillborn child deduction", 5241, undefined, "2026-12-31")).toBe("unknown");
    expect(check("vermont parameters personal exemption", 5300, undefined, "2026-12-31")).toBe("unknown");
    expect(check("Delaware standard deduction", 3250, undefined, "2026-12-31")).toBe("unknown");
    expect(check("Delaware standard deduction", 3250, undefined, "2025-12-31")).not.toBe("refuted");
    // rules titled for the year asked still answer
    expect(check("standard deduction", 32200, "mfj", "2026-06-30")).toBe("verified us.federal.standard_deduction.base_amount.byFilingStatus.mfj=3220000");
    expect(check("California standard deduction", 5900, "single", "2026-06-30")).toBe("verified us.ca.standard_deduction.singleMfs=590000");
  });

  it("does not take a base or a threshold for the amount", () => {
    // Vermont: 10% of the first $2,500 contributed per beneficiary, so the credit is $250
    expect(check("Vermont Higher Education Investment Plan credit per beneficiary", 2500)).toBe("unknown");
    expect(check("Vermont Higher Education Investment Plan credit per beneficiary", 250)).toBe("unknown");
    // Minnesota's `limitThreshold` is where the reduction starts, not a cap
    expect(check("Minnesota standard deduction cap", 238950)).toBe("unknown");
  });

  it("holds statuses named in the query to the same rule as one passed", () => {
    const Y26 = "2026-06-30";
    // the $12,500 cap is not the married amount: joint filers get $25,000 and separate filers nothing
    expect(check("overtime deduction cap married", 12500, undefined, Y26)).toBe("unknown");
    expect(check("tips deduction magi threshold married", 150000, undefined, Y26)).toBe("unknown");
    expect(check("North Dakota marriage penalty credit maximum single or head of household", 312)).toBe("unknown");
    expect(check("Georgia standard deduction married filing jointly or surviving spouse", 15000, undefined, "2026-12-31")).toBe("unknown");
    // a status beside a rule whose name has "joint" in it still counts
    expect(check("Ohio joint filing credit single", 650)).toBe("unknown");
    expect(check("Ohio joint filing credit", 650)).toBe("verified us.oh.joint_filing_credit.creditCap=65000");
  });

  it("keeps answering where the checks have nothing to object to", () => {
    // 2027: a lapsed mileage rule has "standard" and "deduction" in its title too
    expect(check("standard deduction", 16600, "single", "2027-12-31")).toBe("verified us.federal.standard_deduction.base_amount.byFilingStatus.single=1660000");
    expect(check("standard deduction", 33200, "mfj", "2027-12-31")).toBe("verified us.federal.standard_deduction.base_amount.byFilingStatus.mfj=3320000");
  });

  it("flags a query it did not read whole", () => {
    expect(check(`standard deduction${" ".repeat(520)}California`, 5706, "single")).toBe("verified us.ca.standard_deduction.singleMfs=570600");
    expect(check(`standard deduction ${"x ".repeat(300)}California`, 15750, "single")).toBe("unknown");
    expect(check(`${"what is the ".repeat(40)}additional standard deduction`, 200000)).toBe("unknown");
    // full-width digits are a year
    expect(queryScope("standard deduction ２０２５").taxYear).toBe(2025);
  });

  it("does not pick one of two years the query names", () => {
    expect(check("standard deduction 2025 vs 2026", 31500, "mfj", null)).toBe("unknown");
    expect(check("2025 and 2026 standard deduction", 31500, "mfj", "2026-06-30")).toBe("unknown");
    expect(queryScope("standard deduction 2025 vs 2026").taxYear).toBeUndefined();
  });

  it("does not list a rate as a dollar amount", () => {
    for (const when of ["2025-12-31", "2026-06-30"]) {
      for (const h of lookupParameters(corpus, "residential clean energy credit", when)) {
        for (const name of Object.keys(h.parameters)) expect(name, h.ruleId).not.toMatch(/(Percentage|Percent|Pct|Rate)$/);
      }
    }
  });

  it("rejects a date that is not a date", () => {
    expect(() => factCheck(corpus, "standard deduction", 1610000n, "2026-13-45")).toThrow(RangeError);
    expect(() => factCheck(corpus, "standard deduction", 1610000n, "2026")).toThrow(RangeError);
    expect(() => lookupParameters(corpus, "standard deduction", "next year")).toThrow(RangeError);
    // with no date, every version is compared and the result says which matched
    expect(factCheck(corpus, "standard deduction", 1575000n, undefined, "single")).toMatchObject({ verdict: "verified", effectiveFrom: "2025-01-01", effectiveTo: "2026-01-01" });
  });

  it("verifies the child tax credit and refutes the pre-OBBBA figure", () => {
    expect(factCheck(corpus, "child tax credit per child", 220000n, "2025-12-31")).toMatchObject({ verdict: "verified", matchedRuleId: "us.federal.ctc.tentative", matchedField: "perChild" });
    expect(factCheck(corpus, "child tax credit per child", 200000n, "2025-12-31")).toMatchObject({ verdict: "refuted", matchedRuleId: "us.federal.ctc.tentative", actualCents: "220000" });
  });
});
