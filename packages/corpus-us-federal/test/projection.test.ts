/**
 * Projection mode: tax years after 2027 from each amount's statutory indexing
 * formula at an assumed index growth rate (src/projection.ts, projection-spec.ts).
 *
 * The exact 2027 ratios in the spec come from a separate reproduction of the
 * IRS computation (BLS C-CPI-U as first published, SSA wage index) that
 * reproduces the published 2025, 2026 and 2027 amounts; the expected
 * projected values below were computed by that reproduction, not by this code.
 */
import { describe, expect, it } from "vitest";
import { evaluate, verifyProof } from "@invaro/opentax-core";
import {
  classifyLiterals,
  corpusForVersion,
  corpusInput,
  getCorpus,
  getProjectedFederalCorpus,
  projectCorpusInput,
  projectedValue,
} from "../src/index.js";
import { PROJECTION_PARAMS } from "../src/projection-spec.js";

const m = (d: number) => ({ type: "money" as const, value: String(Math.round(d * 100)) });
const single = (wages: number) => ({ filingStatus: { type: "enum" as const, value: "single" }, wages: m(wages) });
const byId = new Map(PROJECTION_PARAMS.map((p) => [p.id, p]));
const value = (id: string, year: number, inflationPercent: string, wageGrowthPercent?: string) =>
  Number(projectedValue(byId.get(id)!, year, { year, inflationPercent, wageGrowthPercent })) / 100;

describe("projection spec", () => {
  it("classifies every amount in every 2027-only rule: indexed, derived, law, or a declared constant", () => {
    const errors = classifyLiterals(corpusInput).filter((x) => x.error);
    expect(errors).toEqual([]);
  });

  it("reproduces every published 2027 amount from its formula", () => {
    for (const p of PROJECTION_PARAMS) {
      expect(projectedValue(p, 2027, { year: 2027, inflationPercent: "7.3" }).toString(), p.id).toBe(p.published2027);
    }
  });

  it("projects at the assumed rate, matching the independent reproduction", () => {
    // standard deduction: 15,750 + increase rounded down to $50 (§ 63(c)(7)(B)(ii))
    expect(value("standardDeduction.single", 2028, "2.5")).toBe(17050);
    expect(value("standardDeduction.hoh", 2028, "2.5")).toBe(25575); // increase-rounded off the $23,625 base
    expect(value("standardDeduction.joint", 2028, "2.5")).toBe(34100);
    expect(value("brackets.mfj.12_bracket_start", 2028, "2.5")).toBe(26250);
    expect(value("brackets.single.37_bracket_start", 2030, "2.5")).toBe(712225);
    expect(value("eitc.earnedIncomeAmount.1kid", 2030, "2.5")).toBe(14480);
    expect(value("ctc.perChild", 2030, "2.5")).toBe(2500); // $100 rounding down
    expect(value("amt.exemption.joint", 2035, "3")).toBe(183300);
    expect(value("qbi.minDeduction", 2035, "3")).toBe(525);
    expect(value("hsa.limitSelf", 2035, "3")).toBe(5700);
    // the wage base follows the wage index, at the inflation rate unless told otherwise
    expect(value("ssWageBase", 2028, "2.5")).toBe(197100);
    expect(value("ssWageBase", 2035, "3")).toBe(243600);
    expect(value("ssWageBase", 2028, "2.5", "4")).toBeGreaterThan(197100);
  });

  it("at 0% every indexed amount stays at 2027, and law still applies", () => {
    for (const p of PROJECTION_PARAMS) {
      if (p.kind === "law") continue;
      expect(projectedValue(p, 2030, { year: 2030, inflationPercent: "0" }).toString(), p.id).toBe(p.published2027);
    }
    // § 164(b)(7): 101% a year through 2029, $10,000 from 2030
    expect(value("salt.cap", 2028, "0")).toBe(41212.04);
    expect(value("salt.cap", 2029, "0")).toBe(41624.16);
    expect(value("salt.cap", 2030, "0")).toBe(10000);
    expect(value("salt.threshold", 2028, "0")).toBe(515150.5);
  });

  it("never lowers the wage base when wages fall (Social Security Act § 230(c))", () => {
    expect(value("ssWageBase", 2030, "2", "-3")).toBe(192300);
  });

  it("rejects years and rates outside the range", () => {
    expect(() => projectCorpusInput(corpusInput, { year: 2027, inflationPercent: "2" })).toThrow(/2028/);
    expect(() => projectCorpusInput(corpusInput, { year: 2036, inflationPercent: "2" })).toThrow(/horizon/);
    expect(() => projectCorpusInput(corpusInput, { year: 2029, inflationPercent: "abc" })).toThrow(/percent/);
    expect(() => projectCorpusInput(corpusInput, { year: 2029, inflationPercent: "40" })).toThrow(/outside/);
  });
});

