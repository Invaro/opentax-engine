/**
 * The checked-in staleness declaration must match what the rule windows say —
 * a rule cannot quietly expire unlisted, and a horizon-year version cannot land
 * without retiring its entry.
 */
import { describe, expect, it } from "vitest";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";
import { CORE_RULE_SUFFIXES, STALE_AT_HORIZON, STALE_HORIZON } from "../src/staleness.js";

const corpus = getCorpus();

/** per state, the rule ids (excluding parameters-only rules) whose LATEST version ends on or before the horizon */
function computeStale(): Record<string, string[]> {
  const maxTo = new Map<string, Map<string, string>>();
  for (const r of corpus.rules) {
    if (!r.jurisdiction.startsWith("us.") || r.jurisdiction === "us") continue;
    const j = r.jurisdiction.slice(3);
    const m = maxTo.get(j) ?? new Map<string, string>();
    const to = r.effectiveTo ?? "9999-12-31";
    const cur = m.get(r.id);
    if (!cur || to > cur) m.set(r.id, to);
    maxTo.set(j, m);
  }
  const out: Record<string, string[]> = {};
  for (const [j, m] of maxTo) {
    const stale = [...m].filter(([id, to]) => !id.endsWith(".parameters") && to <= STALE_HORIZON).map(([id]) => id).sort();
    if (stale.length) out[j] = stale;
  }
  return out;
}

describe(`staleness at the ${STALE_HORIZON} horizon`, () => {
  const computed = computeStale();

  it("lists every jurisdiction with a stale rule, and no other", () => {
    expect(Object.keys(STALE_AT_HORIZON).sort()).toEqual(Object.keys(computed).sort());
  });

  it("lists exactly the stale rule ids of each jurisdiction", () => {
    for (const [j, entry] of Object.entries(STALE_AT_HORIZON)) {
      expect([...entry.rules].sort(), j).toEqual(computed[j] ?? []);
    }
  });

  it("assigns the 'return' tier exactly when a core rule is stale", () => {
    for (const [j, entry] of Object.entries(STALE_AT_HORIZON)) {
      const coreStale = entry.rules.some((id) => CORE_RULE_SUFFIXES.some((s) => id.endsWith(s)));
      expect(entry.tier, `${j}: ${entry.rules.join(", ")}`).toBe(coreStale ? "return" : "lines");
    }
  });

  it("names the publication that unblocks each entry", () => {
    for (const [j, entry] of Object.entries(STALE_AT_HORIZON)) expect(entry.unblockedBy.length, j).toBeGreaterThan(20);
  });
});
