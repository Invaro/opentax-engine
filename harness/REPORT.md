# Differential report — opentax vs PolicyEngine US

- corpus: `sha256:649215e9e5fc8f000821d3a1a90981c90b89fcaeea1ea39378121cc48ff1b081`
- scenarios: **572** (TY2025; wages × filing status × children × senior × interest × capital gains × tips × overtime × self-employment/QBI × student loan × Schedule A itemized: SALT phase-down/floor/MFS-halves, mortgage, medical, charity, election boundary)
- comparable: opentax `net_tax` (formula mode) ↔ PolicyEngine `income_tax + additional_medicare_tax + self_employment_tax`

| bucket | count | share |
|---|---|---|
| agree exactly (to the cent) | 533 | 93.2% |
| within 2¢ (float rounding) | 6 | 1.0% |
| within $1 | 0 | 0.0% |
| explained differences (triaged, cited) | 33 | 5.8% |
| **unexplained disagreements (> $1)** | **0** | **0.0%** |
| errors | 0 | 0.0% |

## Explained differences

**CTC phase-out threshold** (4 scenarios, verdict: policyengine-bug)
- opentax: $200,000 for qualifying surviving spouse; policyengine: $400,000 (treats surviving spouse as a joint return)
- authority: PRIMARY SOURCE VERIFIED (2026-07-07): IRS 2025 Instructions for Schedule 8812 (irs.gov/instructions/i1040s8), 'Limits on the CTC and ODC': 'Married filing jointly - $400,000; All other filing statuses - $200,000.' QSS is a distinct filing status -> $200,000. Statutorily: 26 U.S.C. 24(h)(3) applies $400,000 'in the case of a joint return'; a surviving-spouse return is not a joint return (6013); 2(a) grants surviving spouses joint RATES only. Note: popular secondary sources (and PolicyEngine) group QSS with MFJ here — a paraphrase error the primary text contradicts.

**§ 224 tips deduction modeling** (27 scenarios, verdict: policyengine-divergence-from-statute)
- opentax: capped deduction ($25,000), $100-per-$1,000 MAGI phase-out over $150k/$300k (floor per Schedule 1-A), tips remain earned income for EITC; policyengine: tip_income modeled as an uncapped, un-phased exclusion from gross income; tips also drop out of EITC earned income
- authority: PRIMARY SOURCE (26 U.S.C. § 224, read from the U.S. Code): 'There shall be allowed as a DEDUCTION... shall not exceed $25,000... reduced (but not below zero) by $100 for each $1,000 by which MAGI exceeds $150,000 ($300,000 joint).' Instrumented PE (2026-07-07): tips 26,000 on 40,000 wages -> PE AGI 14,000 (full exclusion, no cap) and childless EITC $390.43 granted on tip-free 'earned income' — § 32 earned income includes tips (wages). Where representations coincide (tips under cap, MAGI under threshold, no EITC) both engines agree to the cent.

**§§ 224/225 phase-out step rounding** (2 scenarios, verdict: policyengine-divergence-from-IRS-worksheet)
- opentax: $100 per WHOLE $1,000 of excess MAGI (floor) — IRS Schedule 1-A instructions: 'divide by $1,000 and round down'; policyengine: continuous 10% of excess MAGI (no step rounding)
- authority: IRS Schedule 1-A instructions worked example (mirrored exactly by our fixture 20): MAGI $40,500 over the joint threshold -> 40 whole steps -> $4,000 reduction; continuous would give $4,050. Differences appear only when the excess is a fractional multiple of $1,000; magnitude <= $100 x marginal rate.

exact=533 ±2¢=6 ±$1=0 explained=33 disagreements=0 errors=0
