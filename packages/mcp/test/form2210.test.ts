/**
 * Form 2210 composer: Part I, Schedule AI and the Part III penalty worksheet,
 * run against the real engine. Expected penalties are worked by hand in each
 * test from the 2025 instructions (rate × days / 365, payments applied to the
 * earliest underpayment first) and the IRS's published quarterly rates.
 */
import { describe, expect, it } from "vitest";
import { evaluate, walkExpr } from "@invaro/opentax-core";
import type { Expr } from "@invaro/opentax-core";
import { corpusInput, facts as FACTS, getCorpus } from "@invaro/opentax-corpus-us-federal";
import { composeForm2210, MissingInput, SCHEDULE_AI_FACTS, type Form2210Input, type TypedFacts } from "@invaro/opentax-compose";

const corpus = getCorpus();
const m = (d: number) => ({ type: "money" as const, value: String(Math.round(d * 100)) });
const fs = (s: string) => ({ type: "enum" as const, value: s });
const pay = (date: string, d: number) => ({ date, amount: BigInt(Math.round(d * 100)) });
const runner = (year: number) => (f: TypedFacts, target: string): bigint => {
  const { value } = evaluate(corpus, f as never, { asOf: `${year}-12-31`, target });
  return value.type === "money" ? value.cents : 0n;
};
const compose = (input: Form2210Input) => composeForm2210(input, runner(input.taxYear));
const cents = (s: string) => BigInt(s.replace(/[$,.]/g, "")) * (s.includes(".") ? 1n : 100n);

describe("Schedule AI fact classification", () => {
  it("classifies every money fact the federal net tax can read", () => {
    const byId = new Map<string, typeof corpusInput.rules>();
    for (const r of corpusInput.rules) byId.set(r.id, [...(byId.get(r.id) ?? []), r]);
    const overriders = new Map<string, string[]>();
    for (const r of corpusInput.rules) if (r.overrides) overriders.set(r.overrides.ruleId, [...(overriders.get(r.overrides.ruleId) ?? []), r.id]);
    const seen = new Set<string>();
    const reached = new Set<string>();
    const visit = (id: string) => {
      if (seen.has(id)) return;
      seen.add(id);
      for (const r of byId.get(id) ?? []) {
        for (const root of [r.formula, r.applicability].filter(Boolean) as Expr[])
          walkExpr(root, (e) => {
            if (e.kind === "rule") visit(e.ruleId);
            if (e.kind === "fact") reached.add(e.factId);
          });
      }
      for (const o of overriders.get(id) ?? []) visit(o);
    };
    visit("us.federal.net_tax");
    const money = new Set(FACTS.filter((f) => f.type === "money").map((f) => f.id));
    const unclassified = [...reached].filter((id) => money.has(id) && !(id in SCHEDULE_AI_FACTS));
    expect(unclassified).toEqual([]);
    const unknown = Object.keys(SCHEDULE_AI_FACTS).filter((id) => !money.has(id));
    expect(unknown).toEqual([]);
  });
});

