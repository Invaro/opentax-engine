/**
 * Parameter lookup: search the corpus for the dollar amounts behind a
 * plain-English question ("standard deduction", "CTC phase-out threshold")
 * and return them WITH their citations and validity windows — the
 * fact-checking primitive behind verify_fact.
 *
 * Values are pulled from two places: declared rule `parameters`, and money
 * literals inside `match`-on-filingStatus tables (where per-status amounts
 * like the standard deduction actually live).
 */

import { walkExpr } from "@invaro/opentax-core";
import type { Citation, LoadedCorpus, Rule } from "@invaro/opentax-core";

export interface LookupHit {
  ruleId: string;
  version: number;
  title: string;
  citation: Citation;
  effectiveFrom: string;
  effectiveTo?: string;
  /** Declared parameters: name -> cents (money only). */
  parameters: Record<string, string>;
  /** Per-filing-status money values found in match tables: status -> cents. */
  byFilingStatus: Record<string, string>;
  score: number;
}

const tokenize = (s: string): string[] =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter((t) => t.length > 2);

function extractByStatus(rule: Rule): Record<string, string> {
  const out: Record<string, string> = {};
  walkExpr(rule.formula, (e) => {
    if (
      e.kind === "match" &&
      e.on.kind === "fact" &&
      e.on.factId === "filingStatus"
    ) {
      for (const c of e.cases) {
        if (c.value.kind === "money") out[c.when] = c.value.cents;
      }
    }
  });
  return out;
}

// Jurisdiction codes expand to searchable names so "illinois" or "nyc"
// reach us.il / us.ny rules the same way "eitc" reaches us.federal ones.
const JURISDICTION_NAMES: Record<string, string> = {
  "us.il": "illinois il il-1040",
  "us.ca": "california ca ftb form 540",
  "us.ny": "new york ny nyc it-201",
  "us.va": "virginia va form 760",
  "us.md": "maryland md form 502 baltimore county local",
};

export function lookupParameters(
  corpus: LoadedCorpus,
  query: string,
  asOf?: string,
): LookupHit[] {
  const tokens = tokenize(query);
  if (tokens.length === 0) return [];

  const hits: LookupHit[] = [];
  for (const rule of corpus.rules) {
    if (
      asOf &&
      !(rule.effectiveFrom <= asOf && (rule.effectiveTo === undefined || asOf < rule.effectiveTo))
    ) {
      continue;
    }
    // parameter names count as strong signal: "per child" should rank the
    // rule whose parameter is literally `perChild`
    const paramWords = Object.keys(rule.parameters ?? {})
      .map((n) => n.replace(/([A-Z])/g, " $1").toLowerCase())
      .join(" ");
    const haystackStrong =
      `${rule.id} ${rule.title} ${paramWords} ${JURISDICTION_NAMES[rule.jurisdiction] ?? ""}`.toLowerCase();
    const haystackWeak =
      `${rule.citation.source} ${rule.citation.section} ${rule.citation.excerpt}`.toLowerCase();
    let score = 0;
    for (const t of tokens) {
      if (haystackStrong.includes(t)) score += 2;
      else if (haystackWeak.includes(t)) score += 1;
    }
    if (score === 0) continue;

    const parameters: Record<string, string> = {};
    for (const [name, p] of Object.entries(rule.parameters ?? {})) {
      if (p.type === "money") parameters[name] = String(p.value);
    }
    const byFilingStatus = extractByStatus(rule);
    if (Object.keys(parameters).length === 0 && Object.keys(byFilingStatus).length === 0) {
      // still useful as a citation hit, but rank below value-bearing rules
      score -= 1;
      if (score <= 0) continue;
    }
    hits.push({
      ruleId: rule.id,
      version: rule.version,
      title: rule.title,
      citation: rule.citation,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
      parameters,
      byFilingStatus,
      score,
    });
  }

  hits.sort((a, b) => b.score - a.score || a.ruleId.localeCompare(b.ruleId));
  return hits.slice(0, 5);
}

