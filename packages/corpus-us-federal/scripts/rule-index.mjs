/**
 * The rule index: for every rule, a short hash of each part that can change
 * (formula, guard, citation, output type), each parameter's value (money in
 * dollars, other numbers as stored: rates are basis points), the
 * validity window, and for every fact its type and default. gen-lock writes it next to
 * corpus.lock.json; change-notes diffs two of them to say exactly what
 * changed between releases, part by part, without rebuilding old versions.
 */
import { hashOf } from "@invaro/opentax-core";

const short = (v) => (v === undefined ? null : hashOf(v).slice(7, 23));

/** Money parameters are stored in cents; the index shows exact dollars so diffs and notes read as amounts. */
function display(p) {
  if (p.type !== "money" || typeof p.value !== "string") return p.value;
  const neg = p.value.startsWith("-");
  const digits = (neg ? p.value.slice(1) : p.value).padStart(3, "0");
  const dollars = BigInt(digits.slice(0, -2)).toLocaleString("en-US");
  const cents = digits.slice(-2);
  return `${neg ? "-" : ""}$${dollars}${cents === "00" ? "" : `.${cents}`}`;
}

export function buildRuleIndex(corpus) {
  const rules = {};
  for (const r of [...corpus.rules].sort((a, b) => `${a.id}@${a.version}`.localeCompare(`${b.id}@${b.version}`))) {
    rules[`${r.id}@${r.version}`] = {
      title: r.title,
      effectiveFrom: r.effectiveFrom,
      ...(r.effectiveTo ? { effectiveTo: r.effectiveTo } : {}),
      citation: [r.citation.source, r.citation.section].filter(Boolean).join(" "),
      ...(r.parameters
        ? { parameters: Object.fromEntries(Object.entries(r.parameters).map(([k, p]) => [k, display(p)])) }
        : {}),
      parts: {
        formula: short(r.formula),
        applicability: short(r.applicability),
        citation: short(r.citation),
        output: short(r.output),
        overrides: short(r.overrides),
        // a parameter's citation or type, not just its value
        parameterDetail: short(r.parameters),
      },
    };
  }
  const facts = {};
  for (const f of [...corpus.facts].sort((a, b) => a.id.localeCompare(b.id))) {
    facts[f.id] = {
      type: f.type,
      ...(f.default !== undefined ? { default: f.default.value } : {}),
      hash: short(f),
    };
  }
  return { name: corpus.name, version: corpus.version, merkleRoot: corpus.merkleRoot, rules, facts };
}

/** One entry per line: small enough to commit, and a release's diff reads rule by rule. */
export function formatRuleIndex(index) {
  const block = (obj) =>
    Object.entries(obj)
      .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`)
      .join(",\n");
  return [
    "{",
    `"name": ${JSON.stringify(index.name)},`,
    `"version": ${JSON.stringify(index.version)},`,
    `"merkleRoot": ${JSON.stringify(index.merkleRoot)},`,
    `"rules": {\n${block(index.rules)}\n},`,
    `"facts": {\n${block(index.facts)}\n}`,
    "}",
    "",
  ].join("\n");
}
