/**
 * EITC parameter-identity gate: the Rev. Procs. publish both the phase-out
 * thresholds AND the "completed phaseout amounts". They are mathematically
 * linked: completed ≈ threshold + maxCredit / phaseOutRate. If any encoded
 * number were transcribed wrong, this identity breaks — a cross-check the
 * IRS effectively ships inside its own document.
 */

import { describe, expect, it } from "vitest";
import { EITC_PARAMS } from "../src/rules/eitc.js";

// Completed phaseout amounts as READ from the Rev. Procs. (whole dollars):
// rp-24-40 § 2.06 and rp-25-32 § 4.06 — [1 kid, 2 kids, 3+ kids, 0 kids]
const COMPLETED = {
  TY2025: {
    other: [50434, 57310, 61555, 19104],
    mfj: [57554, 64430, 68675, 26214],
  },
  TY2026: {
    other: [51593, 58629, 62974, 19540],
    mfj: [58863, 65899, 70244, 26820],
  },
} as const;

describe("EITC parameter identity (threshold + max/rate == completed)", () => {
  for (const year of ["TY2025", "TY2026"] as const) {
    const p = EITC_PARAMS[year];
    it(`${year}: all eight completed-phaseout amounts reproduce within $1`, () => {
      for (const kids of [0, 1, 2, 3] as const) {
        const rate = EITC_PARAMS.PHASE_OUT[kids];
        const maxCents = BigInt(p.max[kids]) * 100n;
        // span in cents = max / rate = max * den / num
        const spanCents = (maxCents * BigInt(rate.den)) / BigInt(rate.num);
        const thresholdOther =
          kids === 0 ? p.thresholdOther0 : p.thresholdOtherKids;
        const thresholdMFJ = kids === 0 ? p.thresholdMFJ0 : p.thresholdMFJKids;
        const completedIdx = kids === 0 ? 3 : kids - 1;

        for (const [threshold, expected] of [
          [thresholdOther, COMPLETED[year].other[completedIdx]],
          [thresholdMFJ, COMPLETED[year].mfj[completedIdx]],
        ] as const) {
          const computed = BigInt(threshold) * 100n + spanCents;
          const diff = computed - BigInt(expected) * 100n;
          const abs = diff < 0n ? -diff : diff;
          expect(
            abs <= 100n,
            `${year} kids=${kids} threshold=${threshold}: computed ${computed} vs published ${expected * 100} (diff ${diff}¢)`,
          ).toBe(true);
        }
      }
    });
  }
});
