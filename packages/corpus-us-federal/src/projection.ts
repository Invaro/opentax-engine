/**
 * Projection mode: federal rules for tax years after the last published year
 * (2027), built from each provision's own statutory indexing formula and an
 * inflation rate the caller ASSUMES.
 *
 * The method. An indexed amount for year Y is its statutory base amount ×
 * the index for year Y−1 ÷ the index for its base year, rounded as the
 * statute says (e.g. § 1(f)(3), (f)(7): the C-CPI-U for the 12 months ending
 * August 31, rounded down to a multiple of $25). For 2027 the index is
 * published, so `base × index ÷ baseIndex` is the exact UNROUNDED 2027 amount
 * (spec.ts records it and a test reproduces every published 2025–2027 amount
 * from it). For 2028+ the index is unknown, so it is assumed to grow by the
 * chosen rate each year:
 *
 *     amount(Y) = round( unrounded2027 × (1 + r)^(Y − 2027) )
 *
 * Wage-indexed amounts (the social security wage base, the household
 * employee threshold) use the national average wage index the same way, at a
 * wage growth rate that defaults to the inflation rate.
 *
 * Law that is known, not projected, is applied as law: the § 164(b)(7) SALT
 * limit's 101% steps through 2029 and its return to $10,000 in 2030, and the
 * end of the § 224 / § 225 / § 163(h)(4) / § 151(f) deductions after 2028.
 *
 * What the result is: a corpus whose 2027-only rules are cloned into year Y
 * with their indexed amounts replaced, each clone citing "PROJECTED" and the
 * assumed rates. Its Merkle root differs from the published corpus's, and its
 * version string names the year and rates, so a proof made with it says so
 * and `opentax verify` can rebuild the same corpus. A rule the 2027 corpus
 * refuses (e.g. a 2027 IRA contribution) still refuses; a provision whose
 * index isn't a price index (the § 36B applicable percentage) refuses when
 * used. Nothing published is changed.
 */

import { loadCorpus } from "@invaro/opentax-core";
import type { CorpusInput, Expr, LoadedCorpus, Rule } from "@invaro/opentax-core";
import { PROJECTION_PARAMS, FIXED_LITERALS, NOT_PROJECTED, type ProjectionParam } from "./projection-spec.js";

export const LAST_PUBLISHED_YEAR = 2027;
export const PROJECTION_HORIZON = 2035;

export type ProjectionOptions = {
  /** the tax year to project (2028–2035) */
  year: number;
  /** assumed annual C-CPI-U growth, in percent (e.g. "2.5") */
  inflationPercent: string;
  /** assumed annual growth of the national average wage index, in percent; defaults to inflationPercent */
  wageGrowthPercent?: string;
};

/** a percent string → exact rational (num/den), e.g. "2.5" → 25/1000 */
function percentToRational(p: string, label: string): { num: bigint; den: bigint } {
  const m = /^(-?)(\d{1,2})(?:\.(\d{1,4}))?$/.exec(p.trim());
  if (!m) throw new Error(`${label}: expected a percent like 2.5 (at most 4 decimals), got "${p}"`);
  const frac = m[3] ?? "";
  const den = 100n * 10n ** BigInt(frac.length);
  const num = BigInt(m[2] + frac) * (m[1] ? -1n : 1n);
  if (num * 100n < -10n * den || num * 100n > 25n * den) throw new Error(`${label}: ${p}% is outside -10% to 25%`);
  return { num, den };
}

type Rat = { n: bigint; d: bigint };
const mul = (a: Rat, b: Rat): Rat => ({ n: a.n * b.n, d: a.d * b.d });
const pow = (a: Rat, k: number): Rat => {
  let r: Rat = { n: 1n, d: 1n };
  for (let i = 0; i < k; i++) r = mul(r, a);
  return r;
};
/** round a nonnegative rational number of cents to a multiple of `multiple` cents */
function roundTo(x: Rat, multiple: bigint, mode: "down" | "nearest"): bigint {
  if (x.n < 0n) throw new Error("projection: negative amount");
  const d = x.d * multiple;
  // "down": the next lower multiple; "nearest": half a multiple rounds up
  const q = mode === "down" ? x.n / d : (2n * x.n + d) / (2n * d);
  return q * multiple;
}

const PARAM_BY_ID = new Map(PROJECTION_PARAMS.map((p) => [p.id, p]));

