/**
 * Diff the two engines' results and write the differential report.
 *
 *   node harness/compare.mjs harness/scenarios.json \
 *        harness/results-opentax.json harness/results-policyengine.json \
 *        > harness/REPORT.md
 */

import { readFileSync } from "node:fs";

const [scenariosPath, oursPath, theirsPath] = process.argv.slice(2);
const scenarios = JSON.parse(readFileSync(scenariosPath, "utf8"));
const ours = JSON.parse(readFileSync(oursPath, "utf8"));
const theirs = JSON.parse(readFileSync(theirsPath, "utf8"));
const known = JSON.parse(
  readFileSync(new URL("./known-differences.json", import.meta.url), "utf8"),
);

function knownDifference(s) {
  const magiThreshold = s.status === "mfj" ? 300000 : 150000;
  for (const d of known.differences) {
    const m = d.match;
    if (m.tipsRegion) {
      // PE's tips-as-exclusion only diverges at the cap, in the phase-out,
      // or where EITC earned income is in play
      const inRegion =
        (s.tips ?? 0) > 0 &&
        ((s.tips ?? 0) > 25000 ||
          s.wages > magiThreshold ||
          ((s.kids ?? 0) >= 1 && s.wages <= 60000) ||
          s.wages - (s.tips ?? 0) < 20000);
      if (inRegion) return d;
      continue;
    }
    if (m.overtimeFractionalPhaseout) {
      const excess = s.wages - magiThreshold;
      if ((s.overtime ?? 0) > 0 && excess > 0 && excess % 1000 !== 0) return d;
      continue;
    }
    if (m.status && s.status !== m.status) continue;
    if (m.kids === ">=1" && !(s.kids >= 1)) continue;
    if (m.wagesOver !== undefined && !(s.wages > m.wagesOver)) continue;
    return d;
  }
  return null;
}

const fmt = (c) => {
  const n = BigInt(c);
  const sign = n < 0n ? "-" : "";
  const a = n < 0n ? -n : n;
  return `${sign}$${(a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}.${(a % 100n).toString().padStart(2, "0")}`;
};

let exact = 0, cent2 = 0, dollar = 0;
const disagreements = [];
const explained = [];
const errors = [];

for (const s of scenarios) {
  const a = ours.results[s.id];
  const b = theirs.results[s.id];
  if (String(a).startsWith("ERROR") || String(b).startsWith("ERROR")) {
    errors.push({ s, a, b });
    continue;
  }
  const diff = BigInt(a) - BigInt(b);
  const abs = diff < 0n ? -diff : diff;
  if (abs === 0n) exact++;
  else if (abs <= 2n) cent2++; // float-to-cents rounding noise
  else if (abs <= 100n) dollar++;
  else {
    const k = knownDifference(s);
    if (k) explained.push({ s, a, b, diff, k });
    else disagreements.push({ s, a, b, diff });
  }
}

const total = scenarios.length;
const lines = [];
lines.push(`# Differential report — opentax vs PolicyEngine US`);
lines.push(``);
lines.push(`- corpus: \`${ours.corpusMerkleRoot}\``);
lines.push(`- scenarios: **${total}** (TY2025; wages × filing status × children × senior × interest × capital gains × tips × overtime × self-employment/QBI × student loan × Schedule A itemized: SALT phase-down/floor/MFS-halves, mortgage, medical, charity, election boundary)`);
lines.push(`- comparable: opentax \`net_tax\` (formula mode) ↔ PolicyEngine \`income_tax + additional_medicare_tax + self_employment_tax\``);
lines.push(``);
lines.push(`| bucket | count | share |`);
lines.push(`|---|---|---|`);
lines.push(`| agree exactly (to the cent) | ${exact} | ${((exact / total) * 100).toFixed(1)}% |`);
lines.push(`| within 2¢ (float rounding) | ${cent2} | ${((cent2 / total) * 100).toFixed(1)}% |`);
lines.push(`| within $1 | ${dollar} | ${((dollar / total) * 100).toFixed(1)}% |`);
lines.push(`| explained differences (triaged, cited) | ${explained.length} | ${((explained.length / total) * 100).toFixed(1)}% |`);
lines.push(`| **unexplained disagreements (> $1)** | **${disagreements.length}** | **${((disagreements.length / total) * 100).toFixed(1)}%** |`);
lines.push(`| errors | ${errors.length} | ${((errors.length / total) * 100).toFixed(1)}% |`);
lines.push(``);

if (explained.length) {
  lines.push(`## Explained differences`);
  lines.push(``);
  const byVerdict = new Map();
  for (const e of explained) {
    const key = e.k.component;
    if (!byVerdict.has(key)) byVerdict.set(key, { k: e.k, rows: [] });
    byVerdict.get(key).rows.push(e);
  }
  for (const { k, rows } of byVerdict.values()) {
    lines.push(`**${k.component}** (${rows.length} scenarios, verdict: ${k.verdict})`);
    lines.push(`- opentax: ${k.opentax}; policyengine: ${k.policyengine}`);
    lines.push(`- authority: ${k.authority}`);
    lines.push(``);
  }
}

if (disagreements.length) {
  lines.push(`## Disagreements (each requires triage: our bug / their bug / definitional)`);
  lines.push(``);
  lines.push(`| id | scenario | opentax | policyengine | Δ |`);
  lines.push(`|---|---|---|---|---|`);
  for (const d of disagreements) {
    const { status, wages, kids, age65, interest, gains } = d.s;
    const desc = `${status} w=${wages}${kids ? ` kids=${kids}` : ""}${age65 ? " 65+" : ""}${interest ? ` int=${interest}` : ""}${gains ? ` gains=${gains}` : ""}`;
    lines.push(`| ${d.s.id} | ${desc} | ${fmt(d.a)} | ${fmt(d.b)} | ${fmt(d.diff)} |`);
  }
  lines.push(``);
}
if (errors.length) {
  lines.push(`## Errors`);
  for (const e of errors) lines.push(`- ${e.s.id}: ours=${e.a} theirs=${e.b}`);
  lines.push(``);
}

process.stdout.write(lines.join("\n") + "\n");
console.error(`exact=${exact} ±2¢=${cent2} ±$1=${dollar} explained=${explained.length} disagreements=${disagreements.length} errors=${errors.length}`);
process.exitCode = disagreements.length > 0 || errors.length > 0 ? 1 : 0;