describe("Part I", () => {
  it("stops at line 4 under $1,000", () => {
    const r = compose({ taxYear: 2025, facts: { filingStatus: fs("single"), wages: m(20000), priorYearTax: m(0), priorYearAGI: m(0) }, payments: [] });
    expect(r.noPenalty).toMatch(/line 4/);
    expect(r.partIII).toBeUndefined();
  });

  it("uses 110% of the prior year's tax for MFS over $75,000 of prior-year AGI", () => {
    const r = compose({
      taxYear: 2025,
      facts: { filingStatus: fs("mfs"), spouseItemizes: { type: "bool", value: false }, wages: m(150000), priorYearTax: m(10000), priorYearAGI: m(80000) },
      payments: [],
    });
    expect(r.partI["8_prior_year_tax"]).toMatch(/^\$11,000 \(110%/);
    expect(r.partI["9_required_annual_payment"]).toBe("$11,000");
  });

  it("no penalty when withholding covers the required annual payment", () => {
    const r = compose({
      taxYear: 2025,
      facts: { filingStatus: fs("single"), wages: m(100000), federalTaxWithheld: m(9000), priorYearTax: m(8000), priorYearAGI: m(90000) },
      payments: [],
    });
    expect(r.noPenalty).toMatch(/line 6/);
  });
});

describe("Part III penalty", () => {
  // line 9 = $16,000 (100% of prior-year tax, below 90% of this year's), no withholding:
  // required installments $4,000 each — the instructions' Example 3 pattern
  const facts: TypedFacts = { filingStatus: fs("single"), wages: m(200000), priorYearTax: m(16000), priorYearAGI: m(140000) };
  const example3 = [pay("2025-04-30", 2000), pay("2025-06-15", 3000), pay("2025-09-15", 4000), pay("2026-01-15", 4000)];

  it("reproduces the instructions' Examples 3 and 4 (payments applied to the earliest underpayment first)", () => {
    const r = compose({ taxYear: 2025, facts, payments: example3 });
    const reg = r.partIII!.regular;
    expect(reg.sectionA["10"]).toEqual(["$4,000", "$4,000", "$4,000", "$4,000"]);
    expect(reg.sectionA["17"]).toEqual(["$4,000", "$3,000", "$3,000", "$3,000"]);
    // Example 3: "04/30 $2,000" and "06/15 $2,000" on line 1b column (a); Example 4: 15 and 61 days
    const colA = reg.worksheet.filter((w) => w.column === "a");
    expect(colA.map((w) => [w.amount, w.paidOn, w.days])).toEqual([
      ["$2,000.00", "2025-04-30", 15],
      ["$2,000.00", "2025-06-15", 61],
    ]);
    // by hand: (a) 2000×.07×15/365 + 2000×.07×61/365 = 5.7534 + 23.3973
    // (b) 3000×.07×(15+77)/365 = 8.6301 + 44.3014
    // (c) 3000×.07×(15+92+15)/365 = 8.6301 + 52.9315 + 8.6301
    // (d) 3000×.07×75/365 + 3000×.06×15/365 = 43.1507 + 7.3973 (April 2026 is 6%, Rev. Rul. 2026-5)
    // total 202.8219
    expect(reg.penalty).toBe("$202.82");
    expect(r.penalty).toEqual({ method: "regular", amount: "$202.82", amountCents: "20282" });
  });

  it("§ 6654(h): filed and paid in full by January 31 removes the fourth installment's penalty", () => {
    // the payment with the return (1/30) counts in column (d) and must complete the year's tax
    const r = compose({ taxYear: 2025, facts, payments: [...example3, pay("2026-01-30", 40000)], filedAndPaidInFullOn: "2026-01-30" });
    // 202.82 − (43.15 + 7.40) = 152.27
    expect(r.partIII!.regular.penalty).toBe("$152.27");
    expect(() => compose({ taxYear: 2025, facts, payments: example3, filedAndPaidInFullOn: "2026-01-30" })).toThrow(/paid in full/);
  });

  it("withholding pays the earliest underpayment on its due date (§ 6654(g))", () => {
    // $8,000 withheld = $2,000 on each due date against $4,000 installments. Section A line 17:
    // 2,000 / 4,000 / 4,000 / 4,000. The 6/15 withholding pays (a); 9/15 and 1/15 pay (b); (c) and (d) run to 4/15/26.
    // (a) 2000×.07×61/365 = 23.40
    // (b) 2000 to 9/15: 5.75 + 29.53; 2000 to 1/15: 5.75 + 35.29 + 35.29 + 5.75
    // (c) 4000: 11.51 + 70.58 + 69.04 + 9.86 (6%)   (d) 4000: 57.53 + 9.86 (6%)
    // total 369.14 — the balance due at each moment is exactly the cumulative shortfall
    const r = compose({ taxYear: 2025, facts: { ...facts, federalTaxWithheld: m(8000) }, payments: [] });
    expect(r.partIII!.regular.sectionA["17"]).toEqual(["$2,000", "$4,000", "$4,000", "$4,000"]);
    expect(r.partIII!.regular.penalty).toBe("$369.14");
  });

  it("a 6/16/2025 payment counts as made on Sunday 6/15 (§ 7503)", () => {
    const a = compose({ taxYear: 2025, facts, payments: [pay("2025-06-16", 8000)] });
    const b = compose({ taxYear: 2025, facts, payments: [pay("2025-06-15", 8000)] });
    expect(a.partIII!.regular.penalty).toBe(b.partIII!.regular.penalty);
    expect(a.partIII!.regular.worksheet[0]).toMatchObject({ column: "a", paidOn: "2025-06-15", days: 61 });
  });

  it("box D: withholding by date must total the year's withholding, and is used only when it lowers the penalty", () => {
    const f = { ...facts, federalTaxWithheld: m(4000) };
    expect(() => compose({ taxYear: 2025, facts: f, payments: [], withholdingByDate: [pay("2025-12-15", 3000)] })).toThrow(/must agree/);
    // withheld in January: earlier than one-fourth per due date → box D lowers the penalty
    const early = compose({ taxYear: 2025, facts: f, payments: [], withholdingByDate: [pay("2025-01-31", 4000)] });
    expect(early.partIII!.regular.sectionA["11"]).toEqual(["$4,000", "$0", "$0", "$0"]);
    expect(early.boxes).toContain("D");
    // withheld in December: later than even → even withholding is kept, no box D
    const late = compose({ taxYear: 2025, facts: f, payments: [], withholdingByDate: [pay("2025-12-15", 4000)] });
    expect(late.boxes).not.toContain("D");
    expect(late.partIII!.regular.sectionA["11"]).toEqual(["$1,000", "$1,000", "$1,000", "$1,000"]);
    const even = compose({ taxYear: 2025, facts: f, payments: [] });
    expect(late.penalty).toEqual(even.penalty);
  });

  it("the penalty is the sum of the worksheet lines shown", () => {
    const r = compose({ taxYear: 2025, facts: { ...facts, federalTaxWithheld: m(5000) }, payments: [pay("2025-07-01", 3333.33), pay("2025-11-11", 777.77)] });
    const sum = r.partIII!.regular.worksheet.reduce((t, w) => t + cents(w.penalty), 0n);
    expect(cents(r.partIII!.regular.penalty!)).toBe(sum);
  });

  it("refuses a 2026 penalty that runs into 2027 Q1, whose rate isn't announced", () => {
    const r = compose({
      taxYear: 2026,
      facts: { filingStatus: fs("single"), wages: m(200000), priorYearTax: m(16000), priorYearAGI: m(140000) },
      payments: [],
    });
    expect(r.partIII!.regular.refused).toMatch(/2027-Q1/);
    expect(r.partIII!.regular.sectionA["17"]).toEqual(["$4,000", "$4,000", "$4,000", "$4,000"]);
    expect(r.penalty).toHaveProperty("refused");
  });

  it("prices a 2026 penalty fully paid in 2026 at the 2026 rates", () => {
    const r = compose({
      taxYear: 2026,
      facts: { filingStatus: fs("single"), wages: m(200000), priorYearTax: m(16000), priorYearAGI: m(140000) },
      payments: [pay("2026-12-01", 12000), pay("2026-12-31", 4000)],
    });
    // (a) 4000 from 4/15 → 12/1: 76 days 6% (Q2) + 92 days 7% + 62 days 7%
    //   = 4000×(.06×76 + .07×154)/365 = 4000×(4.56+10.78)/365 = 168.1096
    // (b) 4000 from 6/15 → 12/1: 15 days 6% + 92 + 62 days 7% = 4000×(.9+10.78)/365 = 128.0000
    // (c) 4000 from 9/15 → 12/1: 15 + 62 days 7% = 4000×.07×77/365 = 59.0685
    // (d) $4,000 paid 12/31, before its 1/15/2027 due date: no underpayment
    // total 355.1781
    expect(r.partIII!.regular.penalty).toBe("$355.18");
  });
});

describe("Schedule AI", { timeout: 60_000 }, () => {
  const base: TypedFacts = { filingStatus: fs("single"), wages: m(60000), selfEmploymentNetProfit: m(40000), federalTaxWithheld: m(3000), priorYearTax: m(8000), priorYearAGI: m(90000) };
  const periods = {
    mar31: { wages: m(15000), selfEmploymentNetProfit: m(2000) },
    may31: { wages: m(25000), selfEmploymentNetProfit: m(5000) },
    aug31: { wages: m(40000), selfEmploymentNetProfit: m(15000) },
  };

  it("matches the corpus's own wage + self-employment Schedule AI rules, column by column, every year", () => {
    const splits = [
      [15000, 25000, 40000, 60000, 2000, 5000, 15000, 40000],
      [0, 0, 30000, 90000, 30000, 30000, 30000, 30000],
      [50000, 80000, 120000, 180000, 1000, 9000, 20000, 85000],
    ];
    for (const year of [2025, 2026, 2027]) {
      for (const [w1, w2, w3, w4, s1, s2, s3, s4] of splits) {
        const facts: TypedFacts = { ...base, wages: m(w4), selfEmploymentNetProfit: m(s4), priorYearTax: m(30000), businessIsSSTB: { type: "bool", value: false } };
        const r = composeForm2210(
          {
            taxYear: year,
            facts,
            payments: [],
            periods: {
              mar31: { wages: m(w1), selfEmploymentNetProfit: m(s1) },
              may31: { wages: m(w2), selfEmploymentNetProfit: m(s2) },
              aug31: { wages: m(w3), selfEmploymentNetProfit: m(s3) },
            },
          },
          runner(year),
        );
        if (r.noPenalty) continue;
        const cols = (r.scheduleAI as { columns: Record<string, string>[] }).columns;
        const legacy = {
          ...facts,
          wagesThroughMar31: m(w1), wagesThroughMay31: m(w2), wagesThroughAug31: m(w3),
          seProfitThroughMar31: m(s1), seProfitThroughMay31: m(s2), seProfitThroughAug31: m(s3),
        };
        for (let q = 1; q <= 4; q++) {
          const { value } = evaluate(corpus, legacy as never, { asOf: `${year}-12-31`, target: `us.federal.estimated.annualized_installment_q${q}` });
          const rule = value.type === "money" ? value.cents : 0n;
          const got = cents(cols[q - 1]["27_required_installment"]);
          // the form rounds each line to whole dollars; the rule keeps cents
          expect(Number(got - rule), `${year} q${q} ${[w1, s1]}`).toBeLessThanOrEqual(300);
          expect(Number(rule - got), `${year} q${q} ${[w1, s1]}`).toBeLessThanOrEqual(300);
        }
      }
    }
  });

  it("annualizes other income: column (a) with interest and qualified dividends", () => {
    const facts: TypedFacts = { ...base, taxableInterest: m(8000), qualifiedDividends: m(12000), ordinaryDividends: m(12000) };
    const r = compose({
      taxYear: 2025,
      facts,
      payments: [],
      periods: {
        mar31: { ...periods.mar31, taxableInterest: m(2000), qualifiedDividends: m(0), ordinaryDividends: m(0) },
        may31: { ...periods.may31, taxableInterest: m(3000), qualifiedDividends: m(6000), ordinaryDividends: m(6000) },
        aug31: { ...periods.aug31, taxableInterest: m(5000), qualifiedDividends: m(6000), ordinaryDividends: m(6000) },
      },
    });
    const cols = (r.scheduleAI as { columns: Record<string, string>[] }).columns;
    // column (a): the engine on wages 60,000, SE 8,000, interest 8,000 (each × 4)
    const q1 = runner(2025)({ ...facts, wages: m(60000), selfEmploymentNetProfit: m(8000), taxableInterest: m(8000), qualifiedDividends: m(0), ordinaryDividends: m(0) }, "us.federal.net_tax");
    expect(cols[0]["19_net"]).toBe("$" + ((q1 + 50n) / 100n).toLocaleString("en-US"));
    expect(cols[0]["3_annualized_agi"]).toBe("$75,435");
  });

  it("asks for every period amount the year needs", () => {
    try {
      compose({ taxYear: 2025, facts: { ...base, taxableInterest: m(500) }, payments: [], periods });
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(MissingInput);
      expect((e as MissingInput).missing).toEqual(["periods.mar31.taxableInterest", "periods.may31.taxableInterest", "periods.aug31.taxableInterest"]);
    }
  });

  it("refuses where the period treatment is unsettled, and still prices the regular method", () => {
    const r = compose({ taxYear: 2025, facts: { ...base, priorYearLongTermCapitalLossCarryover: m(5000) }, payments: [], periods });
    expect(r.scheduleAI).toHaveProperty("refused");
    expect((r.scheduleAI as { refused: string[] }).refused[0]).toMatch(/carryover/);
    expect(r.partIII!.regular.penalty).toBeDefined();
    expect(r.penalty).toHaveProperty("method", "regular");
  });

  it("refuses a column where the SALT cap binds on the annualized amount", () => {
    const facts: TypedFacts = { ...base, wages: m(300000), stateAndLocalTaxesPaid: m(30000), mortgageInterestPaid: m(30000), mortgageAverageBalance: m(600000), businessIsSSTB: { type: "bool", value: false }, priorYearTax: m(90000), priorYearAGI: m(200000) };
    const r = compose({
      taxYear: 2025,
      facts,
      payments: [],
      periods: {
        mar31: { ...periods.mar31, wages: m(75000), stateAndLocalTaxesPaid: m(15000), mortgageInterestPaid: m(7500) },
        may31: { ...periods.may31, wages: m(125000), stateAndLocalTaxesPaid: m(15000), mortgageInterestPaid: m(12500) },
        aug31: { ...periods.aug31, wages: m(200000), stateAndLocalTaxesPaid: m(22000), mortgageInterestPaid: m(20000) },
      },
    });
    expect((r.scheduleAI as { refused: string[] }).refused[0]).toMatch(/SALT/);
  });
});
