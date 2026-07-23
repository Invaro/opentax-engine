/**
 * Differential-harness scenario generator: a structured grid over the fact
 * space both opentax and PolicyEngine US can express, TY2025.
 *
 *   node harness/generate-scenarios.mjs > harness/scenarios.json
 */

const scenarios = [];
let n = 0;
const add = (s) => scenarios.push({ id: `s${String(++n).padStart(4, "0")}`, asOf: "2025-12-31", interest: 0, gains: 0, age65: false, kids: 0, ...s });

// core grid: status × wages × kids × senior
const WAGES = [0, 8000, 12000, 17000, 20000, 25000, 30000, 40000, 50000,
  65000, 90000, 120000, 150000, 190000, 250000, 412000];
for (const status of ["single", "mfj", "hoh"]) {
  for (const wages of WAGES) {
    for (const kids of [0, 1, 2, 3]) {
      if (status === "hoh" && kids === 0) continue; // HoH implies a dependent
      for (const age65 of [false, true]) {
        add({ status, wages, kids, age65 });
      }
    }
  }
}

// surviving spouse (requires a dependent child)
for (const wages of [20000, 50000, 120000, 212000, 412000]) {
  for (const kids of [1, 2]) add({ status: "qss", wages, kids });
}

// EITC investment-income cliff neighborhood
for (const interest of [0, 5000, 11000, 11950, 11951, 13000]) {
  add({ status: "hoh", wages: 30000, kids: 2, interest });
}

// capital-gains stacking + NIIT
for (const wages of [50000, 190000, 240000]) {
  for (const gains of [10000, 30000, 50000]) {
    add({ status: "single", wages, gains });
  }
}

// CTC phase-out boundary band
for (const wages of [411000, 412000, 412001, 413000, 442500]) {
  add({ status: "mfj", wages, kids: 2 });
}

// ── OBBBA territory ─────────────────────────────────────────────────────
// tips (§ 224): incl. cap + phase-out region (PE rounds continuously there)
for (const [status, wagesList] of [
  ["single", [40000, 60000, 120000, 155000, 160000, 200000]],
  ["hoh", [45000, 90000, 155000]],
  ["mfj", [80000, 200000, 305000, 320000]],
]) {
  for (const wages of wagesList) {
    for (const tips of [5000, 12000, 26000]) {
      if (tips >= wages) continue;
      add({ status, wages, kids: status === "hoh" ? 1 : 0, tips });
    }
  }
}

// overtime (§ 225): caps ($12.5k / $25k joint) + phase-out
for (const [status, wagesList, otList] of [
  ["single", [80000, 149000, 152000, 165000], [6000, 13000]],
  ["mfj", [200000, 305000, 320000], [10000, 26000]],
]) {
  for (const wages of wagesList) for (const ot of otList) {
    add({ status, wages, overtime: ot });
  }
}

// fractional-thousand excess: exposes PE's continuous phase-out vs the
// Schedule 1-A whole-step floor
add({ status: "mfj", wages: 305500, overtime: 10000 });
add({ status: "single", wages: 151500, overtime: 6000 });

// senior phase-out edges (per-individual 6% — the bug the harness caught)
for (const wages of [80000, 100000, 130000, 172000, 176000]) {
  add({ status: "single", wages, age65: true });
}
for (const wages of [160000, 200000, 240000, 249000, 251000]) {
  add({ status: "mfj", wages, age65: true });
}

// self-employment + QBI (below the § 199A threshold) + EITC-earned interplay
for (const p of [400, 434, 5000, 20000, 80000, 150000, 176100]) {
  add({ status: "single", wages: 0, seProfit: p });
}
for (const p of [8000, 15000, 25000]) {
  for (const kids of [1, 2]) add({ status: "hoh", wages: 0, seProfit: p, kids });
}
add({ status: "mfj", wages: 50000, seProfit: 40000 }); // wage-base coordination

// student loan interest (§ 221 ratio phase-out; 2025: 85–100k / 170–200k)
for (const wages of [60000, 85000, 90000, 99000, 101000]) {
  for (const sl of [1500, 2500, 4000]) add({ status: "single", wages, studentLoan: sl });
}
for (const wages of [168000, 180000, 198000, 204000]) {
  add({ status: "mfj", wages, studentLoan: 2500 });
}

// ── Schedule A territory ─────────────────────────────────
// SALT cap + 30% phase-down + $10,000 floor, sweeping the whole MAGI band
// (below threshold / inside the phase-down / at and past the floor)
for (const status of ["single", "mfj"]) {
  for (const wages of [90000, 200000, 350000, 480000, 510000, 550000, 599000, 601000, 700000]) {
    for (const salt of [8000, 24000, 41000]) {
      add({ status, wages, salt });
    }
  }
}
// MFS halves: $20,000 cap, $250,000 threshold, $5,000 floor
for (const wages of [120000, 255000, 260000, 290000, 310000]) {
  add({ status: "mfs", wages, salt: 24000 });
}
// full Schedule A stacks + the standard-vs-itemized election boundary
add({ status: "mfj", wages: 200000, salt: 25000, mortgage: 18000, medical: 20000, charity: 5000 });
add({ status: "mfj", wages: 90000, salt: 8000, charity: 3000 }); // standard wins
add({ status: "mfj", wages: 90000, salt: 30000, charity: 3000 }); // itemized wins
add({ status: "single", wages: 150000, mortgage: 12000, charity: 4000 });
add({ status: "hoh", wages: 120000, kids: 1, salt: 15000, medical: 25000 });
add({ status: "single", wages: 550000, salt: 45000, charity: 50000 }); // phase-down + large charity
add({ status: "single", wages: 100000, salt: 10000, medical: 8000 }); // medical floor exactly 7.5%

// ── K-1 pass-through business income ────────────────────
// S-corp/partnership box 1: QBI-eligible, not SE-taxed. Below the § 199A
// threshold only — above it opentax refuses (W-2/UBIA limits unmodeled)
// while PE computes the phase-in.
for (const wages of [0, 30000, 50000, 90000]) {
  for (const k1 of [20000, 60000, 100000]) {
    add({ status: "single", wages, k1 });
  }
}
for (const [wages, k1] of [[80000, 50000], [80000, 120000], [150000, 120000], [200000, 150000]]) {
  add({ status: "mfj", wages, k1 });
}
add({ status: "hoh", wages: 40000, kids: 1, k1: 30000 }); // EITC × AGI interplay
add({ status: "single", wages: 60000, seProfit: 30000, k1: 40000 }); // both sources

// § 199A ABOVE the threshold: zero-W-2 phase-in — both
// engines default the business's W-2 wages to $0, so the (b)(3)(B)
// reduction is directly comparable
add({ status: "single", wages: 150000, k1: 100000, sstb: false });
add({ status: "mfj", wages: 300000, k1: 150000, sstb: false });
add({ status: "single", wages: 120000, seProfit: 150000, sstb: false });

// § 86 social security + retirement income
add({ status: "single", wages: 20000, ss: 20000 });
add({ status: "single", wages: 45000, ss: 24000 });
add({ status: "mfj", wages: 60000, ss: 36000 });
add({ status: "mfj", wages: 0, pensions: 40000, ss: 30000 });
add({ status: "single", wages: 10000, unemployment: 15000 });

process.stdout.write(JSON.stringify(scenarios, null, 1) + "\n");
