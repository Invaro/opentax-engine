/**
 * Corpus coverage & staleness report — the state-treadmill dashboard.
 *
 *   pnpm -F @invaro/opentax-corpus-us-federal report:coverage           # human table
 *   pnpm -F @invaro/opentax-corpus-us-federal report:coverage -- --json # machine-readable
 *   ... -- --horizon 2026-12-31   # flag jurisdictions with no rule valid ON this date
 *                                 # (effectiveTo is exclusive; default asks "is TY2026 covered?")
 *
 * Answers, per jurisdiction: how many rules and golden fixtures cover it, how
 * far its rule windows reach, what depth tier it is (deep pack with composer /
 * computable rules / parameters-or-zero only), and which rules expire soonest.
 * Exit code 0 always — this is a report, not a gate; CI gates can consume the
 * JSON and choose their own thresholds.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCorpus } from "../dist/index.js";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const horizonIdx = args.indexOf("--horizon");
const horizon = horizonIdx >= 0 ? args[horizonIdx + 1] : "2026-12-31";
const today = new Date().toISOString().slice(0, 10);

// Jurisdictions with a printed-form composer (keep in sync with
// packages/compose/src/index.ts — the composer dispatcher).
const COMPOSED = new Set(["il", "va", "ca", "ny", "pa", "nj", "oh"]);

const ALL_STATES = "al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy".split(" ");

const corpus = getCorpus();
const fixturesDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "test", "fixtures");

// fixture counts per jurisdiction (by target prefix)
const fixtureCount = {};
for (const f of readdirSync(fixturesDir).filter((f) => f.endsWith(".json"))) {
  const fx = JSON.parse(readFileSync(path.join(fixturesDir, f), "utf8"));
  const target = fx.target ?? "us.federal.net_tax";
  const m = target.match(/^us\.([a-z]{2})\./);
  const j = m ? m[1] : "federal";
  fixtureCount[j] = (fixtureCount[j] ?? 0) + 1;
}

const byJurisdiction = {};
for (const rule of corpus.rules) {
  const m = rule.jurisdiction.match(/^us\.([a-z]{2})$/);
  const j = m ? m[1] : "federal";
  const e = (byJurisdiction[j] ??= { rules: 0, computable: 0, maxEffectiveTo: "0000", openEnded: false, expiring: [] });
  e.rules += 1;
  if (rule.formula?.kind !== "unsupported") e.computable += 1;
  if (!rule.effectiveTo) e.openEnded = true;
  else if (rule.effectiveTo > e.maxEffectiveTo) e.maxEffectiveTo = rule.effectiveTo;
  // a rule "expires" when no NEWER version of the same id continues past it —
  // collect raw windows first, resolve below
  e.expiring.push({ id: rule.id, version: rule.version, to: rule.effectiveTo ?? null });
}

// resolve per-rule-id max window so superseded versions don't false-flag
for (const e of Object.values(byJurisdiction)) {
  const maxTo = new Map();
  for (const r of e.expiring) {
    const cur = maxTo.get(r.id);
    const to = r.to ?? "9999-12-31";
    if (!cur || to > cur) maxTo.set(r.id, to);
  }
  e.ruleIds = maxTo.size;
  e.expiringSoon = [...maxTo.entries()]
    .filter(([, to]) => to !== "9999-12-31" && to <= horizon)
    .sort(([, a], [, b]) => (a < b ? -1 : 1))
    .map(([id, to]) => ({ id, lastValidBefore: to }));
  delete e.expiring;
}

const rows = [];
for (const j of ["federal", ...ALL_STATES]) {
  const e = byJurisdiction[j];
  const covered = !!e;
  const tier = !covered
    ? "UNCOVERED"
    : COMPOSED.has(j)
      ? "deep+composer"
      : e.computable === 0
        ? "parameters-only"
        : e.rules === 1 && e.computable === 1
          ? "single-rule"
          : "computable";
  rows.push({
    jurisdiction: j,
    tier,
    rules: e?.ruleIds ?? 0,
    computable: e?.computable ?? 0,
    fixtures: fixtureCount[j] ?? 0,
    coverageThrough: !covered ? null : e.openEnded ? "open-ended" : e.maxEffectiveTo,
    staleAtHorizon: covered && !e.openEnded && e.maxEffectiveTo <= horizon,
    expiringSoon: e?.expiringSoon ?? [],
  });
}

const summary = {
  generated: today,
  corpusVersion: corpus.version,
  merkleRoot: corpus.merkleRoot,
  horizon,
  totals: {
    rules: corpus.rules.length,
    jurisdictionsCovered: rows.filter((r) => r.tier !== "UNCOVERED").length,
    deepComposed: rows.filter((r) => r.tier === "deep+composer").length,
    uncovered: rows.filter((r) => r.tier === "UNCOVERED").map((r) => r.jurisdiction),
    staleAtHorizon: rows.filter((r) => r.staleAtHorizon).map((r) => r.jurisdiction),
  },
  rows,
};

if (asJson) {
  console.log(JSON.stringify(summary, null, 2));
} else {
  const pad = (s, n) => String(s).padEnd(n);
  console.log(`corpus ${summary.corpusVersion} · ${summary.totals.rules} rules · horizon ${horizon}\n`);
  console.log(pad("jur", 9) + pad("tier", 16) + pad("rules", 7) + pad("fixtures", 10) + "coverage through");
  for (const r of rows) {
    if (r.tier === "UNCOVERED") continue;
    const flag = r.staleAtHorizon ? "  ⚠ stale at horizon" : "";
    console.log(pad(r.jurisdiction, 9) + pad(r.tier, 16) + pad(r.rules, 7) + pad(r.fixtures, 10) + (r.coverageThrough ?? "-") + flag);
  }
  console.log(`\nUNCOVERED (${summary.totals.uncovered.length}): ${summary.totals.uncovered.join(" ") || "none"}`);
  const expiring = rows.flatMap((r) => r.expiringSoon.map((e) => `${e.id} (through ${e.lastValidBefore})`));
  console.log(`\nRules whose latest version ends by ${horizon}: ${expiring.length}`);
  for (const e of expiring.slice(0, 40)) console.log("  " + e);
  if (expiring.length > 40) console.log(`  … and ${expiring.length - 40} more`);
}