/** the projected value of one parameter for `year`, in cents */
export function projectedValue(p: ProjectionParam, year: number, opts: ProjectionOptions): bigint {
  if (p.kind === "law") return BigInt(p.byYear(year));
  if (p.kind === "derived") {
    let sum: Rat = { n: 0n, d: 1n };
    for (const t of p.terms) {
      const q = PARAM_BY_ID.get(t.param);
      if (!q) throw new Error(`projection spec: unknown parameter ${t.param}`);
      const v = projectedValue(q, year, opts);
      const term: Rat = { n: v * BigInt(t.num), d: BigInt(t.den) };
      sum = { n: sum.n * term.d + term.n * sum.d, d: sum.d * term.d };
    }
    return roundTo(sum, BigInt(p.roundCents), p.roundMode);
  }
  const growth = percentToRational(
    p.index === "awi" ? (opts.wageGrowthPercent ?? opts.inflationPercent) : opts.inflationPercent,
    p.index === "awi" ? "wageGrowthPercent" : "inflationPercent",
  );
  const g: Rat = { n: growth.den + growth.num, d: growth.den };
  const at = (y: number): bigint => {
    // the index the formula divides into grows by g each year after the one used for 2027
    const k = y - LAST_PUBLISHED_YEAR;
    let raw: Rat = { n: 0n, d: 1n };
    let base = 0n;
    for (const c of p.comps) {
      const term = mul({ n: BigInt(c.baseCents), d: 1n }, mul({ n: BigInt(c.ratio[0]), d: BigInt(c.ratio[1]) }, pow(g, k)));
      raw = { n: raw.n * term.d + term.n * raw.d, d: raw.d * term.d };
      base += BigInt(c.baseCents);
    }
    // a cost-of-living adjustment below zero is not applied (the ratio is at least 1)
    if (raw.n < base * raw.d) raw = { n: base, d: 1n };
    if (p.on === "amount") return roundTo(raw, BigInt(p.roundCents), p.roundMode);
    return base + roundTo({ n: raw.n - base * raw.d, d: raw.d }, BigInt(p.roundCents), p.roundMode);
  };
  let v = at(year);
  if (p.neverDecreases) for (let y = LAST_PUBLISHED_YEAR; y < year; y++) if (at(y) > v) v = at(y);
  return v;
}

// ---------------------------------------------------------------------------
// literal walking

type Slot = { path: string; get: () => string; set: (v: string) => void };

/** every money literal, bracket threshold and money parameter in a rule (excluding citations) */
export function moneySlots(rule: Rule): Slot[] {
  const out: Slot[] = [];
  const walk = (x: unknown, path: string): void => {
    if (Array.isArray(x)) return x.forEach((v, i) => walk(v, `${path}[${i}]`));
    if (!x || typeof x !== "object") return;
    const o = x as Record<string, unknown>;
    if (o.kind === "money" && typeof o.cents === "string") out.push({ path, get: () => o.cents as string, set: (v) => (o.cents = v) });
    if (o.kind === "brackets" && Array.isArray(o.table))
      (o.table as { threshold: string }[]).forEach((row, i) =>
        out.push({ path: `${path}.table[${i}]`, get: () => row.threshold, set: (v) => (row.threshold = v) }),
      );
    if (o.type === "money" && typeof o.value === "string" && !("kind" in o))
      out.push({ path, get: () => o.value as string, set: (v) => (o.value = v) });
    for (const [k, v] of Object.entries(o)) {
      if (k === "citation") continue;
      // match cases are named by their value ("cases[single]"), so a path says which filing status it is
      if (k === "cases" && Array.isArray(v)) (v as { when: string }[]).forEach((c, i) => walk(c, `${path}.cases[${c.when ?? i}]`));
      else walk(v, `${path}.${k}`);
    }
  };
  walk({ formula: rule.formula, applicability: rule.applicability, parameters: rule.parameters }, "");
  return out;
}

const inWindow = (r: Rule, d: string) => r.effectiveFrom <= d && (r.effectiveTo === undefined || d < r.effectiveTo);

/** the published federal rules whose 2027 version ends with 2027 — the ones a projection must rebuild */
export function rulesEndingWith2027(base: CorpusInput): Rule[] {
  return base.rules.filter(
    (r) => r.jurisdiction === "us.federal" && inWindow(r, `${LAST_PUBLISHED_YEAR}-06-30`) && r.effectiveTo === `${LAST_PUBLISHED_YEAR + 1}-01-01`,
  );
}

