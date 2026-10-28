/**
 * Retirement contribution MAXIMUMS for a self-employed person or an
 * S-corporation owner-employee — planning targets: they say how much can go
 * in, and feed nothing else (the deduction actually taken is
 * us.federal.sep_deduction, from sepContribution).
 *
 * Schedule C (sole proprietor), the IRS Pub 560 (2025) Deduction Worksheet
 * for Self-Employed at a 25% plan contribution rate:
 *   step 3   net earnings = net profit − the ½-SE-tax deduction (this
 *            person's own Schedule SE line 13)
 *   step 5   20% of step 3 (Rate Table for Self-Employed: 25% → 0.200000)
 *   step 6   25% × the § 401(a)(17) compensation limit
 *   step 8   the § 415(c)(1)(A) dollar limit
 *   step 9   elective deferrals, not more than the § 402(g) limit
 *   step 13  employer part = smallest of step 7, step 8 − step 9, ½(step 3 − step 9)
 *   step 15  deferral part = smaller of step 9 and step 3 − step 13
 *   step 18  catch-up = smaller of (step 3 − step 13 − step 15) and the catch-up
 * A SEP is the same without deferrals: the smaller of step 7 and step 8.
 * The maximum takes step 9 at the most the person may defer: the § 402(g)
 * room left after other employers' plans, never more than step 3.
 *
 * S corporation: compensation is W-2 wages from the corporation plus the
 * deferrals to its plan (§ 415(c)(3)); the employer part is 25% of it
 * (§ 404(a)(3), (l)), capped at the § 401(a)(17) limit; deferrals plus the
 * employer part may not exceed the § 415(c) limit or 100% of compensation;
 * catch-up sits outside § 415(c) but within compensation less deferrals
 * (§ 414(v)(2)(A)).
 *
 * Limits — Notice 2024-80 (2025) and Notice 2025-67 (2026), read from the
 * notices: § 402(g)(1) $23,500 / $24,500; § 414(v)(2)(B)(i) catch-up $7,500 /
 * $8,000; § 414(v)(2)(E)(i) age 60–63 catch-up $11,250 / $11,250; § 415(c)(1)(A)
 * $70,000 / $72,000; § 401(a)(17) $350,000 / $360,000.
 *
 * Scope, disclosed: one person (the first spouse: selfEmploymentNetProfit,
 * or ownerEmployeePlanCompensation); a 401(k) or SEP at the maximum 25% rate, not a
 * SIMPLE or defined benefit plan; Roth designation does not change the
 * maximum. Amounts round DOWN to the cent so a maximum is never overstated.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";
const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const param = (name: string): Expr => ({ kind: "param", name });
const zero = money("0");
const min = (...args: Expr[]): Expr => ({ kind: "min", args });
const add = (...args: Expr[]): Expr => ({ kind: "add", args });
const sub = (left: Expr, right: Expr): Expr => ({ kind: "sub", left, right });
const max0 = (arg: Expr): Expr => ({ kind: "max0", arg });
const pct = (num: string, den: string, base: Expr): Expr => ({ kind: "mulRate", base, rate: { num, den }, round: "floor" });

interface YearLimits {
  version: number;
  effectiveFrom: string;
  effectiveTo: string;
  yearLabel: string;
  notice: string;
  deferral: string; // § 402(g)(1)
  catchUp: string; // § 414(v)(2)(B)(i)
  catchUp60to63: string; // § 414(v)(2)(E)(i)
  annualAdditions: string; // § 415(c)(1)(A)
  compensation: string; // § 401(a)(17)
}

const YEARS: YearLimits[] = [
  {
    version: 1, effectiveFrom: "2025-01-01", effectiveTo: "2026-01-01", yearLabel: "2025", notice: "Notice 2024-80",
    deferral: "2350000", catchUp: "750000", catchUp60to63: "1125000", annualAdditions: "7000000", compensation: "35000000",
  },
  {
    version: 2, effectiveFrom: "2026-01-01", effectiveTo: "2027-01-01", yearLabel: "2026", notice: "Notice 2025-67",
    deferral: "2450000", catchUp: "800000", catchUp60to63: "1125000", annualAdditions: "7200000", compensation: "36000000",
  },
];

const limitParams = (y: YearLimits) => ({
  deferralLimit: { value: y.deferral, type: "money" as const },
  catchUpLimit: { value: y.catchUp, type: "money" as const },
  catchUpLimit60to63: { value: y.catchUp60to63, type: "money" as const },
  annualAdditionLimit: { value: y.annualAdditions, type: "money" as const },
  compensationLimit: { value: y.compensation, type: "money" as const },
});

const limitsLabel = (y: YearLimits): string =>
  `${y.yearLabel} (${y.notice}): § 402(g) $${dollars(y.deferral)}; catch-up $${dollars(y.catchUp)}, $${dollars(y.catchUp60to63)} at ages 60–63; § 415(c) $${dollars(y.annualAdditions)}; § 401(a)(17) $${dollars(y.compensation)}`;

function dollars(cents: string): string {
  return (BigInt(cents) / 100n).toLocaleString("en-US");
}

// the person's catch-up limit: none under 50; the higher limit for ages 60–63
const catchUpLimit: Expr = {
  kind: "if",
  cond: fact("isAge50OrOlder"),
  then: { kind: "if", cond: fact("isAge60Through63"), then: param("catchUpLimit60to63"), else: param("catchUpLimit") },
  else: zero,
};
// § 402(g) and catch-up room are per person across every plan: other
// employers' deferrals fill the regular limit first, any excess was catch-up
const deferralRoom: Expr = max0(sub(param("deferralLimit"), fact("otherElectiveDeferrals")));
const catchUpRoom: Expr = sub(max0(sub(add(param("deferralLimit"), catchUpLimit), fact("otherElectiveDeferrals"))), deferralRoom);

const step3 = ruleRef("us.federal.retirement.plan_compensation.schedule_c");
// steps 5–7: 20% of net earnings, capped at 25% of the compensation limit
const step7: Expr = min(pct("20", "100", step3), pct("25", "100", param("compensationLimit")));
// step 9 at the maximum: all the § 402(g) room, never more than net earnings
const step9: Expr = min(deferralRoom, step3);

const scheduleCEmployer = ruleRef("us.federal.retirement.solo_401k_max.schedule_c.employer");
const scheduleCDeferral = ruleRef("us.federal.retirement.solo_401k_max.schedule_c.deferral");
const scheduleCCatchUp = ruleRef("us.federal.retirement.solo_401k_max.schedule_c.catch_up");

const W = fact("ownerEmployeePlanCompensation");
const sCorpEmployerRate: Expr = pct("25", "100", min(W, param("compensationLimit")));
const sCorpDeferral = ruleRef("us.federal.retirement.solo_401k_max.s_corp.deferral");

const PUB560 = {
  source: "IRS Pub 560 (2025), chapter 5, Deduction Worksheet for Self-Employed; 26 U.S.C. §§ 401(a)(17), 401(c)(2), 402(g), 404(a)(8), 414(v), 415(c)",
  url: "https://www.irs.gov/publications/p560",
};
const SCORP = {
  source: "26 U.S.C. §§ 401(a)(17), 402(g), 404(a)(3), (l), 414(v), 415(c); IRS Pub 560",
  url: "https://www.law.cornell.edu/uscode/text/26/415",
};

function yearRules(y: YearLimits): Rule[] {
  const common = { version: y.version, jurisdiction: J, effectiveFrom: y.effectiveFrom, effectiveTo: y.effectiveTo, output: { type: "money" as const }, parameters: limitParams(y) };
  const limits = limitsLabel(y);
  return [
    {
      ...common,
      id: "us.federal.retirement.sep_max.schedule_c",
      title: `Maximum SEP contribution for a sole proprietor (TY${y.yearLabel})`,
      citation: {
        ...PUB560,
        section: "Pub 560 Deduction Worksheet for Self-Employed, steps 1–8; § 404(a)(8)(C), (h)",
        excerpt: `Step 3 'Net earnings from self-employment. Subtract step 2 from step 1'; Rate Table for Self-Employed: a 25% plan rate is 0.200000 — 'The deduction for annual employer contributions… to a SEP plan… can't be more than 20% of your net earnings (figured without deducting contributions for yourself)'; step 6 'Multiply $350,000 by your plan contribution rate'; step 8 the contribution dollar limit. [Limits ${limits}. Without elective deferrals the maximum is the smaller of step 7 and step 8.]`,
      },
      formula: min(step7, param("annualAdditionLimit")),
    },
    {
      ...common,
      id: "us.federal.retirement.solo_401k_max.schedule_c.employer",
      title: `Solo 401(k) maximum for a sole proprietor: employer (profit-sharing) part (TY${y.yearLabel}; Pub 560 step 13)`,
      citation: {
        ...PUB560,
        section: "Pub 560 Deduction Worksheet for Self-Employed, steps 9–13",
        excerpt: `Step 9 'Enter your allowable elective deferrals… Don't enter more than $23,500'; step 10 'Subtract step 9 from step 8'; step 11 'Subtract step 9 from step 3'; step 12 'Enter one-half of step 11'; step 13 'Enter the smallest of step 7, step 10, or step 12.' [At the maximum, step 9 is the whole § 402(g) room left after other employers' plans (otherElectiveDeferrals), never more than step 3. Limits ${limits}.]`,
      },
      formula: min(
        step7,
        sub(param("annualAdditionLimit"), step9),
        pct("50", "100", sub(step3, step9)),
      ),
    },
    {
      ...common,
      id: "us.federal.retirement.solo_401k_max.schedule_c.deferral",
      title: `Solo 401(k) maximum for a sole proprietor: elective deferral part (TY${y.yearLabel}; Pub 560 step 15)`,
      citation: {
        ...PUB560,
        section: "Pub 560 Deduction Worksheet for Self-Employed, steps 14–15; § 402(g)(1)",
        excerpt: `Step 14 'Subtract step 13 from step 3'; step 15 'Enter the smaller of step 9 or step 14.' [Step 9 at the maximum: the § 402(g) limit less deferrals to other employers' plans. Limits ${limits}.]`,
      },
      formula: min(step9, sub(step3, scheduleCEmployer)),
    },
    {
      ...common,
      id: "us.federal.retirement.solo_401k_max.schedule_c.catch_up",
      title: `Solo 401(k) maximum for a sole proprietor: catch-up part (TY${y.yearLabel}; Pub 560 step 18)`,
      citation: {
        ...PUB560,
        section: "Pub 560 Deduction Worksheet for Self-Employed, steps 16–18; § 414(v)(2)(B)(i), (E)(i)",
        excerpt: `Step 16 'Subtract step 15 from step 14'; step 17 'Enter your catch-up contributions… if any'; step 18 'Enter the smaller of step 16 or step 17.' [Catch-up needs age 50 by year end (isAge50OrOlder); the § 414(v)(2)(E)(i) limit applies to those who attain 60, 61, 62 or 63 in the year (isAge60Through63). Catch-up already made to other employers' plans uses the same limit. Limits ${limits}.]`,
      },
      formula: min(sub(sub(step3, scheduleCEmployer), scheduleCDeferral), catchUpRoom),
    },
    {
      ...common,
      id: "us.federal.retirement.solo_401k_max.schedule_c",
      title: `Maximum solo 401(k) contribution for a sole proprietor (TY${y.yearLabel}; Pub 560 step 19: employer + deferral + catch-up)`,
      citation: {
        ...PUB560,
        section: "Pub 560 Deduction Worksheet for Self-Employed, step 19",
        excerpt: `Step 19 'Add steps 13, 15, and 18.' [The maximum the plan can take for this person, Roth designation included (step 21 only splits designated Roth contributions out of the deduction). Limits ${limits}.]`,
      },
      formula: add(scheduleCEmployer, scheduleCDeferral, scheduleCCatchUp),
    },
    {
      ...common,
      id: "us.federal.retirement.sep_max.s_corp",
      title: `Maximum SEP contribution for an S-corporation owner-employee (TY${y.yearLabel})`,
      citation: {
        ...SCORP,
        section: "§ 404(h)(1)(C); § 401(a)(17); § 415(c)(1)",
        excerpt: `Employer SEP contributions are deductible up to 25 percent of the compensation paid to the employee (§ 404(h)(1)(C)), counting compensation only up to the § 401(a)(17) limit, and the annual addition may not exceed the lesser of the § 415(c)(1)(A) dollar limit or 100 percent of compensation. [Compensation: ownerEmployeePlanCompensation, W-2 wages from the corporation. Limits ${limits}.]`,
      },
      formula: min(sCorpEmployerRate, param("annualAdditionLimit")),
    },
    {
      ...common,
      id: "us.federal.retirement.solo_401k_max.s_corp.deferral",
      title: `Solo 401(k) maximum for an S-corporation owner-employee: elective deferral part (TY${y.yearLabel})`,
      citation: {
        ...SCORP,
        section: "§ 402(g)(1); § 415(c)(3)(D)",
        excerpt: `Elective deferrals are limited to the § 402(g)(1) amount for the year, shared across every plan the person defers into, and to the compensation paid. [Room left after other employers' plans (otherElectiveDeferrals). Limits ${limits}.]`,
      },
      formula: min(deferralRoom, W),
    },
    {
      ...common,
      id: "us.federal.retirement.solo_401k_max.s_corp.employer",
      title: `Solo 401(k) maximum for an S-corporation owner-employee: employer part (TY${y.yearLabel})`,
      citation: {
        ...SCORP,
        section: "§ 404(a)(3)(A); § 404(l); § 415(c)(1)",
        excerpt: `The employer deduction is limited to 25 percent of compensation (elective deferrals included, § 404(a)(12)), counting compensation only up to the § 401(a)(17) limit; deferrals plus employer contributions — the annual additions — may not exceed the lesser of the § 415(c)(1)(A) dollar limit or 100 percent of compensation. [Limits ${limits}.]`,
      },
      formula: min(sCorpEmployerRate, sub(param("annualAdditionLimit"), sCorpDeferral), sub(W, sCorpDeferral)),
    },
    {
      ...common,
      id: "us.federal.retirement.solo_401k_max.s_corp.catch_up",
      title: `Solo 401(k) maximum for an S-corporation owner-employee: catch-up part (TY${y.yearLabel})`,
      citation: {
        ...SCORP,
        section: "§ 414(v)(2)(A), (B)(i), (E)(i); § 414(v)(3)(A)",
        excerpt: `Catch-up contributions may not exceed the lesser of the applicable dollar amount or the participant's compensation reduced by their other elective deferrals (§ 414(v)(2)(A)), and are not counted against the § 415(c) limit (§ 414(v)(3)(A)). [Age 50 by year end (isAge50OrOlder); the higher limit for ages 60–63 (isAge60Through63). Limits ${limits}.]`,
      },
      formula: min(catchUpRoom, sub(W, sCorpDeferral)),
    },
    {
      ...common,
      id: "us.federal.retirement.solo_401k_max.s_corp",
      title: `Maximum solo 401(k) contribution for an S-corporation owner-employee (TY${y.yearLabel}: deferral + employer + catch-up)`,
      citation: {
        ...SCORP,
        section: "§§ 402(g), 404(a)(3), 414(v), 415(c)",
        excerpt: `The most the plan can take for this person: elective deferrals, the employer contribution, and catch-up. [At low compensation the maximum can defer all of it; the employee's share of FICA is still withheld from pay, which in practice leaves less to defer. Limits ${limits}.]`,
      },
      formula: add(
        sCorpDeferral,
        ruleRef("us.federal.retirement.solo_401k_max.s_corp.employer"),
        ruleRef("us.federal.retirement.solo_401k_max.s_corp.catch_up"),
      ),
    },
  ];
}

export const retirementLimitRules: Rule[] = [
  {
    id: "us.federal.retirement.plan_compensation.schedule_c",
    version: 1,
    jurisdiction: J,
    title: "Net earnings for a sole proprietor's retirement plan (Pub 560 step 3: net profit − the ½-SE-tax deduction)",
    citation: {
      ...PUB560,
      section: "Pub 560 Deduction Worksheet for Self-Employed, steps 1–3; § 401(c)(2)",
      excerpt:
        "Step 1 'Enter your net profit from Schedule C (Form 1040), line 31'; step 2 'Enter your deduction for self-employment tax from Schedule 1 (Form 1040), line 15'; step 3 'Net earnings from self-employment. Subtract step 2 from step 1.' [The person in selfEmploymentNetProfit, with their own Schedule SE line 13 — on a joint return with two self-employed spouses, not the couple's Schedule 1 line 15.]",
    },
    effectiveFrom: "2025-01-01",
    output: { type: "money" },
    formula: max0(sub(fact("selfEmploymentNetProfit"), ruleRef("us.federal.se_tax_half_deduction.taxpayer"))),
  },
  ...YEARS.flatMap(yearRules),
];
