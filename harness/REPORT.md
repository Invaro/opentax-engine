# Differential report — opentax vs PolicyEngine US

- corpus: `sha256:3cb405a1dce4dc7c26ec8fdea9b55162b77418bcba85f8b3494d346d9f088861`
- scenarios: **572** (TY2025; wages × filing status × children × senior × interest × capital gains × tips × overtime × self-employment/QBI × student loan × Schedule A itemized: SALT phase-down/floor/MFS-halves, mortgage, medical, charity, election boundary)
- comparable: opentax `net_tax` (formula mode) ↔ PolicyEngine `income_tax + additional_medicare_tax + self_employment_tax`

| bucket | count | share |
|---|---|---|
| agree exactly (to the cent) | 531 | 92.8% |
| within 2¢ (float rounding) | 6 | 1.0% |
| within $1 | 0 | 0.0% |
| explained differences (triaged, cited) | 35 | 6.1% |
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

**SALT cap for married filing separately** (2 scenarios, verdict: policyengine-bug)
- opentax: half of max($10,000, $40,000 − 30% × (MAGI − $250,000)) — the phase-down and floor apply to the full amount, then it is halved ($20,000 − 15% of the excess, never below $5,000); policyengine: max($5,000, $20,000 − 30% × (MAGI − $250,000)) — halves the amount first, so it reaches the $5,000 floor at $300,000
- authority: PRIMARY SOURCE VERIFIED (2026-11-06): 26 U.S.C. § 164(b)(7)(B)(i) reduces 'the applicable limitation amount' ($40,000 for 2025) by 30 percent of MAGI over 'the threshold amount (half the threshold amount in the case of a married individual filing a separate return)', with the $10,000 floor of (b)(7)(B)(iii); § 164(b)(6)(B) then allows taxes up to 'the applicable limitation amount (half the applicable limitation amount in the case of a married individual filing a separate return)'. The 2025 Schedule A instructions' State and Local Tax Deduction Worksheet does the same: line 1 $40,000 for every status, line 5 $250,000 MFS, line 9 the larger of line 8 or $10,000, line 10 'half the amount on line 9 if married filing separately'.