describe("projected corpus", { timeout: 120_000 }, () => {
  it("leaves the published corpus untouched", () => {
    const projected = getProjectedFederalCorpus({ year: 2029, inflationPercent: "2.5" });
    expect(projected.merkleRoot).not.toBe(getCorpus().merkleRoot);
    // every published rule is still there, unchanged
    for (const r of corpusInput.rules) expect(projected.byId.get(r.id)?.some((v) => v.version === r.version)).toBe(true);
    const a = evaluate(getCorpus(), single(80000), { asOf: "2027-12-31", target: "us.federal.net_tax" });
    const b = evaluate(projected, single(80000), { asOf: "2027-12-31", target: "us.federal.net_tax" });
    expect(b.value).toEqual(a.value);
  });

  it("at 0% a wage-only 2028 return equals 2027", () => {
    const c = getProjectedFederalCorpus({ year: 2028, inflationPercent: "0" });
    for (const wages of [30000, 95000, 400000]) {
      const y27 = evaluate(getCorpus(), single(wages), { asOf: "2027-12-31", target: "us.federal.net_tax" });
      const y28 = evaluate(c, single(wages), { asOf: "2028-12-31", target: "us.federal.net_tax" });
      expect(y28.value, String(wages)).toEqual(y27.value);
    }
  });

  it("projects the standard deduction into taxable income", () => {
    const c = getProjectedFederalCorpus({ year: 2028, inflationPercent: "2.5" });
    const ti = evaluate(c, single(80000), { asOf: "2028-12-31", target: "us.federal.taxable_income" });
    expect(ti.value).toEqual({ type: "money", cents: BigInt((80000 - 17050) * 100) });
  });

  it("ends the tips deduction after 2028", () => {
    const facts = { ...single(60000), qualifiedTips: m(10000), occupation: { type: "enum" as const, value: "wait-staff" } };
    const c28 = getProjectedFederalCorpus({ year: 2028, inflationPercent: "2.5" });
    const c29 = getProjectedFederalCorpus({ year: 2029, inflationPercent: "2.5" });
    const t28 = evaluate(c28, facts as never, { asOf: "2028-12-31", target: "us.federal.tips_deduction" });
    const t29 = evaluate(c29, facts as never, { asOf: "2029-12-31", target: "us.federal.tips_deduction" });
    expect(t28.value).toEqual({ type: "money", cents: 1000000n });
    expect(t29.value).toEqual({ type: "money", cents: 0n });
  });

  it("refuses the premium tax credit when it's used, and computes without it", () => {
    const c = getProjectedFederalCorpus({ year: 2029, inflationPercent: "2.5" });
    expect(() =>
      evaluate(c, { ...single(40000), marketplacePremiumsPaid: m(6000), slcspAnnualPremium: m(7000), ptcHouseholdSize: { type: "int", value: "1" } } as never, {
        asOf: "2029-12-31",
        target: "us.federal.net_tax",
      }),
    ).toThrow(/premium tax credit/);
    expect(() => evaluate(c, single(40000), { asOf: "2029-12-31", target: "us.federal.net_tax" })).not.toThrow();
  });

  it("labels every projected rule and keeps a 2027 refusal a refusal", () => {
    const input = projectCorpusInput(corpusInput, { year: 2030, inflationPercent: "2.5" });
    const projected = input.rules.filter((r) => r.effectiveFrom === "2030-01-01");
    expect(projected.length).toBeGreaterThan(40);
    for (const r of projected) expect(r.citation.source).toMatch(/^PROJECTION, NOT PUBLISHED LAW|does not apply|^26 U\.S\.C\./);
    const c = getProjectedFederalCorpus({ year: 2030, inflationPercent: "2.5" });
    expect(() =>
      evaluate(c, { ...single(80000), iraContribution: m(5000), isActivePlanParticipant: { type: "bool", value: false } } as never, {
        asOf: "2030-12-31",
        target: "us.federal.net_tax",
      }),
    ).toThrow();
  });

  it("a projected proof verifies against the corpus its version names, and only that one", () => {
    const c = getProjectedFederalCorpus({ year: 2031, inflationPercent: "2.75", wageGrowthPercent: "3.5" });
    const { proof } = evaluate(c, single(120000), { asOf: "2031-12-31", target: "us.federal.net_tax" });
    expect(proof.corpus.version).toMatch(/\+projected\.2031\.cpi-2\.75\.awi-3\.5$/);
    const rebuilt = corpusForVersion(proof.corpus.version);
    expect(verifyProof(proof, rebuilt)).toMatchObject({ ok: true });
    expect(verifyProof(proof, getProjectedFederalCorpus({ year: 2031, inflationPercent: "2.5" }))).toMatchObject({ ok: false, reason: "corpus-mismatch" });
  });
});
