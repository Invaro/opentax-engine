/**
 * Form 4562 composer. Expected values are the printed results of the worked
 * examples in Publication 946 (2025) and the 2025 Instructions for Form 4562
 * (page cited on each), plus identities the statute and tables guarantee.
 */
import { describe, expect, it } from "vitest";
import { composeForm4562, Form4562MissingInput, Form4562Refusal, type DepreciationAsset, type Form4562Input } from "@invaro/opentax-compose";
import { MACRS_TABLES } from "../../compose/src/macrs-tables.js";

const $ = (d: number) => BigInt(Math.round(d * 100));
const dollars = (c: bigint) => Number(c) / 100;
const f = (input: Partial<Form4562Input> & { taxYear: number; assets: DepreciationAsset[] }) =>
  composeForm4562({ filingStatus: "single", ...input } as Form4562Input);
const prior = { section179Taken: 0n, specialAllowanceTaken: 0n };

describe("MACRS tables (Pub 946 Appendix A, as printed)", () => {
  it("every column sums to exactly 100", () => {
    for (const [table, cols] of Object.entries(MACRS_TABLES))
      for (const [col, rates] of Object.entries(cols)) {
        const hundredths = rates.reduce((t, r) => {
          const [w, frac = ""] = r.split(".");
          return t + BigInt(w + frac.padEnd(3, "0"));
        }, 0n);
        expect(hundredths, `${table} ${col}`).toBe(100_000n);
      }
  });
  it("matches printed cells", () => {
    expect(MACRS_TABLES["A-1"]["7"]).toEqual(["14.29", "24.49", "17.49", "12.49", "8.93", "8.92", "8.93", "4.46"]);
    expect(MACRS_TABLES["A-1"]["5"]).toEqual(["20.00", "32.00", "19.20", "11.52", "11.52", "5.76"]);
    expect(MACRS_TABLES["A-6"]["1"].slice(0, 2)).toEqual(["3.485", "3.636"]);
    expect(MACRS_TABLES["A-7a"]["1"][0]).toBe("2.461");
    expect(MACRS_TABLES["A-7a"]["3"].slice(0, 2)).toEqual(["2.033", "2.564"]);
    expect(MACRS_TABLES["A-3"]["7"][0]).toBe("17.85"); // as printed (Rev. Proc. 87-57)
  });
});

