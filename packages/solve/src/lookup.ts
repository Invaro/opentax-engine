/**
 * Parameter lookup: search the corpus for the dollar amounts behind a
 * plain-English question ("standard deduction", "CTC phase-out threshold")
 * and return them WITH their citations and validity windows — the
 * fact-checking primitive behind verify_fact.
 *
 * Values are pulled from two places: declared rule `parameters`, and money
 * literals inside `match`-on-filingStatus tables (where per-status amounts
 * like the standard deduction actually live).
 *
 * A query is answered from the jurisdiction it asks about: the states it
 * names, or federal law when it names none. `factCheck` never verifies or
 * refutes a figure against a rule of another jurisdiction, of a year other
 * than the one the query or `asOf` names, or one that is not named for what
 * the query asks.
 */

import { compareIds, walkExpr } from "@invaro/opentax-core";
import type { Citation, LoadedCorpus, Rule } from "@invaro/opentax-core";

export interface LookupHit {
  ruleId: string;
  version: number;
  /** The rule's jurisdiction, e.g. "us.federal" or "us.ca". */
  jurisdiction: string;
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

// Jurisdiction codes expand to searchable names so that `searchRules` reaches
// us.il / us.ny rules by "illinois" or "nyc" the way "eitc" reaches federal ones.
const JURISDICTION_NAMES: Record<string, string> = {
  "us.il": "illinois il il-1040",
  "us.ca": "california ca ftb form 540",
  "us.ny": "new york ny nyc it-201",
  "us.va": "virginia va form 760",
  "us.md": "maryland md form 502 baltimore county local",
  "us.mo": "missouri mo mo-1040 kansas city st louis",
  "us.wi": "wisconsin wi form 1 madison milwaukee",
  "us.mn": "minnesota mn form m1 st paul minneapolis",
  "us.sc": "south carolina sc sc1040 charleston columbia",
  "us.al": "alabama al form 40 birmingham montgomery",
  "us.or": "oregon or or-40 portland salem kicker",
  "us.ok": "oklahoma ok form 511 oklahoma city tulsa sales tax relief",
  "us.ct": "connecticut ct ct-1040 hartford new haven stamford bridgeport",
  "us.ks": "kansas ks k-40 wichita topeka overland park kpers",
  "us.ar": "arkansas ar ar1000f little rock fayetteville fort smith low income tax table",
  "us.nm": "new mexico nm pit-1 pit-adj pit-rc albuquerque santa fe las cruces lictr working families",
  "us.ne": "nebraska ne 1040n omaha lincoln nest personal exemption credit",
  "us.id": "idaho id form 40 form 39r boise grocery credit food tax credit permanent building fund",
  "us.wv": "west virginia wv it-140 schedule m charleston family tax credit senior citizens tax credit homestead excess",
  "us.me": "maine me 1040me portland augusta property tax fairness credit sales tax fairness credit pension income deduction",
  "us.hi": "hawaii hi n-11 honolulu maui kauai food excise tax credit low-income household renters credit capital gains alternative tax",
  "us.nd": "north dakota nd form nd-1 fargo bismarck grand forks marriage penalty credit capital gain exclusion college save social security exclusion",
  "us.vt": "vermont vt form in-111 burlington montpelier rutland social security exclusion military retirement capital gains exclusion child tax credit veteran credit charitable credit renter credit",
  "us.de": "delaware de pit-res wilmington dover newark pension exclusion personal credits combined separate return volunteer firefighter",
  "us.mt": "montana mt form 2 billings missoula bozeman helena elderly homeowner renter credit net long-term capital gains ordinary income",
  "us.ri": "rhode island ri ri-1040 providence warwick cranston property tax relief credit 1040h social security modification pension modification",
};

const FEDERAL = "us.federal";

// Every state, the District of Columbia and the territories, so that a query
// naming a place the corpus does not hold gets nothing instead of federal law.
const PLACE_NAMES: Record<string, string> = {
  al: "alabama", ak: "alaska", az: "arizona", ar: "arkansas", ca: "california",
  co: "colorado", ct: "connecticut", de: "delaware", dc: "district of columbia",
  fl: "florida", ga: "georgia", hi: "hawaii", id: "idaho", il: "illinois",
  in: "indiana", ia: "iowa", ks: "kansas", ky: "kentucky", la: "louisiana",
  me: "maine", md: "maryland", ma: "massachusetts", mi: "michigan", mn: "minnesota",
  ms: "mississippi", mo: "missouri", mt: "montana", ne: "nebraska", nv: "nevada",
  nh: "new hampshire", nj: "new jersey", nm: "new mexico", ny: "new york",
  nc: "north carolina", nd: "north dakota", oh: "ohio", ok: "oklahoma", or: "oregon",
  pa: "pennsylvania", ri: "rhode island", sc: "south carolina", sd: "south dakota",
  tn: "tennessee", tx: "texas", ut: "utah", vt: "vermont", va: "virginia",
  wa: "washington", wv: "west virginia", wi: "wisconsin", wy: "wyoming",
  pr: "puerto rico", gu: "guam", vi: "virgin islands", as: "american samoa",
  mp: "northern mariana islands",
};
// Names that would otherwise be read as a different place.
const PLACE_ALIASES: [string, string][] = [
  ["new york city", "ny"],
  ["nyc", "ny"],
  ["kansas city", "mo"],
];
// Longest first: "west virginia" is consumed before "virginia" is tried.
const PLACE_PATTERNS: [string, string][] = [
  ...PLACE_ALIASES,
  ...Object.entries(PLACE_NAMES).map(([code, name]) => [name, code] as [string, string]),
].sort((x, y) => y[0].length - x[0].length);
// Capitalized codes that are also a word or another abbreviation ("single OR
// joint", "SD" for standard deduction, "VA benefits", a "DC plan", "Part VI"):
// never taken as a state.
const UNCLEAR_CODES = new Set([
  "IN", "OR", "ME", "OK", "HI", "OH", "ID", "SD", "VA", "LA", "MA", "MD", "DC", "AS", "VI", "MP",
]);
const placeTitle = (code: string): string =>
  PLACE_NAMES[code.toLowerCase()].replace(/\b(?!of\b)[a-z]/g, (l) => l.toUpperCase());

const STATUS_PATTERNS: [string, RegExp][] = [
  // a bare "joint" or "separate" is a status only at the end of the query:
  // "Ohio joint filing credit" names a credit
  ["mfj", /\b(?:mfj|married (?:filing )?joint(?:ly)?|filing joint(?:ly)?|jointly|joint (?:returns?|filers?)|joint(?= *$))\b/g],
  ["mfs", /\b(?:mfs|married (?:filing )?separate(?:ly)?|filing separate(?:ly)?|separately|separate (?:returns?|filers?)|separate(?= *$))\b/g],
  ["hoh", /\b(?:hoh|heads? of (?:a )?household)\b/g],
  ["qss", /\b(?:qss|(?:qualifying )?surviving spouses?|qualifying widow(?:er)?s?)\b/g],
  ["single", /\b(?:single|unmarried)(?! (?:family|member|premium|parent))(?: filers?)?\b/g],
];

/** How a lookup query is read. */
export interface QueryScope {
  /** The jurisdictions the query asks about: the states it names, else `["us.federal"]`. */
  jurisdictions: string[];
  /**
   * Two-letter words that may be a state code or an ordinary word: the
   * capitalized ones that are also words ("OR", "IN", "ME", …) and a
   * lowercase code ("ca"), except the lowercase words "in", "or", "me" and
   * "as", which are read as English. They are not taken as a state:
   * `lookupParameters` answers from federal rules, and `factCheck` returns
   * unknown and asks for the name. Reported in capitals.
   */
  unclearStateCodes: string[];
  /** The one tax year the query names, if it names exactly one. */
  taxYear?: number;
  /**
   * The one filing status the query names, if it names exactly one. A query
   * with a bare "joint" or "separate" in the middle ("joint standard
   * deduction", "Ohio joint filing credit single") reports none: the word is
   * a status or part of a rule's name, and `factCheck` reads it as the status
   * only when no rule is named with it.
   */
  filingStatus?: string;
  /** The query asks for a rate or a percentage, which the lookup does not hold. */
  asksForRate: boolean;
}

interface ParsedQuery extends QueryScope {
  /** A state is named and the query also says "federal". */
  federalToo: boolean;
  /** Every search term: what is left once the place, year, filing status and filler words are taken out. */
  terms: string[];
  /** The terms that say WHAT is asked about ("salt", "standard", "deduction"). A rule is evidence only if it names them all. */
  subject: string[];
  /** The kinds of amount the query names: "cap" (cap, limit, maximum), "floor", "threshold". */
  qualifiers: Set<string>;
  /** Every word of the query, to see whether it names a parameter's own word ("step", "range"). */
  words: Set<string>;
  /** Small numbers in the query ("2" in "EITC max 2 children"). */
  numbers: Set<string>;
  /** Neighbouring terms ("net investment", "child credit"): a rule named with the same phrase matches better. */
  phrases: [string, string][];
  /** The query has more terms than are searched. */
  truncated: boolean;
  /** The query names more than one year ("2025 vs 2026"). */
  severalYears: boolean;
  /** A bare "joint" or "separate" sits mid-query: a filing status, or part of a name ("joint filing credit"). */
  bareStatus: boolean;
  /**
   * The statuses a query means when it names no single one: those it lists
   * ("single vs head of household"), or joint and separate for "married".
   */
  statusSet?: string[];
}

// Words that carry no meaning for a lookup.
const FILLER = new Set([
  "a", "an", "of", "in", "on", "to", "is", "it", "at", "by", "or", "as", "if", "be", "do", "my",
  "we", "i", "s", "vs", "so", "am", "us", "me",
  "the", "and", "for", "what", "whats", "how", "much", "many", "are", "was", "were", "with",
  "from", "that", "this", "does", "did", "can", "will", "would", "has", "have", "had", "who",
  "when", "which", "there", "you", "your", "their", "its", "any", "all", "about", "than",
  "year", "federal", "irs", "under", "rate", "rates", "percent",
  "percentage", "pct", "dollar", "dollars",
  "current", "currently", "now", "today", "filing", "filer", "filers", "status", "taxpayer",
  "taxpayers", "get", "claim", "equal", "equals",
]);
// Words that help rank a rule ("exemption amount" is `exemption_amount`, not
// `exemption_credit`) and are not required of its name.
const LOOSE = new Set(["amount", "value", "figure", "total"]);
// Words for a kind of amount. A query uses them loosely ("limit" for a
// parameter called `cap`), so they select among a rule's amounts and are not
// required of its name.
const QUALIFIER: Record<string, string> = {
  cap: "cap", limit: "cap", limitation: "cap", max: "cap", maximum: "cap", ceiling: "cap",
  floor: "floor", min: "floor", minimum: "floor",
  threshold: "threshold", thresh: "threshold", phaseout: "threshold", phase: "threshold",
  start: "threshold", cutoff: "threshold",
};
// Parameter words for an amount that applies only at a point in a computation.
// Such a parameter is compared only when the query names it.
const CONDITIONAL = new Set([
  "end", "step", "range", "reduction", "bracket", "tier", "row", "band", "break", "anchor",
  "width", "gap", "cliff", "completed", "top", "zero", "rate", "pct", "percentage", "table",
  "increment",
]);

// A word is matched whole, give or take a short ending: "credit" finds
// "credits", "child" finds "children" but not "childless", "cap" not "capital".
const stem = (t: string): string => (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") ? t.slice(0, -1) : t);
const termSource = (t: string): string =>
  t.length <= 3 ? `\\b${t}(?:s|es)?\\b` : `\\b${t}[a-z]{0,3}\\b`;
const termPattern = (t: string): RegExp => new RegExp(termSource(t));
// the two words next to each other, or with one word between
const phrasePattern = ([a, b]: [string, string]): RegExp =>
  new RegExp(`${termSource(a)}[^a-z0-9]+(?:[a-z0-9]+[^a-z0-9]+)?${b}`);
const sameWord = (a: string, b: string): boolean => {
  const [x, y] = [stem(a), stem(b)];
  if (x === y) return true;
  const [short, long] = x.length <= y.length ? [x, y] : [y, x];
  return short.length > 3 && long.startsWith(short) && long.length - short.length <= 3;
};
const onePhaseout = (s: string): string => s.replace(/\bphase[- ]?outs?\b/g, "phaseout");

/**
 * Read a lookup query: the jurisdiction it asks about (a state by its name or
 * its capitalized two-letter code; federal when it names none), the tax year
 * and filing status it names, and whether it asks for a rate.
 */
export function queryScope(query: string): QueryScope {
  const { jurisdictions, unclearStateCodes, taxYear, filingStatus, bareStatus, asksForRate } = parseQuery(query);
  return {
    jurisdictions,
    unclearStateCodes,
    ...(taxYear === undefined ? {} : { taxYear }),
    // a bare mid-query "joint" or "separate" may be a second status: no one status is reported
    ...(filingStatus === undefined || bareStatus ? {} : { filingStatus }),
    asksForRate,
  };
}

/** `bareAsStatus`: read a bare mid-query "joint" / "separate" as the filing status rather than a search term. */
function parseQuery(query: string, bareAsStatus = false): ParsedQuery {
  // "Washington, D.C." is the District, not the state
  // full-width digits and the like read as their plain forms; a query longer
  // than is read is flagged, never silently cut
  const whole = query.normalize("NFKC").replace(/\s+/g, " ").trim();
  const q = whole
    .slice(0, 500)
    .replace(/\bwashington,?\s+d\.?c\.?(?![a-z0-9])|\bd\.c\.(?![a-z0-9])/gi, " district of columbia ");
  const jurisdictions = new Set<string>();
  const unclear = new Set<string>();

  const asksForRate = /%|\b(?:rates?|percent|percentage|pct)\b/i.test(q);
  // an amount or a percentage written in the query ("CTC is $2,000 per child",
  // "the 3.8% tax") is the claim, not a search term
  const noAmounts = q.replace(
    /\$\s?\d[\d,]*(?:\.\d+)?|(?<![\d.])\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?\s?%|(?<![\d.])\d+\.\d+(?![\d.])/g,
    " ",
  );

  // a year is a bare four digits from 1900 to 2099: not "$2,025" or "2025-32"
  const years = new Set<number>();
  let rest = noAmounts.replace(/\b(?:TY|FY|CY)\s?(?=(?:19|20)\d\d(?!\d))/gi, "").replace(
    /(?<![\d$,.-]|§\s?|\b(?:section|sec\.?|form|pub\.?|publication|notice)\s)(?:19|20)\d\d(?![A-Za-z\d]|[,.]\d|-\d)/gi,
    (y) => {
      years.add(Number(y));
      return " ";
    },
  );

  // a two-letter code counts when it is capitalized: "NY", "NY's", "N.Y."
  const readCode = (code: string, whole: string): string => {
    if (PLACE_NAMES[code.toLowerCase()] === undefined) return whole;
    if (UNCLEAR_CODES.has(code)) unclear.add(code);
    else jurisdictions.add(`us.${code.toLowerCase()}`);
    return " ";
  };
  rest = rest
    .replace(/(?<![A-Za-z0-9.])([A-Z])\.([A-Z])\.(?![A-Za-z0-9])/g, (whole, a: string, b: string) => readCode(a + b, whole))
    .replace(/(?<![A-Za-z0-9.'’-])[A-Z]{2}(?![A-Za-z0-9.-]|['’](?!s\b))/g, (code) => readCode(code, code));

  let text = ` ${onePhaseout(rest.toLowerCase())
    .replace(/(\d)\(([a-z])\)/g, "$1$2")
    .replace(/[^a-z0-9%]+/g, " ")
    .trim()} `;
  for (const [name, code] of PLACE_PATTERNS) {
    const needle = ` ${name} `;
    while (text.includes(needle)) {
      jurisdictions.add(`us.${code}`);
      text = text.replace(needle, "  ");
    }
  }

  const statuses = new Set<string>();
  for (const [status, pattern] of STATUS_PATTERNS) {
    text = text.replace(pattern, () => {
      statuses.add(status);
      return " ";
    });
  }

  // "married" alone is joint or separate: no one status, and not a search term
  const married = /\b(?:married|couples?)\b/.test(text);
  text = text.replace(/\b(?:married(?: couples?)?|couples?)\b/g, " ");
  // A "joint" or "separate" left in the middle is a filing status ("joint
  // standard deduction") or part of a name ("Ohio joint filing credit"). It
  // is read as a search term first; `factCheck` reads it as the status only
  // when no rule is named with it.
  const bareStatus = /\b(?:joint|separate)\b/.test(text);
  if (bareStatus && bareAsStatus) {
    text = text.replace(/\bjoint\b/g, () => (statuses.add("mfj"), " ")).replace(/\bseparate\b/g, () => (statuses.add("mfs"), " "));
  }

  const named = [...jurisdictions].sort(compareIds);
  // "Missouri federal tax deduction" is Missouri's; with a state named, the
  // word "federal" leaves it unclear whose amount is meant
  const federalToo = named.length > 0 && /\b(?:federal|irs)\b/.test(text);
  if (named.length === 0) named.push(FEDERAL);

  const everyWord = text.split(" ").filter(Boolean);
  const all = everyWord.slice(0, 80);
  // Every word that is not filler is a search term, however short: "se" in
  // "SE tax", "ev" in "EV credit". A lowercase two-letter state code ("ca
  // standard deduction") may be a state or a word, like a capitalized unclear one.
  const kept: string[] = [];
  for (const w of all) {
    if (FILLER.has(w) || /^\d{1,2}$/.test(w)) continue;
    // "state" beside a named state adds nothing; alone ("state standard
    // deduction") it asks about a state that is not named, and stays a term
    if (w === "state" && jurisdictions.size > 0) continue;
    if (w.length === 2 && PLACE_NAMES[w] !== undefined) unclear.add(w.toUpperCase());
    else kept.push(stem(w));
  }
  const distinct = [...new Set(kept)];
  const terms = distinct.slice(0, 12);
  const phrases: [string, string][] = [];
  for (let i = 0; i + 1 < kept.length && phrases.length < 12; i++) {
    if (kept[i] !== kept[i + 1]) phrases.push([kept[i], kept[i + 1]]);
  }
  return {
    jurisdictions: named,
    unclearStateCodes: [...unclear].sort(),
    taxYear: years.size === 1 ? [...years][0] : undefined,
    filingStatus: statuses.size === 1 ? [...statuses][0] : undefined,
    asksForRate,
    federalToo,
    terms,
    subject: terms.filter((t) => QUALIFIER[t] === undefined && !LOOSE.has(t)),
    qualifiers: new Set(terms.flatMap((t) => QUALIFIER[t] ?? [])),
    words: new Set(all.map(stem)),
    numbers: new Set(all.filter((w) => /^\d{1,2}$/.test(w))),
    phrases,
    truncated: distinct.length > terms.length || whole.length > 500 || everyWord.length > all.length,
    severalYears: years.size > 1,
    bareStatus,
    statusSet:
      statuses.size > 1
        ? [...statuses]
        : married && statuses.size === 0
          ? ["mfj", "mfs"]
          : undefined,
  };
}

// Words in a parameter's name that tie it to filing statuses ("maxMfj",
// "amountUnmarried", "thresholdMFJKids"): a claim for another status is not
// checked against it.
const STATUS_WORDS: Record<string, string[]> = {
  mfj: ["mfj"],
  joint: ["mfj"],
  married: ["mfj", "mfs"],
  mfs: ["mfs"],
  separate: ["mfs"],
  single: ["single"],
  unmarried: ["single", "hoh"],
  hoh: ["hoh"],
  hof: ["hoh"],
  head: ["hoh"],
  qss: ["qss"],
  qw: ["qss"],
  surviving: ["qss"],
  widow: ["qss"],
};
// Words in a parameter's name that say nothing about what it is an amount of.
const PLAIN = new Set(["per", "amount", "total", "each", "other", "others", "for", "of", "the", "and", "or", "to"]);
// "thresholdMFJKids" -> threshold, mfj, kids; "max3" -> max, 3; "limitMfs" -> limit, mfs
const nameWords = (name: string): string[] =>
  (name.match(/[A-Z]+(?![a-z])|[A-Z]?[a-z]+|\d+/g) ?? []).map((w) => w.toLowerCase());

interface Parameter {
  name: string;
  cents: string;
  words: string[];
  /** The name as searchable text. */
  text: string;
  /** Filing statuses the name is for; empty when it names none. */
  statuses: string[];
  /** The name without its filing-status words: parameters that share it differ only by status. */
  base: string;
  /** Kinds of amount in the name: "cap", "floor", "threshold". */
  kinds: string[];
  /** Words in the name that the query must use for the parameter to be compared. */
  conditional: string[];
  /** What the name says the amount is OF ("educator" in `educatorCap`): the query must say it too. */
  own: string[];
  /**
   * Every use of the amount in the formula is multiplied by a rate: it is the
   * base of a percentage (expenses a 20% credit applies to, a wage base), not
   * an amount the rule gives.
   */
  scaled: boolean;
  /** The formula does not use the parameter, and applies a rate: its role is not known. */
  unused: boolean;
}

function parameterOf(name: string, cents: string): Parameter {
  const words = nameWords(name);
  const statusOf = (w: string): string[] | undefined => STATUS_WORDS[w.replace(/\d+k?$/, "")];
  return {
    name,
    cents,
    words,
    text: onePhaseout(words.join(" ")),
    statuses: [...new Set(words.flatMap((w) => statusOf(w) ?? []))],
    base: words.filter((w) => statusOf(w) === undefined && w !== "other" && w !== "others").join(" "),
    // the last kind word is the head noun: `limitThreshold` is a threshold, `incomeLimit` a cap
    kinds: words.flatMap((w) => QUALIFIER[w] ?? []).slice(-1),
    conditional: words.filter((w) => CONDITIONAL.has(w)),
    own: words.filter(
      (w) =>
        statusOf(w) === undefined &&
        QUALIFIER[w] === undefined &&
        !CONDITIONAL.has(w) &&
        !PLAIN.has(w) &&
        !/^\d+k?$/.test(w),
    ),
    scaled: false,
    unused: false,
  };
}

interface Indexed {
  rule: Rule;
  /**
   * The rule's own name: its id and the head of its title, up to the first
   * dash, bracket or colon. What follows describes the rule and mentions
   * other things ("… forced itemizing when federal …").
   */
  name: string;
  /** The id's words, where a rule carries its own number ("line28"). */
  idText: string;
  /** Name and parameter names: where a rule is named for a term. */
  named: string;
  /** Every dollar literal in the formula: amounts the law states that are no parameter. */
  literals: string[];
  /** Whether the title says the rule is for a year (true when it names none). */
  titledFor: (year: number) => boolean;
  title: string;
  /** Id, the whole title and parameter names: what a lookup ranks on. */
  strong: string;
  /** Citation and law excerpt: where a rule merely mentions a term. */
  weak: string;
  parameters: Parameter[];
  /** The rule's one filing-status table; empty when it has none, or several that differ. */
  byFilingStatus: Record<string, string>;
  /** Every filing-status table in the formula. */
  tables: Record<string, string>[];
  /** The rates the formula multiplies by, as [numerator, denominator]. */
  rates: [bigint, bigint][];
}

function formulaUse(
  rule: Rule,
  parameters: Parameter[],
): Pick<Indexed, "byFilingStatus" | "tables" | "rates"> {
  const tables = new Map<string, Record<string, string>>();
  const rates = new Map<string, [bigint, bigint]>();
  const uses = new Map<string, number>();
  const usesScaled = new Map<string, number>();
  walkExpr(rule.formula, (e) => {
    if (e.kind === "param") uses.set(e.name, (uses.get(e.name) ?? 0) + 1);
    if (e.kind === "mulRate") {
      walkExpr(e.base, (inner) => {
        if (inner.kind === "param") usesScaled.set(inner.name, (usesScaled.get(inner.name) ?? 0) + 1);
      });
    }
    if (e.kind === "mulRate") rates.set(`${e.rate.num}/${e.rate.den}`, [BigInt(e.rate.num), BigInt(e.rate.den)]);
    if (e.kind === "match" && e.on.kind === "fact" && e.on.factId === "filingStatus") {
      const table: Record<string, string> = {};
      for (const c of e.cases) if (c.value.kind === "money") table[c.when] = c.value.cents;
      if (Object.keys(table).length > 0) tables.set(JSON.stringify(Object.entries(table).sort()), table);
    }
  });
  // An amount whose every use is under a rate is a base. So, for all a lookup
  // can tell, is one the formula does not use at all in a rule that applies a
  // rate (the formula holds its own copy: "10% of the first $2,500").
  for (const p of parameters) {
    p.scaled = uses.has(p.name) ? uses.get(p.name) === usesScaled.get(p.name) : rates.size > 0;
    p.unused = !uses.has(p.name) && rates.size > 0;
  }
  return {
    // several different tables in one rule cannot be told apart by a lookup
    byFilingStatus: tables.size === 1 ? [...tables.values()][0] : {},
    tables: [...tables.values()],
    rates: [...rates.values()],
  };
}

const RATE_NAMED = /(?:Percentage|Percent|Pct|Rate)$/;

/**
 * The years a rule's title says it is for ("Vermont standard deduction 2025",
 * "TY2026+", "after December 31, 2025"). A rule can stay in force after the
 * year it is titled for, carrying that year's figures forward until the next
 * publication is encoded; those are not the later year's figures.
 */
function titleYears(fullTitle: string, effectiveFrom: string): (year: number) => boolean {
  const YEAR = /(?<![\d$,.-])(?:19|20)\d\d(?![A-Za-z\d]|[,.]\d|-)/;
  // the year in the head of the title is the label ("North Dakota 2025 Form
  // ND-1 parameters — … and the TY2026 position"); without one, any in the title
  const head = fullTitle.split(/ [—–-] |[(:;]/)[0];
  const title = YEAR.test(head) ? head : fullTitle;
  const first = Number(effectiveFrom.slice(0, 4));
  const tests: ((year: number) => boolean)[] = [];
  let open = false;
  for (const m of title.matchAll(new RegExp(YEAR.source, "g"))) {
    const y = Number(m[0]);
    // a year before the rule's own first year names a law or an older form
    // ("2020 rules", a 2026 version still titled "TY2025"), not what it is for
    if (y < first) continue;
    const before = title.slice(Math.max(0, m.index - 28), m.index).toLowerCase();
    const after = title.slice(m.index + 4, m.index + 16).toLowerCase();
    if (/^\+|^ (?:and later|onward|and after)/.test(after)) tests.push((year) => year >= y);
    else if (/\b(?:from|since|beginning|starting|effective)\b[^.;()]*$/.test(before)) tests.push((year) => year >= y);
    // "sunset after 2025", "through 2028": which side the rule is on is not clear from the words
    else if (/\b(?:after|post|before|prior to|through|until)\b[^.;()]*$/.test(before)) open = true;
    else tests.push((year) => year === y);
  }
  return (year) => open || tests.length === 0 || tests.some((t) => t(year));
}

// Built once per corpus: walking every formula for its filing-status tables is
// the expensive part of a lookup. A corpus is read-only once loaded.
const INDEX = new WeakMap<object, Indexed[]>();

function indexOf(corpus: LoadedCorpus): Indexed[] {
  let index = INDEX.get(corpus.rules);
  if (index === undefined) {
    index = corpus.rules.map((rule) => {
      // a parameter named as a rate (`applicablePercentage`, value 30 for
      // 30%) is not a dollar amount, whatever its type
      const parameters = Object.entries(rule.parameters ?? {})
        .filter(([name, p]) => p.type === "money" && !RATE_NAMED.test(name))
        .map(([name, p]) => parameterOf(name, String(p.value)));
      // every parameter name counts, money or not: "per child" should rank the
      // rule whose parameter is literally `perChild`
      const paramWords = Object.keys(rule.parameters ?? {})
        .map((n) => nameWords(n).join(" "))
        .join(" ");
      const idText = rule.id.replace(/[._]/g, " ").toLowerCase();
      const title = onePhaseout(rule.title.toLowerCase());
      const name = `${onePhaseout(idText)} ${title.split(/ [—–-] |[(:;]/)[0]}`;
      const literals = new Set<string>();
      walkExpr(rule.formula, (e) => {
        if (e.kind === "money" && e.cents !== "0") literals.add(e.cents);
      });
      return {
        rule,
        name,
        idText,
        named: `${name} ${onePhaseout(paramWords)}`,
        literals: [...literals],
        titledFor: titleYears(rule.title, rule.effectiveFrom),
        title,
        strong: `${onePhaseout(idText)} ${title} ${onePhaseout(paramWords)}`,
        weak: onePhaseout(
          `${rule.citation.source} ${rule.citation.section} ${rule.citation.excerpt ?? ""}`.toLowerCase(),
        ),
        parameters,
        ...formulaUse(rule, parameters),
      };
    });
    INDEX.set(corpus.rules, index);
  }
  return index;
}

interface Ranked {
  hit: LookupHit;
  rule: Indexed;
  /** Words in the title before the first search term: a rule titled for the query leads with it. */
  lead: number;
}

const inForce = (rule: Rule, asOf: string | undefined): boolean =>
  asOf === undefined ||
  (rule.effectiveFrom <= asOf && (rule.effectiveTo === undefined || asOf < rule.effectiveTo));

const hasValues = (h: LookupHit): boolean =>
  Object.keys(h.parameters).length > 0 || Object.keys(h.byFilingStatus).length > 0;

/** Every rule in force that matches the query's terms, best first, split by whether its jurisdiction was asked for. */
function rank(
  corpus: LoadedCorpus,
  scope: ParsedQuery,
  asOf: string | undefined,
): { asked: Ranked[]; others: Ranked[] } {
  const patterns = scope.terms.map(termPattern);
  const phrases = scope.phrases.map(phrasePattern);
  const asked: Ranked[] = [];
  const others: Ranked[] = [];
  const namesPlace = scope.jurisdictions.some((j) => j !== FEDERAL);
  for (const indexed of indexOf(corpus)) {
    const { rule, strong, title, weak } = indexed;
    if (!inForce(rule, asOf)) continue;
    const isAsked = scope.jurisdictions.includes(rule.jurisdiction);
    let score = 0;
    for (const p of patterns) {
      if (p.test(strong)) score += 2;
      else if (p.test(weak)) score += 1;
    }
    // a query that is only a state's name lists that state's amounts
    if (score === 0 && !(patterns.length === 0 && namesPlace && isAsked)) continue;
    // a rule NAMED with the query's own phrase ("net investment income")
    // outranks one that has the same words apart
    for (const p of phrases) if (p.test(strong)) score += 1;
    let lead = Number.MAX_SAFE_INTEGER;
    for (const p of patterns) {
      const at = title.search(p);
      if (at !== -1) lead = Math.min(lead, title.slice(0, at).split(/[^a-z0-9]+/).filter(Boolean).length);
    }

    const hit: LookupHit = {
      ruleId: rule.id,
      version: rule.version,
      jurisdiction: rule.jurisdiction,
      title: rule.title,
      citation: rule.citation,
      effectiveFrom: rule.effectiveFrom,
      effectiveTo: rule.effectiveTo,
      parameters: Object.fromEntries(indexed.parameters.map((p) => [p.name, p.cents])),
      byFilingStatus: { ...indexed.byFilingStatus },
      score,
    };
    (isAsked ? asked : others).push({ hit, rule: indexed, lead });
  }
  // best score first; at the same score a rule that carries amounts leads,
  // then the one titled for the query, then a filing-status table (the
  // headline amount) before single parameters
  const order = (x: Ranked, y: Ranked): number =>
    y.hit.score - x.hit.score ||
    Number(hasValues(y.hit)) - Number(hasValues(x.hit)) ||
    x.lead - y.lead ||
    Number(Object.keys(y.hit.byFilingStatus).length > 0) -
      Number(Object.keys(x.hit.byFilingStatus).length > 0) ||
    compareIds(x.hit.ruleId, y.hit.ruleId) ||
    y.hit.version - x.hit.version;
  asked.sort(order);
  others.sort(order);
  return { asked, others };
}

function checkDate(asOf: string | undefined): void {
  const real = (d: string): boolean => {
    const t = new Date(`${d}T00:00:00Z`);
    return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
  };
  if (asOf !== undefined && !(/^\d{4}-\d{2}-\d{2}$/.test(asOf) && real(asOf))) {
    throw new RangeError(`asOf must be a date like "2026-12-31", got ${JSON.stringify(String(asOf).slice(0, 40))}`);
  }
}

const yearEnd = (scope: QueryScope, asOf: string | undefined): string | undefined =>
  asOf ?? (scope.taxYear === undefined ? undefined : `${scope.taxYear}-12-31`);

/**
 * The dollar amounts behind a query, best match first (at most five), from
 * the jurisdiction the query asks about: a state it names, else federal law.
 * Only a query that names no state, and matches nothing federal, is answered
 * from the other jurisdictions; each hit says which one it is.
 * `asOf` selects the rules in force on that date; without it, a year in the
 * query ("standard deduction 2025") selects that year, else every version is searched.
 */
export function lookupParameters(
  corpus: LoadedCorpus,
  query: string,
  asOf?: string,
): LookupHit[] {
  checkDate(asOf);
  const scope = parseQuery(query);
  const { asked, others } = rank(corpus, scope, yearEnd(scope, asOf));
  const namesPlace = scope.jurisdictions.some((j) => j !== FEDERAL);
  const ranked = asked.length > 0 || namesPlace ? asked : others;
  return ranked.slice(0, 5).map((r) => r.hit);
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
  // each token scans every rule (twice, for document frequency), so dedupe and cap them:
  // a 500 KB query of repeated words used to take a minute
  const allTokens = [...new Set(tokenize(query.slice(0, 500)))].slice(0, 12);
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
  const dfCache = new Map(allTokens.map((t) => [t, df(t)]));
  const rare = allTokens.filter((t) => dfCache.get(t)! <= haystacks.length * 0.35);
  const tokens = rare.length > 0 ? rare : allTokens;
  const boost = new Map(tokens.map((t) => [t, dfCache.get(t)! <= haystacks.length * 0.05 ? 2 : 1]));
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

  hits.sort((a, b) => b.score - a.score || compareIds(a.ruleId, b.ruleId));
  return hits.slice(0, Math.max(1, Math.min(limit, 20)));
}

export type FactCheckResult =
  | {
      verdict: "verified" | "refuted";
      matchedRuleId: string;
      matchedField: string;
      /** The matched rule's jurisdiction; always one of `jurisdictions`. */
      jurisdiction: string;
      actualCents: string;
      claimedCents: string;
      citation: Citation;
      /** The matched rule version's validity window. */
      effectiveFrom: string;
      effectiveTo?: string;
      /** The jurisdictions the query was read as asking about. */
      jurisdictions: string[];
      /** The date whose rules were checked, when one applied. */
      asOf?: string;
      alternatives: LookupHit[];
    }
  | {
      verdict: "unknown";
      message: string;
      jurisdictions: string[];
      asOf?: string;
      alternatives: LookupHit[];
    };

/**
 * A rule named for an amount that applies only at a point in a computation
 * ("ctc.phaseout_threshold", "ctc.reduction") answers a query only when the
 * query asks for that ("CTC phase-out threshold"), not a bare "CTC".
 */
function ruleIsAskedFor(rule: Indexed, scope: ParsedQuery): boolean {
  const words = onePhaseout(rule.rule.id.split(".").slice(2).join(" ").replace(/_/g, " ")).split(" ");
  return words.every((w) => {
    const kind = QUALIFIER[w];
    if (kind !== undefined && kind !== "cap") return scope.qualifiers.has(kind);
    return !CONDITIONAL.has(w) || scope.words.has(w);
  });
}

/**
 * The amounts on a rule that the query is certainly about: `[field, cents]`.
 * A claim is verified only against these.
 */
function candidatesOf(
  rule: Indexed,
  scope: ParsedQuery,
  status: string | undefined,
): [string, string][] {
  // Subject words the rule's own name does not carry must be the parameter's
  // name: "per child" on the child tax credit rule is `perChild`.
  const unnamed = scope.subject.filter((t) => !termPattern(t).test(rule.name)).map(termPattern);
  // A number in the query ("line 28", "max 2") must be the rule's or the
  // parameter's own number.
  const numbers = [...scope.numbers].filter((n) => !new RegExp(`(?<![0-9])${n}(?![0-9])`).test(rule.idText));
  let parameters = rule.parameters.filter(
    (p) =>
      unnamed.every((t) => t.test(p.text)) &&
      numbers.every((n) => p.words.includes(n)) &&
      // and a numbered parameter (`max2`, `tier1Max`) needs its number in the query
      p.words.every((w) => !/^\d+$/.test(w) || scope.numbers.has(w) || scope.words.has(w) || w === String(scope.taxYear)) &&
      // and the parameter's own words must be the query's: `educatorCap` is
      // not "the cap", `refundableCapPerChild` is not "per child"
      p.own.every((w) => [...scope.words].some((q) => sameWord(w, q))) &&
      // the base of a percentage is compared only when the query names it
      (!p.scaled || p.own.length > 0) &&
      !p.unused &&
      !p.cents.startsWith("-"),
  );

  // The kind of amount: a query that says "cap" or "limit" is compared with
  // a cap, "threshold" with a threshold. One that names no kind is compared
  // with caps and plain amounts, never with a floor, a threshold or a step.
  const answersKind = parameters.some((p) => p.kinds.some((k) => scope.qualifiers.has(k)));
  parameters = parameters.filter((p) => {
    if (p.conditional.length > 0 && !p.conditional.some((w) => scope.words.has(w))) return false;
    if (scope.qualifiers.size === 0) return p.kinds.every((k) => k === "cap");
    return p.kinds.some((k) => scope.qualifiers.has(k));
  });

  // A query that lists statuses, or says "married", means those statuses'
  // amounts, and like a single status only ones the rule states for them.
  const statusSet = status === undefined ? scope.statusSet : undefined;
  if (statusSet) parameters = parameters.filter((p) => p.statuses.some((x) => statusSet.includes(x)));
  // With a filing status, only an amount stated for that status is compared:
  // a table at the status, or a parameter labelled for it. Whether an
  // unlabelled amount, or the one labelled for everyone else (`other`),
  // applies to a status is decided in the formula or in another rule (a cap
  // halved for separate filers, a credit they cannot claim at all), which a
  // lookup does not read.
  if (status !== undefined) parameters = parameters.filter((p) => p.statuses.includes(status));

  // The filing-status table is the rule's own amount: compared when no
  // parameter was singled out, at the claim's status and never at another one.
  const table: [string, string][] =
    unnamed.length > 0 || numbers.length > 0 || answersKind
      ? []
      : status === undefined
        ? Object.entries(rule.byFilingStatus)
            .filter(([k]) => statusSet === undefined || statusSet.includes(k))
            .map(([k, v]) => [`byFilingStatus.${k}`, v])
        : rule.byFilingStatus[status] !== undefined
          ? [[`byFilingStatus.${status}`, rule.byFilingStatus[status]]]
          : [];
  // One amount only. Parameters that differ by filing status are one amount;
  // two different ones that both fit ("QBI deduction minimum": the $400
  // minimum deduction, the $1,000 of income it needs) leave the claim open.
  const amounts = new Set(parameters.map((p) => p.base));
  if (amounts.size + (table.length > 0 ? 1 : 0) > 1) return [];
  return [...table, ...parameters.map((p): [string, string] => [p.name, p.cents])];
}

/**
 * Every amount on a rule that the claim could be, however it is labelled. A
 * claim that equals one of these is not refuted: the figure is in the law
 * under this name, only not certainly as what was asked. Left out are the
 * amounts the query rules out itself: another kind than the one it names
 * ("cap" rules out the floor), and a table's other filing statuses.
 */
function everyAmountOf(
  rule: Indexed,
  scope: ParsedQuery,
  status: string | undefined,
): [string, string][] {
  const parameters = rule.parameters.filter(
    (p) =>
      scope.qualifiers.size === 0 ||
      p.kinds.length === 0 ||
      p.kinds.some((k) => scope.qualifiers.has(k)) ||
      // "MAGI limit" still points at `magiThreshold`
      (p.own.length > 0 && p.own.every((w) => [...scope.words].some((q) => sameWord(w, q)))),
  );
  const tables = rule.tables.flatMap((t) =>
    Object.entries(t)
      .filter(([k]) => status === undefined || k === status)
      .map(([k, v]): [string, string] => [`byFilingStatus.${k}`, v]),
  );
  const inTables = new Set(rule.tables.flatMap((t) => Object.values(t)));
  const literals = rule.literals
    .filter((v) => !inTables.has(v))
    .map((v): [string, string] => ["an amount in the formula", v]);
  return [...tables, ...parameters.map((p): [string, string] => [p.name, p.cents]), ...literals];
}

const dollars = (cents: bigint | string): string => {
  const c = BigInt(cents);
  const abs = c < 0n ? -c : c;
  const whole = (abs / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${c < 0n ? "-" : ""}$${whole}.${String(abs % 100n).padStart(2, "0")}`;
};

/**
 * Check a claimed dollar amount against the corpus, in the jurisdiction the
 * query asks about (see `queryScope`).
 *
 * The evidence is the best-matching rule named for every subject word of the
 * query (filler words and the kind words cap / floor / threshold are not
 * required), and on it the amounts the query is certainly about: a parameter
 * the query names, of the kind it names, and with a filing status only one
 * the rule states for that status.
 * "verified": one of those equals the claim. "refuted": none does, and no rule
 * named for the query holds the claimed figure as an amount the query could
 * mean (`everyAmountOf`: an amount of another kind than the one named, and a
 * table's other filing statuses, do not count); the nearest amount is
 * reported. "unknown" whenever the claim cannot be settled: no rule names all
 * of the query, the rule holds no single amount the query is certainly about,
 * the figure is in the law under another name, the query asks for a rate or a
 * percentage, the claim is small enough to be one or is an amount the rule
 * derives, a rule named for the query has no version in force on the date,
 * or the query does not say one jurisdiction, one year, or the status passed.
 * It never falls back to another jurisdiction. Without `asOf` or `filingStatus`, a
 * year or a filing status named in the query is used; with no date at all
 * every version of a rule is compared, and the result's `effectiveFrom` says
 * which one matched.
 */
export function factCheck(
  corpus: LoadedCorpus,
  query: string,
  claimedCents: bigint,
  asOf?: string,
  filingStatus?: string,
): FactCheckResult {
  checkDate(asOf);
  const scope = parseQuery(query);
  const trace = { named: false };
  const result = decide(corpus, query, scope, claimedCents, asOf, filingStatus, trace);
  // "joint standard deduction": no rule is named with "joint", so it is the filing status
  if (!trace.named && scope.bareStatus) {
    return decide(corpus, query, parseQuery(query, true), claimedCents, asOf, filingStatus, trace);
  }
  return result;
}

function decide(
  corpus: LoadedCorpus,
  query: string,
  scope: ParsedQuery,
  claimedCents: bigint,
  asOf: string | undefined,
  filingStatus: string | undefined,
  trace: { named: boolean },
): FactCheckResult {
  const when = yearEnd(scope, asOf);
  const status = filingStatus ?? scope.filingStatus;
  const { asked, others } = rank(corpus, scope, when);
  const hits = asked.slice(0, 5).map((r) => r.hit);
  const unknown = (message: string, alternatives: LookupHit[] = hits): FactCheckResult => ({
    verdict: "unknown",
    message,
    jurisdictions: scope.jurisdictions,
    ...(when === undefined ? {} : { asOf: when }),
    alternatives,
  });
  const places = scope.jurisdictions.join(", ");
  const onDate = when === undefined ? "" : ` in force on ${when}`;

  if (scope.unclearStateCodes.length > 0) {
    const names = scope.unclearStateCodes.map((c) => `"${c}" (${placeTitle(c)})`).join(", ");
    return unknown(
      `${names} may be a state or an ordinary word — write the state's name in full to check a state amount, or leave the word out`,
    );
  }
  if (scope.jurisdictions.length > 1 || scope.federalToo) {
    return unknown(
      `"${query}" names ${scope.federalToo ? [FEDERAL, ...scope.jurisdictions].join(" and ") : scope.jurisdictions.join(" and ")} — ask about one jurisdiction at a time`,
    );
  }
  if (asOf !== undefined && scope.taxYear !== undefined && asOf.slice(0, 4) !== String(scope.taxYear)) {
    return unknown(
      `"${query}" says ${scope.taxYear} but the date checked is ${asOf} — pass the date for the year you mean, or leave the year out`,
    );
  }
  const queryStatuses = scope.filingStatus !== undefined ? [scope.filingStatus] : scope.statusSet;
  if (filingStatus !== undefined && queryStatuses !== undefined && !queryStatuses.includes(filingStatus)) {
    return unknown(
      `"${query}" says ${queryStatuses.join(" / ")} but the filing status passed is ${filingStatus} — pass the status you mean, or leave it out of the query`,
    );
  }
  if (scope.severalYears) {
    return unknown(`"${query}" names more than one year — ask about one year at a time`);
  }
  if (scope.truncated) {
    return unknown(`"${query.slice(0, 60)}…" is too long to check — name the amount in a few words`, []);
  }
  if (scope.subject.length === 0) {
    return unknown(`"${query}" does not name an amount to check`, []);
  }
  // The lookup holds dollar amounts. A query that asks for a rate is not
  // settled by a dollar figure, whatever the figure is.
  if (scope.asksForRate) {
    return unknown(
      `"${query}" asks for a rate or a percentage — this lookup holds dollar amounts only, so the claim cannot be checked (search_tax_rules finds the rule, and explain_rule shows the rate in its formula)`,
    );
  }
  if (asked.length === 0) {
    const elsewhere = [...new Set(others.slice(0, 5).map((r) => r.hit.jurisdiction))];
    return unknown(
      `no ${places} rule${onDate} matches "${query}" — the claim cannot be checked against this corpus` +
        (elsewhere.length > 0 && scope.jurisdictions.every((j) => j === FEDERAL)
          ? ` (name the state to check a state amount; similar rules exist in ${elsewhere.join(", ")})`
          : ""),
      [],
    );
  }

  // Evidence is a rule NAMED for everything the query asks about. A rule that
  // shares one word with the query ("cap", "deduction") settles nothing.
  const subject = scope.subject.map(termPattern);
  const named = asked.filter((r) => subject.every((t) => t.test(r.rule.named)));
  if (named.length === 0) {
    const closest = asked[0];
    const missing = scope.subject.filter((_t, i) => !subject[i].test(closest.rule.named));
    return unknown(
      `no ${places} rule${onDate} is named for all of "${query}" — the closest, "${closest.hit.ruleId}", does not name: ${missing.join(", ")}. Ask in the law's own words, or search for the rule first`,
    );
  }
  trace.named = true;

  // A rule whose own id is the query ("income tax" and `us.nm.income_tax`)
  // is the one asked about: only it and its parts (`….income_tax.…`) answer,
  // not another rule whose title also has the words.
  const idIsQuery = (r: Indexed): boolean => {
    const idWords = r.idText.split(" ").slice(2);
    return idWords.length > 0 && idWords.every((w) => [...scope.words].some((q) => sameWord(w, q)));
  };
  const exact = named.filter((r) => idIsQuery(r.rule)).map((r) => r.hit.ruleId);
  const inFamily = (id: string): boolean =>
    exact.length === 0 || exact.some((e) => id === e || id.startsWith(`${e}.`));

  // A rule named for the query that has run out (no version in force on the
  // date) means the corpus has no figure for that date, and another rule that
  // still carries an older figure must not answer in its place. That holds
  // when the lapsed rule is the one asked for by id, or when no rule in force
  // is: "standard deduction" in 2027 is `standard_deduction`, whatever became
  // of a mileage rule that has the same words in its title.
  if (when !== undefined) {
    const inForceIds = new Set(asked.map((r) => r.hit.ruleId));
    const lapsed = indexOf(corpus).find(
      (r) =>
        scope.jurisdictions.includes(r.rule.jurisdiction) &&
        !inForceIds.has(r.rule.id) &&
        r.rule.effectiveTo !== undefined &&
        r.rule.effectiveTo <= when &&
        subject.every((t) => t.test(r.named)) &&
        ruleIsAskedFor(r, scope) &&
        (idIsQuery(r) || exact.length === 0) &&
        !corpus.rules.some((x) => x.id === r.rule.id && inForce(x, when)),
    );
    if (lapsed) {
      return unknown(
        `"${lapsed.rule.id}" (${lapsed.rule.title}) has no version in force on ${when} — the corpus holds no figure for that date`,
      );
    }
  }

  // The best-ranked rule with an amount the query is certainly about. A
  // better-ranked rule that holds amounts, none of them certainly the one
  // asked for, ends the search: the answer is there, under a name the query
  // did not use, and a lower-ranked rule must not answer in its place.
  const evidence: { hit: LookupHit; rule: Indexed; candidates: [string, string][] }[] = [];
  for (const r of named) {
    if (!ruleIsAskedFor(r.rule, scope) || !inFamily(r.hit.ruleId)) continue;
    if (evidence.length > 0 && r.hit.ruleId !== evidence[0].hit.ruleId) continue;
    const candidates = candidatesOf(r.rule, scope, status);
    // a rule titled for another year carries that year's figures
    if (candidates.length > 0 && when !== undefined && !r.rule.titledFor(Number(when.slice(0, 4)))) {
      return unknown(
        `"${r.hit.ruleId}" (${r.hit.title.slice(0, 120)}) is titled for another year than ${when.slice(0, 4)} — the corpus carries it forward, which is not that year's published figure`,
      );
    }
    if (candidates.length > 0) evidence.push({ hit: r.hit, rule: r.rule, candidates });
    else if (evidence.length === 0 && (r.rule.parameters.length > 0 || r.rule.tables.length > 0 || r.rule.literals.length > 0)) break;
  }

  const claimed = claimedCents.toString();
  // where else the claimed figure sits, on any rule named for the query
  const elsewhere = (except: (hit: LookupHit, field: string) => boolean): string | undefined => {
    for (const r of named) {
      const at = [...new Set(everyAmountOf(r.rule, scope, status).filter(([f, v]) => v === claimed && !except(r.hit, f)).map(([f]) => f))];
      if (at.length > 0) return `${at.slice(0, 4).join(" and ")} of "${r.hit.ruleId}" (${r.hit.title})`;
    }
    return undefined;
  };

  if (evidence.length === 0) {
    const at = elsewhere(() => false);
    const holds = named[0].rule.parameters.map((p) => p.name).slice(0, 8);
    return unknown(
      (at
        ? `${dollars(claimedCents)} is ${at}, which "${query}"${status === undefined ? "" : ` at filing status ${status}`} does not certainly ask for`
        : `best match "${named[0].hit.ruleId}" carries no dollar amount that "${query}"${status === undefined ? "" : ` at filing status ${status}`} is certainly about`) +
        (holds.length > 0 ? ` — name the amount in the rule's words (it holds: ${holds.join(", ")})` : "") +
        (status === undefined ? "" : "; an amount may also depend on the filing status inside the formula, which explain_rule shows"),
    );
  }

  const found = (
    hit: LookupHit,
    field: string,
    actual: string,
    verdict: "verified" | "refuted",
  ): FactCheckResult => ({
    verdict,
    matchedRuleId: hit.ruleId,
    matchedField: field,
    jurisdiction: hit.jurisdiction,
    actualCents: actual,
    claimedCents: claimed,
    citation: hit.citation,
    effectiveFrom: hit.effectiveFrom,
    ...(hit.effectiveTo === undefined ? {} : { effectiveTo: hit.effectiveTo }),
    jurisdictions: scope.jurisdictions,
    ...(when === undefined ? {} : { asOf: when }),
    alternatives: hits.filter((h) => h !== hit),
  });

  // Verified only on that rule (every version of it in force).
  const first = evidence;
  for (const { hit, candidates } of first) {
    const exact = candidates.find(([, v]) => v === claimed);
    if (exact) return found(hit, exact[0], exact[1], "verified");
  }

  // The same number under another name — a sibling rule ("additional standard
  // deduction" for "standard deduction"), another parameter of this rule — is
  // a different fact. It is neither confirmed nor refuted.
  const at = elsewhere(() => false);
  if (at !== undefined) {
    const [field, value] = first[0].candidates[0];
    return unknown(
      `${dollars(claimedCents)} is ${at}; "${query}" is compared with ${field} of "${first[0].hit.ruleId}" (${dollars(value)}) — name the amount more exactly to check it`,
    );
  }

  const magnitude = claimedCents < 0n ? -claimedCents : claimedCents;
  if (magnitude < 10000n) {
    return unknown(
      `${dollars(claimedCents)} matches no amount on "${first[0].hit.ruleId}", and a figure under $100 may be a rate or a percentage — this lookup holds dollar amounts only (explain_rule on that rule shows its rates)`,
    );
  }
  // A claim that is a rule's own rate times one of its amounts ($2,000 as 20%
  // of a $10,000 cap) is a figure the rule derives; the lookup does not hold it.
  for (const r of named) {
    for (const [field, value] of everyAmountOf(r.rule, scope, status)) {
      for (const [num, den] of r.rule.rates) {
        if (den !== 0n && (BigInt(value) * num) % den === 0n && (BigInt(value) * num) / den === claimedCents) {
          return unknown(
            `${dollars(claimedCents)} is ${num}/${den} of ${field} on "${r.hit.ruleId}", an amount the rule derives — this lookup holds the rule's parameters only (run the calculation, or read the formula with explain_rule)`,
          );
        }
      }
    }
  }

  // Refuted: the figure is on no rule named for the query. Reported is the
  // nearest amount on the best-matching rule.
  const distance = (v: string): bigint => {
    const d = BigInt(v) - claimedCents;
    return d < 0n ? -d : d;
  };
  let nearest: [LookupHit, string, string] | undefined;
  for (const { hit, candidates } of first) {
    for (const [field, value] of candidates) {
      if (nearest === undefined || distance(value) < distance(nearest[2])) nearest = [hit, field, value];
    }
  }
  const [hit, field, actual] = nearest as [LookupHit, string, string];
  return found(hit, field, actual, "refuted");
}