/** the parameters a literal could be, for a rule */
function candidates(ruleId: string, cents: string, path: string): ProjectionParam[] {
  // the innermost match case on the path is the filing status the amount belongs to
  const cases = [...path.matchAll(/cases\[([^\]]+)\]/g)];
  const status = cases.length ? cases[cases.length - 1][1] : undefined;
  return PROJECTION_PARAMS.filter(
    (p) =>
      p.published2027 === cents &&
      p.rules.some(
        (r) =>
          r.id === ruleId &&
          (r.statuses === undefined || (status !== undefined && r.statuses.includes(status))) &&
          (r.path === undefined || new RegExp(r.path).test(path)),
      ),
  );
}

/**
 * Classify every literal of every 2027-only rule: indexed (exactly one
 * parameter), fixed (declared), or an error. Exported for the test that keeps
 * the classification complete.
 */
export function classifyLiterals(base: CorpusInput): { ruleId: string; path: string; cents: string; param?: string; fixed?: true; error?: string }[] {
  const out: ReturnType<typeof classifyLiterals> = [];
  for (const r of rulesEndingWith2027(base)) {
    if (NOT_PROJECTED[r.id]) continue;
    for (const s of moneySlots(r)) {
      const cents = s.get();
      const c = candidates(r.id, cents, s.path);
      const fixed = FIXED_LITERALS[r.id]?.includes(cents) || cents === "0";
      if (c.length === 1) out.push({ ruleId: r.id, path: s.path, cents, param: c[0].id });
      else if (c.length > 1) out.push({ ruleId: r.id, path: s.path, cents, error: `ambiguous: ${c.map((p) => p.id).join(", ")}` });
      else if (fixed) out.push({ ruleId: r.id, path: s.path, cents, fixed: true });
      else out.push({ ruleId: r.id, path: s.path, cents, error: "neither an indexed parameter nor a declared fixed amount" });
    }
  }
  return out;
}

const SUNSET_AFTER_2028: Record<string, string> = {
  "us.federal.tips_deduction": "26 U.S.C. § 224(h) (OBBBA § 70201): no deduction for taxable years beginning after December 31, 2028",
  "us.federal.eligible.tips_deduction": "26 U.S.C. § 224(h) (OBBBA § 70201): no deduction for taxable years beginning after December 31, 2028",
  "us.federal.eligible.tips_occupation": "26 U.S.C. § 224(h) (OBBBA § 70201): no deduction for taxable years beginning after December 31, 2028",
  "us.federal.overtime_deduction": "26 U.S.C. § 225(e) (OBBBA § 70202): no deduction for taxable years beginning after December 31, 2028",
  "us.federal.car_loan_interest_deduction": "26 U.S.C. § 163(h)(4)(D) (OBBBA § 70203): applies only to taxable years beginning before January 1, 2029",
  "us.federal.senior_deduction": "26 U.S.C. § 151(f)(4) (OBBBA § 70103): applies only to taxable years beginning before January 1, 2029",
  "us.federal.senior_deduction.magi_threshold": "26 U.S.C. § 151(f)(4) (OBBBA § 70103): applies only to taxable years beginning before January 1, 2029",
};