describe("Pub 946 and i4562 worked examples", () => {
  it("mid-quarter determination and tables (Pub 946 p. 39)", () => {
    const assets: DepreciationAsset[] = [
      { id: "machine", recoveryClass: "7", cost: $(4000), placedInService: "2025-01-15" },
      { id: "furniture", recoveryClass: "7", cost: $(1000), placedInService: "2025-09-10" },
      { id: "computer", recoveryClass: "5", cost: $(5000), placedInService: "2025-10-10" },
    ];
    const r = f({ taxYear: 2025, electOutOfSpecialAllowance: ["5", "7"], assets });
    expect(r.assets.map((a) => [a.id, a.convention, Math.round(dollars(a.depreciation))])).toEqual([
      ["machine", "MQ", 1000],
      ["furniture", "MQ", 107],
      ["computer", "MQ", 250],
    ]);
    const y2 = f({ taxYear: 2026, assets: assets.map((a) => ({ ...a, convention: "MQ" as const, ...prior })) });
    expect(y2.assets.map((a) => Math.round(dollars(a.depreciation)))).toEqual([857, 255, 1900]);
  });

  it("§ 179 dollar limit: basis after the election (Pub 946 p. 18)", () => {
    const r = f({
      taxYear: 2025,
      section179BusinessIncome: $(5_000_000),
      electOutOfSpecialAllowance: ["7"],
      assets: [
        { id: "machinery", recoveryClass: "7", cost: $(2_500_000), placedInService: "2025-03-01", section179: $(2_475_000) },
        { id: "saw", recoveryClass: "7", cost: $(25_000), placedInService: "2025-03-01", section179: $(25_000) },
      ],
    });
    expect(r.lines["12_section179_deduction"]).toBe("$2,500,000");
    expect(r.assets.map((a) => dollars(a.macrsBasis))).toEqual([25_000, 0]);
  });

  it("§ 179 phase-out (Pub 946 p. 18): $4,050,000 of property → $2,450,000", () => {
    const r = f({ taxYear: 2025, section179BusinessIncome: $(9e6), electOutOfSpecialAllowance: ["7"], assets: [{ id: "m", recoveryClass: "7", cost: $(4_050_000), placedInService: "2025-03-01", section179: $(1000) }] });
    expect(r.lines["4_reduction"]).toBe("$50,000");
    expect(r.lines["5_dollar_limitation"]).toBe("$2,450,000");
  });

  it("MFS allocation (Pub 946 p. 18): combined $2,200,000, 95% → $2,090,000", () => {
    const r = composeForm4562({
      taxYear: 2025,
      filingStatus: "mfs",
      spouseSection179Cost: $(300_000),
      mfsAllocationPercent: 95,
      section179BusinessIncome: $(9e6),
      electOutOfSpecialAllowance: ["7"],
      assets: [{ id: "farm", recoveryClass: "7", cost: $(4_000_000), placedInService: "2025-04-01", section179: $(2_090_000) }],
    });
    expect(r.lines["5_dollar_limitation"]).toBe("$2,090,000");
    const even = composeForm4562({
      taxYear: 2025,
      filingStatus: "mfs",
      spouseSection179Cost: $(300_000),
      section179BusinessIncome: $(9e6),
      electOutOfSpecialAllowance: ["7"],
      assets: [{ id: "farm", recoveryClass: "7", cost: $(4_000_000), placedInService: "2025-04-01", section179: $(1_000) }],
    });
    expect(even.lines["5_dollar_limitation"]).toBe("$1,100,000");
  });

  it("business income limit with K-1 § 179 (Pub 946 p. 20, Dean): $80,000 deducted, $45,000 carried", () => {
    const r = f({
      taxYear: 2025,
      section179FromK1: $(70_000),
      section179BusinessIncome: $(80_000),
      electOutOfSpecialAllowance: ["7"],
      assets: [{ id: "own", recoveryClass: "7", cost: $(55_000), placedInService: "2025-05-01", section179: $(55_000) }],
    });
    expect([r.lines["2_section179_property_cost"], r.lines["8_total_elected"], r.lines["12_section179_deduction"], r.lines["13_carryover_to_next_year"]]).toEqual([
      "$55,000",
      "$125,000",
      "$80,000",
      "$45,000",
    ]);
  });

  it("40% special allowance for property acquired before January 20, 2025 (Pub 946 p. 26)", () => {
    const r = f({ taxYear: 2025, assets: [{ id: "q", recoveryClass: "7", cost: $(450_000), placedInService: "2025-01-07", acquiredOn: "2025-01-02" }] });
    expect([dollars(r.assets[0].specialAllowance), r.assets[0].specialAllowanceRate]).toEqual([180_000, 40]);
  });

  it("nonresidential real property, mid-month (Pub 946 p. 38): $2,033 then $2,564", () => {
    const y1 = f({ taxYear: 2025, assets: [{ id: "b", recoveryClass: "39", cost: $(100_000), placedInService: "2025-03-08" }] });
    const y2 = f({ taxYear: 2026, assets: [{ id: "b", recoveryClass: "39", cost: $(100_000), placedInService: "2025-03-08", ...prior }] });
    expect([dollars(y1.assets[0].depreciation), dollars(y2.assets[0].depreciation)]).toEqual([2033, 2564]);
  });

  it("dispositions (Pub 946 p. 39): mid-quarter $513, mid-month $757.50", () => {
    const mq = f({ taxYear: 2025, assets: [{ id: "d", recoveryClass: "5", cost: $(10_000), placedInService: "2022-12-02", convention: "MQ", ...prior, disposedOn: "2025-04-06" }] });
    expect(dollars(mq.assets[0].depreciation)).toBe(513);
    const mm = f({ taxYear: 2025, assets: [{ id: "r", recoveryClass: "27.5", cost: $(100_000), placedInService: "2023-07-02", ...prior, disposedOn: "2025-03-02" }] });
    expect(dollars(mm.assets[0].depreciation)).toBe(757.5);
  });

  it("7-year half-year (Pub 946 p. 38): $1,429", () => {
    const r = f({ taxYear: 2025, electOutOfSpecialAllowance: ["7"], assets: [{ id: "f", recoveryClass: "7", cost: $(10_000), placedInService: "2025-08-11" }] });
    expect(dollars(r.assets[0].depreciation)).toBe(1429);
  });

  it("passenger automobile limits (Pub 946 p. 60; i4562 line 26)", () => {
    const car = (cost: number, use?: number) =>
      f({ taxYear: 2025, electOutOfSpecialAllowance: ["5"], assets: [{ id: "car", recoveryClass: "5", cost: $(cost), placedInService: "2025-04-15", listed: true, passengerAutomobile: true, businessUsePercent: use }] });
    expect(dollars(car(14_500).assets[0].depreciation)).toBe(2900); // not binding
    expect(dollars(car(80_000, 60).assets[0].depreciation)).toBe(7320); // $12,200 × 60%
  });
});