export interface RuleSearchHit {
  ruleId: string;
  version: number;
  title: string;
  jurisdiction: string;
  citation: Citation;
  effectiveFrom: string;
  effectiveTo?: string;
  /** Verbatim law-text excerpt, trimmed around the first query match. */
  snippet: string;
  /** Whether the rule carries dollar parameters (lookupParameters territory). */
  hasParameters: boolean;
  score: number;
}

const SNIPPET_LEN = 280;

function makeSnippet(excerpt: string, tokens: string[]): string {
  if (excerpt.length <= SNIPPET_LEN) return excerpt;
  const lower = excerpt.toLowerCase();
  let at = -1;
  for (const t of tokens) {
    const i = lower.indexOf(t);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  const start = Math.max(0, Math.min(at === -1 ? 0 : at - 60, excerpt.length - SNIPPET_LEN));
  const cut = excerpt.slice(start, start + SNIPPET_LEN);
  return `${start > 0 ? "…" : ""}${cut}${start + SNIPPET_LEN < excerpt.length ? "…" : ""}`;
}

/**
 * Full-text search over the corpus — rule ids, titles, parameter names,
 * jurisdictions, and the statutory citations/excerpts themselves. Coverage
 * answers, not values: a hit means the engine computes this; use
 * `lookupParameters` for the dollar amounts and `explain_rule` for formulas.
 */
export function searchRules(
  corpus: LoadedCorpus,
  query: string,
  asOf?: string,
  limit = 8,
): RuleSearchHit[] {
  const allTokens = tokenize(query);
  if (allTokens.length === 0) return [];

  const haystacks = corpus.rules.map((rule) => {
    const paramWords = Object.keys(rule.parameters ?? {})
      .map((n) => n.replace(/([A-Z])/g, " $1").toLowerCase())
      .join(" ");
    return {
      rule,
      // "_" is a regex word character — split snake_case so \b-anchored
      // tokens ("tax") still reach id segments ("kiddie_tax").
      id: rule.id.toLowerCase().replace(/[._]/g, " "),
      title: rule.title.toLowerCase(),
      meta: `${paramWords} ${JURISDICTION_NAMES[rule.jurisdiction] ?? ""}`.toLowerCase(),
      weak: `${rule.citation.source} ${rule.citation.section} ${rule.citation.excerpt ?? ""}`.toLowerCase(),
    };
  });

  // Word-start matching: "mining" must not match "determining", while
  // "credit" still finds "credits". Tokens are [a-z0-9]+ so no escaping.
  const matchers = new Map(allTokens.map((t) => [t, new RegExp(`\\b${t}`)]));
  const has = (hay: string, t: string): boolean => (matchers.get(t) as RegExp).test(hay);

  // Document frequency per token: ubiquitous words ("tax", "income") carry no
  // signal and are dropped (unless the whole query is made of them); very
  // rare words ("niit", "kiddie") are the query's real subject and count
  // double, so they outvote moderately common ones like "threshold".
  const df = (t: string): number =>
    haystacks.filter((h) => has(h.id, t) || has(h.title, t) || has(h.meta, t) || has(h.weak, t))
      .length;
  const rare = allTokens.filter((t) => df(t) <= haystacks.length * 0.35);
  const tokens = rare.length > 0 ? rare : allTokens;
  const boost = new Map(tokens.map((t) => [t, df(t) <= haystacks.length * 0.05 ? 2 : 1]));
  // A multi-word query must earn more than a single stray excerpt match —
  // that is what keeps "no hits" meaning "outside the corpus".
  const minScore = tokens.length >= 2 ? 2 : 1;

  const hits: RuleSearchHit[] = [];
  for (const { rule, id, title, meta, weak } of haystacks) {
    if (
      asOf &&
      !(rule.effectiveFrom <= asOf && (rule.effectiveTo === undefined || asOf < rule.effectiveTo))
    ) {
      continue;
    }
    // Where a token lands matters: a rule NAMED for the query outranks a rule
    // that merely mentions it in its statutory excerpt.
    // raw decides admission (a lone excerpt match must not pass a multi-word
    // query's bar, however rare the word); the boosted score decides rank.
    // A rule must also match at least half the query's meaningful words —
    // "covered" has to mean the corpus knows this topic, not one stray noun.
    let raw = 0;
    let score = 0;
    let matched = 0;
    let sawStrong = false;
    for (const t of tokens) {
      let s = 0;
      if (has(id, t)) s += 2;
      if (has(title, t)) s += 2;
      if (has(meta, t)) s += 1;
      if (s > 0) sawStrong = true;
      else if (has(weak, t)) s = 1;
      if (s > 0) matched += 1;
      raw += s;
      score += s * (boost.get(t) ?? 1);
    }
    // Multi-word queries must land somewhere a rule is NAMED (id/title/meta),
    // not only inside statutory excerpts — two stray excerpt words must not
    // make a foreign topic look covered.
    if (raw < minScore || matched < Math.ceil(tokens.length / 2)) continue;
    if (tokens.length >= 2 && !sawStrong) continue;

    hits.push({
      ruleId: rule.id,
      version: rule.version,
      title: rule.title,
      jurisdiction: rule.jurisdiction,
      citation: rule.citation,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
      snippet: makeSnippet(rule.citation.excerpt ?? "", tokens),
      hasParameters: Object.keys(rule.parameters ?? {}).length > 0,
      score,
    });
  }

  hits.sort((a, b) => b.score - a.score || a.ruleId.localeCompare(b.ruleId));
  return hits.slice(0, Math.max(1, Math.min(limit, 20)));
}

export type FactCheckResult =
  | {
      verdict: "verified" | "refuted";
      matchedRuleId: string;
      matchedField: string;
      actualCents: string;
      claimedCents: string;
      citation: Citation;
      alternatives: LookupHit[];
    }
  | { verdict: "unknown"; message: string; alternatives: LookupHit[] };

/**
 * Check a claimed dollar amount against the best-matching corpus values.
 * "Verified" if any value on the best hit equals the claim; "refuted" if the
 * best hit has values and none match; "unknown" when nothing matches the
 * query (never guess).
 */
export function factCheck(
  corpus: LoadedCorpus,
  query: string,
  claimedCents: bigint,
  asOf?: string,
  filingStatus?: string,
): FactCheckResult {
  const hits = lookupParameters(corpus, query, asOf);
  if (hits.length === 0) {
    return {
      verdict: "unknown",
      message: `no corpus rule matches "${query}" — the claim cannot be checked against this corpus`,
      alternatives: [],
    };
  }
  const claimed = claimedCents.toString();

  const candidatesOf = (hit: LookupHit): [string, string][] => {
    const out: [string, string][] = [];
    if (filingStatus && hit.byFilingStatus[filingStatus] !== undefined) {
      out.push([`byFilingStatus.${filingStatus}`, hit.byFilingStatus[filingStatus]]);
    } else {
      out.push(
        ...Object.entries(hit.byFilingStatus).map(
          ([k, v]) => [`byFilingStatus.${k}`, v] as [string, string],
        ),
      );
    }
    out.push(...Object.entries(hit.parameters));
    return out;
  };

  // A claim is VERIFIED if any of the top matches carries exactly that value
  // (queries are fuzzy; refuting because the fuzzy ranking put a sibling rule
  // first would be a wrong-but-plausible verdict).
  for (const hit of hits) {
    const exact = candidatesOf(hit).find(([, v]) => v === claimed);
    if (exact) {
      return {
        verdict: "verified",
        matchedRuleId: hit.ruleId,
        matchedField: exact[0],
        actualCents: exact[1],
        claimedCents: claimed,
        citation: hit.citation,
        alternatives: hits.filter((h) => h !== hit),
      };
    }
  }

  const best = hits[0];
  const bestCandidates = candidatesOf(best);
  if (bestCandidates.length === 0) {
    return {
      verdict: "unknown",
      message: `best match "${best.ruleId}" carries no dollar parameters to compare`,
      alternatives: hits,
    };
  }
  const [field, actual] = bestCandidates[0];
  return {
    verdict: "refuted",
    matchedRuleId: best.ruleId,
    matchedField: field,
    actualCents: actual,
    claimedCents: claimed,
    citation: best.citation,
    alternatives: hits.slice(1),
  };
}