/** Build the corpus input for a projected year. Throws when the year or the rates are out of range. */
export function projectCorpusInput(base: CorpusInput, opts: ProjectionOptions): CorpusInput {
  const { year } = opts;
  if (!Number.isInteger(year) || year <= LAST_PUBLISHED_YEAR || year > PROJECTION_HORIZON)
    throw new Error(`projection covers tax years ${LAST_PUBLISHED_YEAR + 1}–${PROJECTION_HORIZON}; ${year} is published law or beyond the horizon`);
  const r = percentToRational(opts.inflationPercent, "inflationPercent");
  const w = opts.wageGrowthPercent === undefined ? r : percentToRational(opts.wageGrowthPercent, "wageGrowthPercent");
  // exact decimal (den is a power of ten), so the version string round-trips: "3.5", never "3.5000000000000004"
  const fmtPct = (x: { num: bigint; den: bigint }) => {
    const scale = x.den / 100n; // percent = num / scale
    const neg = x.num < 0n;
    const a = neg ? -x.num : x.num;
    const digits = scale.toString().length - 1;
    const whole = (a / scale).toString();
    const frac = digits ? (a % scale).toString().padStart(digits, "0").replace(/0+$/, "") : "";
    return `${neg ? "-" : ""}${whole}${frac ? "." + frac : ""}`;
  };
  const tag = `projected.${year}.cpi-${fmtPct(r)}.awi-${fmtPct(w)}`;
  const from = `${year}-01-01`;
  const to = `${year + 1}-01-01`;
  const errors = classifyLiterals(base).filter((x) => x.error);
  if (errors.length) throw new Error(`projection spec is incomplete: ${errors.slice(0, 5).map((e) => `${e.ruleId} ${e.path} ${e.cents}: ${e.error}`).join("; ")}`);

  const added: Rule[] = [];
  for (const rule of rulesEndingWith2027(base)) {
    const clone = structuredClone(rule) as Rule;
    clone.version = rule.version + 1000 * (year - LAST_PUBLISHED_YEAR);
    clone.effectiveFrom = from;
    clone.effectiveTo = to;
    const changed: string[] = [];
    if (NOT_PROJECTED[rule.id]) {
      const np = NOT_PROJECTED[rule.id];
      clone.formula = { kind: "if", cond: np.usedWhen, then: { kind: "unsupported", reason: `${year} is a projection: ${np.reason}` }, else: clone.formula } as Expr;
      changed.push(`refuses when used — ${np.reason}`);
    } else {
      for (const s of moneySlots(clone)) {
        const c = candidates(rule.id, s.get(), s.path);
        if (c.length !== 1) continue;
        const v = projectedValue(c[0], year, opts).toString();
        if (v !== s.get()) changed.push(`${c[0].label}: ${s.get()} → ${v}`);
        s.set(v);
      }
    }
    clone.title = `${rule.title} — PROJECTED ${year}`;
    clone.citation = {
      ...rule.citation,
      source: `PROJECTION, NOT PUBLISHED LAW (${year}; C-CPI-U +${fmtPct(r)}%/yr, average wage index +${fmtPct(w)}%/yr assumed after the indexes used for 2027): ${rule.citation.source}`,
      excerpt: `${rule.citation.excerpt} [Projected from 2027 by each amount's statutory indexing formula at the assumed rates. Projected amounts: ${changed.length ? [...new Set(changed)].join("; ") : "none in this rule"}.]`,
    };
    added.push(clone);
  }
  if (year > 2028) {
    for (const [id, cite] of Object.entries(SUNSET_AFTER_2028)) {
      const last = base.rules.filter((r) => r.id === id).sort((a, b) => b.version - a.version)[0];
      if (!last) continue;
      added.push({
        id,
        version: last.version + 1000 * (year - LAST_PUBLISHED_YEAR),
        jurisdiction: last.jurisdiction,
        title: `${last.title} — ended after 2028`,
        citation: { source: cite, section: last.citation.section, url: last.citation.url, excerpt: `The provision does not apply to ${year}: ${cite}.` },
        effectiveFrom: from,
        effectiveTo: to,
        output: last.output,
        formula: (last.output.type === "bool" ? { kind: "bool", value: false } : { kind: "money", cents: "0" }) as Expr,
      } as Rule);
    }
  }
  // every federal rule that existed in 2027 must exist in the projected year
  const covered = new Set([...base.rules.filter((r) => inWindow(r, `${year}-06-30`)), ...added].map((r) => r.id));
  const missing = [...new Set(base.rules.filter((r) => r.jurisdiction === "us.federal" && inWindow(r, `${LAST_PUBLISHED_YEAR}-06-30`)).map((r) => r.id))].filter(
    (id) => !covered.has(id),
  );
  if (missing.length) throw new Error(`projection has no ${year} version of: ${missing.join(", ")}`);
  return { name: base.name, version: `${base.version}+${tag}`, rules: [...base.rules, ...added], facts: base.facts };
}

const cache = new Map<string, LoadedCorpus>();
export function getProjectedCorpus(base: CorpusInput, opts: ProjectionOptions): LoadedCorpus {
  const key = JSON.stringify([base.version, opts.year, opts.inflationPercent, opts.wageGrowthPercent ?? null]);
  let c = cache.get(key);
  if (!c) {
    c = loadCorpus(projectCorpusInput(base, opts));
    if (cache.size > 32) cache.clear();
    cache.set(key, c);
  }
  return c;
}

/** read the projection back from a corpus version string ("0.46.0+projected.2029.cpi-2.5.awi-3") */
export function projectionFromVersion(version: string): ProjectionOptions | null {
  const m = /\+projected\.(\d{4})\.cpi-(-?[\d.]+)\.awi-(-?[\d.]+)$/.exec(version);
  return m ? { year: Number(m[1]), inflationPercent: m[2], wageGrowthPercent: m[3] } : null;
}