describe("rules", () => {
  const bonusRate = (taxYear: number, pis: string, acquired: string, extra: Partial<DepreciationAsset> = {}, input: Partial<Form4562Input> = {}) =>
    f({ taxYear, ...input, assets: [{ id: "x", recoveryClass: "7", cost: $(10_000), placedInService: pis, acquiredOn: acquired, ...extra }] }).assets[0].specialAllowanceRate;

  it("special allowance by acquisition date and year (OBBBA § 70301; former § 168(k)(6))", () => {
    expect(bonusRate(2025, "2025-03-01", "2025-01-20")).toBe(100);
    expect(bonusRate(2025, "2025-03-01", "2025-01-19")).toBe(40);
    expect(bonusRate(2026, "2026-03-01", "2024-12-01")).toBe(20);
    expect(bonusRate(2027, "2027-03-01", "2024-12-01")).toBe(0);
    expect(bonusRate(2026, "2026-03-01", "2025-06-01")).toBe(100);
    expect(bonusRate(2025, "2025-03-01", "2024-12-01", { longProductionPeriod: true })).toBe(60);
    expect(bonusRate(2026, "2026-03-01", "2024-12-01", { longProductionPeriod: true })).toBe(40);
    expect(bonusRate(2025, "2025-03-01", "2025-02-01", {}, { elect40PercentFor2025: true })).toBe(40);
    expect(() => bonusRate(2026, "2026-03-01", "2025-02-01", {}, { elect40PercentFor2025: true })).toThrow(/TY2025/);
    expect(bonusRate(2025, "2025-03-01", "2025-02-01", {}, { electOutOfSpecialAllowance: ["7"] })).toBe(0);
  });

  it("mid-quarter applies only when the fourth quarter EXCEEDS 40%", () => {
    const run = (q4: number) =>
      f({
        taxYear: 2025,
        electOutOfSpecialAllowance: ["5"],
        assets: [
          { id: "a", recoveryClass: "5", cost: $(100 - q4), placedInService: "2025-02-01" },
          { id: "b", recoveryClass: "5", cost: $(q4), placedInService: "2025-11-01" },
        ],
      }).assets[0].convention;
    expect(run(40)).toBe("HY");
    expect(run(40.01)).toBe("MQ");
  });

  it("a building does not count in the mid-quarter test, and bonus doesn't reduce the tested basis", () => {
    const r = f({
      taxYear: 2025,
      assets: [
        { id: "bldg", recoveryClass: "39", cost: $(1_000_000), placedInService: "2025-02-01" },
        { id: "q1", recoveryClass: "5", cost: $(1000), placedInService: "2025-02-01", acquiredOn: "2025-02-01" },
        { id: "q4", recoveryClass: "5", cost: $(1000), placedInService: "2025-12-01", acquiredOn: "2025-11-01" },
      ],
    });
    expect(r.assets.find((a) => a.id === "q1")!.convention).toBe("MQ"); // 50% in Q4
  });

  it("an earlier year's asset uses its recovery-year row and the MACRS basis after § 179 and the allowance", () => {
    // 5-year half-year placed in service 2022: 2025 is recovery year 4 (A-1 11.52%); 2027 is year 6 (5.76%)
    const asset = { id: "p", recoveryClass: "5" as const, cost: $(20_000), placedInService: "2022-06-01", convention: "HY" as const, section179Taken: $(4000), specialAllowanceTaken: $(6000) };
    const y25 = f({ taxYear: 2025, assets: [asset] });
    expect([y25.assets[0].recoveryYear, y25.assets[0].rate, dollars(y25.assets[0].macrsBasis), dollars(y25.assets[0].depreciation)]).toEqual([4, "11.52", 10_000, 1152]);
    expect(y25.lines["17_macrs_prior_years"]).toBe("$1,152");
    const y27 = f({ taxYear: 2027, assets: [asset] });
    expect([y27.assets[0].recoveryYear, dollars(y27.assets[0].depreciation)]).toEqual([6, 576]);
  });

  it("refuses what the sources leave to the taxpayer or this build doesn't model", () => {
    const base = { taxYear: 2025, section179BusinessIncome: $(1e6) };
    expect(() => f({ ...base, assets: [{ id: "a", recoveryClass: "7", cost: $(3e6), placedInService: "2025-02-01", acquiredOn: "2025-02-01", section179: $(2_600_000) }] })).toThrow(Form4562Refusal);
    expect(() => f({ taxYear: 2025, assets: [{ id: "a", recoveryClass: "7", cost: $(1000), placedInService: "2025-02-01", section179: $(500) }] })).toThrow(/section179BusinessIncome/);
    expect(() => f({ ...base, assets: [{ id: "a", recoveryClass: "27.5", cost: $(1000), placedInService: "2025-02-01", section179: $(500) }] })).toThrow(/residential/);
    expect(() => f({ taxYear: 2025, assets: [{ id: "a", recoveryClass: "7", cost: $(1000), placedInService: "2025-02-01" }] })).toThrow(/acquiredOn/);
    expect(() => f({ taxYear: 2027, electOutOfSpecialAllowance: ["5"], assets: [{ id: "c", recoveryClass: "5", cost: $(40_000), placedInService: "2027-02-01", listed: true, passengerAutomobile: true }] })).toThrow(/2027/);
    // an EARLIER year's listed property now at 50% or less: ADS from the start, or § 280F(b)(2) recapture — the taxpayer must say
    expect(() => f({ taxYear: 2025, assets: [{ id: "c", recoveryClass: "5", cost: $(40_000), placedInService: "2024-02-01", convention: "HY", ...prior, listed: true, businessUsePercent: 40 }] })).toThrow(/ADS/);
    expect(() => f({ ...base, assets: [{ id: "li", assetClass: "00.3", cost: $(50_000), placedInService: "2025-02-01", acquiredOn: "2025-02-01", section179: $(10_000) }] })).toThrow(/land improvements/);
    expect(() => f({ ...base, assets: [{ id: "q", recoveryClass: "15", cost: $(50_000), placedInService: "2025-02-01", acquiredOn: "2025-02-01", section179: $(10_000) }] })).toThrow(Form4562MissingInput);
    expect(() => f({ taxYear: 2025, electOutOfSpecialAllowance: ["qip"], assets: [] })).toThrow(/class "15"/);
    expect(() => f({ ...base, assets: [{ id: "s", recoveryClass: "5", cost: $(80_000), placedInService: "2025-02-01", acquiredOn: "2025-02-01", sportUtilityVehicle: true, section179: $(40_000) }] })).toThrow(/31,300/);
  });

  it("missing inputs come back together as NEEDS_FACTS", () => {
    try {
      f({ taxYear: 2025, assets: [
        { id: "new", recoveryClass: "7", cost: $(1000), placedInService: "2025-02-01" },
        { id: "old", recoveryClass: "5", cost: $(1000), placedInService: "2023-02-01" },
      ] });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(Form4562MissingInput);
      expect((e as Form4562MissingInput).missing.map((m) => m.id)).toEqual([
        "assets[new].acquiredOn",
        "assets[old].convention",
        "assets[old].section179Taken",
        "assets[old].specialAllowanceTaken",
      ]);
    }
  });

  it("land improvements are not § 179 property and stay off line 2", () => {
    const r = f({ taxYear: 2025, electOutOfSpecialAllowance: ["15", "5"], section179BusinessIncome: $(1e6), assets: [
      { id: "parking", assetClass: "00.3", cost: $(5_000_000), placedInService: "2025-02-01" },
      { id: "register", assetClass: "57.0", cost: $(10_000), placedInService: "2025-02-01", section179: $(10_000) },
    ] });
    expect([r.lines["2_section179_property_cost"], r.lines["4_reduction"], r.lines["12_section179_deduction"]]).toEqual(["$10,000", "$0", "$10,000"]);
  });

  it("electing out of class 15 reaches qualified improvement property", () => {
    const r = f({ taxYear: 2025, electOutOfSpecialAllowance: ["15"], assets: [{ id: "qip", recoveryClass: "qip", cost: $(100_000), placedInService: "2025-03-01", acquiredOn: "2025-03-01" }] });
    // 15-year straight line, half-year: A-8 15-year year 1 is 3.33%
    expect([r.assets[0].specialAllowanceRate, dollars(r.assets[0].depreciation)]).toEqual([0, 3330]);
  });

  it("a new car with the 100% allowance is limited to the first-year cap", () => {
    const r = f({ taxYear: 2025, assets: [{ id: "c", recoveryClass: "5", cost: $(40_000), placedInService: "2025-02-01", acquiredOn: "2025-02-01", passengerAutomobile: true }] });
    expect([r.assets[0].specialAllowanceRate, dollars(r.assets[0].specialAllowance + r.assets[0].depreciation), r.lines["21_listed_property"]]).toEqual([100, 20_200, "$20,200"]);
  });

  it("a car's § 280F limit counts the § 179 elected, even when part of it carries over (i4562 line 26)", () => {
    const r = f({ taxYear: 2025, electOutOfSpecialAllowance: ["5"], section179BusinessIncome: $(2000), assets: [{ id: "c", recoveryClass: "5", cost: $(40_000), placedInService: "2025-04-15", passengerAutomobile: true, section179: $(10_000) }] });
    // limit $12,200: § 179 elected $10,000 leaves $2,200 for MACRS (20% × $30,000 = $6,000 → $2,200); § 179 deducted $2,000
    expect([dollars(r.assets[0].depreciation), dollars(r.assets[0].section179Deducted), r.lines["13_carryover_to_next_year"]]).toEqual([2200, 2000, "$8,000"]);
  });

  it("caps for cars placed in service before 2025 come from the 2025 instructions' Table 2", () => {
    const car = (pis: string, taxYear: number) =>
      f({ taxYear, assets: [{ id: "c", recoveryClass: "5", cost: $(100_000), placedInService: pis, convention: "HY", ...prior, passengerAutomobile: true }] }).assets[0];
    expect(dollars(car("2024-06-01", 2025).depreciation)).toBe(19_800); // 2024 car, year 2
    expect(dollars(car("2023-06-01", 2025).depreciation)).toBe(11_700); // 2023 car, year 3
    expect(dollars(car("2022-06-01", 2025).depreciation)).toBe(6_460); // 2022 car, year 4
    expect(dollars(car("2024-06-01", 2027).depreciation)).toBe(7_160); // 2024 car, year 4 (Rev. Proc. 2024-13)
    expect(() => car("2019-06-01", 2025)).toThrow(Form4562Refusal); // year 7: unrecovered basis, not modeled
  });

  it("a car at 40% business use goes to 5-year ADS on its own", () => {
    const r = f({ taxYear: 2025, assets: [{ id: "c", recoveryClass: "5", cost: $(30_000), placedInService: "2025-02-01", acquiredOn: "2025-02-01", passengerAutomobile: true, businessUsePercent: 40 }] });
    // $12,000 business basis × A-8 5-year 10.00% = $1,200 (under the $12,200 × 40% = $4,880 limit)
    expect([r.assets[0].system, r.assets[0].table, dollars(r.assets[0].depreciation)]).toEqual(["ADS", "A-8 col 5", 1200]);
  });

  it("listed property at 40% business use runs under ADS with no special allowance", () => {
    const r = f({ taxYear: 2025, assets: [{ id: "c", assetClass: "00.12", cost: $(10_000), placedInService: "2025-02-01", acquiredOn: "2025-02-01", listed: true, businessUsePercent: 40, method: "ADS" }] });
    // $4,000 business basis × A-8 5-year year 1 (10.00%)
    expect([r.assets[0].specialAllowanceRate, dollars(r.assets[0].depreciation), r.assets[0].table]).toEqual([0, 400, "A-8 col 5"]);
  });
});
