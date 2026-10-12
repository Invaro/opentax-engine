/**
 * Form 5695 invariants — the printed form's identities and caps must hold for
 * EVERY input, not only the golden scenarios. A deterministic PRNG sweeps
 * thousands of cost mixes across filing statuses, children, other credits and
 * both tax years, and every line is checked against the form's own arithmetic
 * recomputed here from the facts (an independent second implementation of
 * the caps), the statute's dollar limits, and the credit-limit worksheets.
 */
import { describe, expect, it } from "vitest";
import { coerceFacts, evaluate, NoApplicableRuleError } from "@invaro/opentax-core";
import type { DerivationNode } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";

const corpus = getCorpus();
const E = (s: string) => `us.federal.energy.${s}`;

function mulberry32(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function find(root: DerivationNode, ruleId: string): DerivationNode | null {
  if (root.ruleId === ruleId || root.resolvedFrom === ruleId) return root;
  for (const c of root.children ?? []) {
    const hit = find(c, ruleId);
    if (hit) return hit;
  }
  return null;
}

/** evaluate a target and return cents */
function cents(facts: Record<string, unknown>, asOf: string, target: string): bigint {
  const { value } = evaluate(corpus, coerceFacts(corpus, facts), { asOf, target });
  if (value.type !== "money") throw new Error(`${target} is not money`);
  return value.cents;
}

/** 30% of a dollar amount, half-up to the cent — the form's "Multiply line N by 30% (0.30)" */
const pct30 = (dollars: number): bigint => {
  const c = BigInt(Math.round(dollars * 100));
  return (c * 30n + 50n) / 100n;
};
const minB = (a: bigint, b: bigint) => (a < b ? a : b);
const max0 = (a: bigint) => (a > 0n ? a : 0n);

const COST_KEYS = [
  "solarElectricCosts",
  "solarWaterHeatingCosts",
  "smallWindEnergyCosts",
  "geothermalHeatPumpCosts",
  "batteryStorageCosts",
  "fuelCellPropertyCosts",
  "insulationAirSealingCosts",
  "exteriorDoorMostExpensiveCost",
  "exteriorDoorOtherCosts",
  "windowsSkylightsCosts",
  "centralAirConditionerCosts",
  "gasOilWaterHeaterCosts",
  "gasOilFurnaceBoilerCosts",
  "electricalPanelCosts",
  "homeEnergyAuditCosts",
  "heatPumpBiomassCosts",
] as const;

function scenario(rand: () => number, year: 2025 | 2026) {
  const statuses = ["single", "mfj", "mfs", "hoh", "qss"] as const;
  const facts: Record<string, unknown> = {
    filingStatus: statuses[Math.floor(rand() * statuses.length)],
    wages: Math.floor(rand() * 160000),
    qualifyingChildren: rand() < 0.4 ? Math.floor(rand() * 4) : 0,
    otherDependents: rand() < 0.2 ? 1 : 0,
  };
  if (facts.filingStatus === "mfs") facts.spouseItemizes = false;
  facts.isAtLeastAge25 = true; // the childless-EITC age gate asks otherwise
  for (const k of COST_KEYS) if (rand() < 0.45) facts[k] = (Math.round(rand() * 25000 * 100) / 100).toFixed(2); // exact cents, as a string
  facts.fuelCellHalfKilowatts = facts.fuelCellPropertyCosts ? Math.floor(rand() * 12) : 0;
  if (rand() < 0.3) facts.residentialCleanEnergyCarryforward = Math.floor(rand() * 8000);
  if (rand() < 0.25) facts.saversContributions = Math.floor(rand() * 3000);
  if (rand() < 0.2) facts.qualifiedAdoptionExpenses = Math.floor(rand() * 20000);
  return { facts, asOf: `${year}-12-31` };
}

describe("Form 5695 — line identities and statutory caps hold for every input", () => {
  const rand = mulberry32(5695);
  const N = 400;
  for (let i = 0; i < N; i++) {
    const year = i % 3 === 2 ? 2026 : 2025;
    const { facts, asOf } = scenario(rand, year);
    it(`scenario ${i} (${asOf}, ${String(facts.filingStatus)}, ${COST_KEYS.filter((k) => facts[k]).length} cost lines)`, () => {
      const f = coerceFacts(corpus, facts);
      const { proof } = evaluate(corpus, f, { asOf, target: "us.federal.net_tax" });
      const g = (id: string): bigint => {
        const n = find(proof.root, id);
        if (!n) throw new Error(`no node ${id}`);
        return BigInt((n.value as { value: string }).value);
      };
      const num = (k: string) => Number(facts[k] ?? 0);
      const live = year === 2025; // both credits are terminated after 2025

      // ---- Part II: each line recomputed independently from the facts -------
      const l18b = live ? minB(pct30(num("insulationAirSealingCosts")), 120000n) : 0n;
      const l19c = live ? minB(pct30(num("exteriorDoorMostExpensiveCost")), 25000n) : 0n;
      const l19g = live ? pct30(num("exteriorDoorOtherCosts")) : 0n;
      const l19h = minB(l19c + l19g, 50000n);
      const l20d = live ? minB(pct30(num("windowsSkylightsCosts")), 60000n) : 0n;
      const l22d = live ? minB(pct30(num("centralAirConditionerCosts")), 60000n) : 0n;
      const l23d = live ? minB(pct30(num("gasOilWaterHeaterCosts")), 60000n) : 0n;
      const l24d = live ? minB(pct30(num("gasOilFurnaceBoilerCosts")), 60000n) : 0n;
      const l25e = live ? minB(pct30(num("electricalPanelCosts")), 60000n) : 0n;
      const l26c = live ? minB(pct30(num("homeEnergyAuditCosts")), 15000n) : 0n;
      const l27 = l18b + l19h + l20d + l22d + l23d + l24d + l25e + l26c;
      const l28 = minB(l27, 120000n);
      const l29h = live ? minB(pct30(num("heatPumpBiomassCosts")), 200000n) : 0n;
      const l30 = l28 + l29h;
      expect(g(E("improvement.line27"))).toBe(l27);
      expect(g(E("improvement.line28"))).toBe(l28);
      expect(g(E("improvement.line29h"))).toBe(l29h);
      expect(g(E("improvement.line30"))).toBe(l30);
      // statutory ceilings (§ 25C(b)): $1,200 + $2,000 at most, ever
      expect(g(E("improvement.line30"))).toBeLessThanOrEqual(320000n);
      // line 31 worksheet: tax + AMT − (CDCC + education + saver's + Schedule R)
      const base = g("us.federal.income_tax_before_credits") + g("us.federal.amt");
      const before25C = g("us.federal.cdcc") + g("us.federal.education.nonrefundable") + g("us.federal.savers_credit") + g("us.federal.schedule_r_credit");
      // Schedule R yields only to Schedule 3 lines 1-4 (its own worksheet)
      expect(g("us.federal.schedule_r_credit")).toBeLessThanOrEqual(max0(base - (g("us.federal.cdcc") + g("us.federal.education.nonrefundable") + g("us.federal.savers_credit"))));
      expect(g(E("improvement.line31"))).toBe(max0(base - before25C));
      const l32 = g(E("home_improvement_credit"));
      expect(l32).toBe(minB(l30, g(E("improvement.line31"))));

      // ---- Part I ------------------------------------------------------------
      const l6a = BigInt(Math.round((num("solarElectricCosts") + num("solarWaterHeatingCosts") + num("smallWindEnergyCosts") + num("geothermalHeatPumpCosts") + num("batteryStorageCosts")) * 100));
      const l6b = live ? (l6a * 30n + 50n) / 100n : 0n;
      const l9 = live ? pct30(num("fuelCellPropertyCosts")) : 0n;
      const l10 = BigInt(num("fuelCellHalfKilowatts")) * 50000n;
      const l11 = minB(l9, l10);
      const l12 = BigInt(Math.round(num("residentialCleanEnergyCarryforward") * 100));
      const l13 = l6b + l11 + l12;
      expect(g(E("clean.line6a"))).toBe(l6a);
      expect(g(E("clean.line6b"))).toBe(l6b);
      expect(g(E("clean.line11"))).toBe(l11);
      expect(g(E("clean.line13"))).toBe(l13);
      const l15 = g(E("clean_energy_credit"));
      const l14 = g(E("clean.line14"));
      expect(l15).toBe(minB(l13, l14));
      // the carryforward is exactly what the limit left unused
      expect(cents(facts, asOf, E("clean.carryforward"))).toBe(l13 - l15);
      // line 14 worksheet: everything modeled ahead of Part I is subtracted
      const ctcForLimit = g(E("clean.ctc_for_limit"));
      const adoption = g("us.federal.adoption.nonrefundable");
      expect(l14).toBe(max0(base - (before25C + l32 + ctcForLimit + adoption)));
      // Form 8839 worksheet: adoption yields to lines 1-4, 5b, 6d and line 19 (or Worksheet B line 14)
      expect(adoption).toBeLessThanOrEqual(max0(base - (before25C + l32 + ctcForLimit)));

      // ---- Schedule 8812 Credit Limit Worksheet B ------------------------------
      const kids = Number(facts.qualifyingChildren ?? 0);
      const ctc = g("us.federal.ctc");
      const afterPhaseout = g("us.federal.ctc.after_phaseout");
      const adoptionTentative = max0(g("us.federal.adoption.allowed") - g("us.federal.adoption.refundable"));
      if ((l13 > 0n || adoptionTentative > 0n) && kids >= 1) {
        // Worksheet B: Part I and adoption yield only to the non-refundable floor of the CTC…
        const actcMax = g("us.federal.actc.maximum");
        expect(ctcForLimit).toBe(max0(afterPhaseout - actcMax));
        // …and the CTC limit is then reduced by those credits as figured (Worksheet B line 15 → Worksheet A line 4)
        expect(ctc).toBe(minB(afterPhaseout, max0(base - (before25C + l32 + l15 + adoption))));
      } else {
        // Worksheet A only: line 19 as computed; the CTC never yields to lines 5a or 6c
        expect(ctcForLimit).toBe(ctc);
        expect(ctc).toBe(minB(afterPhaseout, max0(base - (before25C + l32))));
      }

      // ---- § 26(a): the nonrefundable credits never exceed the tax ---------------
      const allNonrefundable = before25C + adoption + l32 + ctc + l15;
      expect(allNonrefundable).toBeLessThanOrEqual(base);
      expect(g("us.federal.income_tax_after_credits")).toBe(max0(base - allNonrefundable));

      // ---- termination year: nothing new is ever credited ---------------------
      if (!live) {
        expect(l32).toBe(0n);
        expect(l15).toBeLessThanOrEqual(l12);
      }
    });
  }
});

describe("Form 5695 — refusals and edges", () => {
  it("refuses a tax year the corpus does not cover (2024) rather than guessing the pre-OBBBA form", () => {
    expect(() => cents({ filingStatus: "single", wages: 50000, solarElectricCosts: 1000 }, "2024-12-31", E("clean_energy_credit"))).toThrow(NoApplicableRuleError);
  });
  it("fuel cell under 0.5 kW earns nothing (line 10 = 0) even with costs", () => {
    expect(cents({ filingStatus: "single", wages: 50000, fuelCellPropertyCosts: 9000, fuelCellHalfKilowatts: 0 }, "2025-12-31", E("clean.line11"))).toBe(0n);
  });
  it("a Part I credit with no qualifying children does not trigger Worksheet B (ODC-only return)", () => {
    const facts = { filingStatus: "single", wages: 60000, otherDependents: 1, solarElectricCosts: 20000 };
    expect(cents(facts, "2025-12-31", "us.federal.ctc")).toBe(50000n);
    expect(cents(facts, "2025-12-31", E("clean.ctc_for_limit"))).toBe(50000n);
  });
  it("Form 2555 filers never use Worksheet B", () => {
    const facts = { filingStatus: "mfj", wages: 70000, qualifyingChildren: 2, solarElectricCosts: 10000, foreignEarnedIncome: 1000 };
    const { value } = evaluate(corpus, coerceFacts(corpus, facts), { asOf: "2025-12-31", target: E("clean.worksheet_b_applies") });
    expect(value).toEqual({ type: "bool", value: false });
  });
  it("the two rate rules carry the termination: 30% in 2025, 0% from 2026 (open-ended)", () => {
    for (const id of [E("clean.rate"), E("improvement.rate")]) {
      const versions = corpus.byId.get(id)!;
      expect(versions.map((r) => [r.effectiveFrom, r.effectiveTo ?? "open"])).toEqual([
        ["2025-01-01", "2026-01-01"],
        ["2026-01-01", "open"],
      ]);
      expect(versions[1].citation.source).toContain("119-21");
    }
  });
  it("every Form 5695 rule cites the statute or the 2025 form, and the Part I/II credits sit in the after-credits chain", () => {
    for (const [id, versions] of corpus.byId) {
      if (!id.startsWith(E(""))) continue;
      for (const r of versions) {
        expect(r.citation.source, id).toMatch(/§ 25[CD]|Form 5695|Schedule 8812/);
        expect(r.citation.excerpt, id).toBeTruthy();
      }
    }
    const after = corpus.byId.get("us.federal.income_tax_after_credits")!.at(-1)!;
    expect(JSON.stringify(after.formula)).toContain(E("clean_energy_credit"));
    expect(JSON.stringify(after.formula)).toContain(E("home_improvement_credit"));
  });
});
