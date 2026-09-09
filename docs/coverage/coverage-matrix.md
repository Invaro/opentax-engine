# Coverage matrix — corpus 0.39.0

Generated 2026-09-09T12:45:33.840Z from the rule corpus (Merkle root `sha256:5f34e0bc2fe5d80f540b75151cc8793bca4bda4555485dfb0d313927938f1911`). Machine-readable: [coverage-matrix.json](coverage-matrix.json). Regenerate with `node packages/corpus-us-federal/scripts/coverage-matrix.mjs`.

## What the API returns

| output | available |
|---|---|
| tax totals | yes |
| complete form line sets | federal Form 1040 bottom-line set; 31 state full-year-resident returns (every printed line the form's totals consume) |
| worksheet lines | the state composers emit the schedule/worksheet lines their totals consume (e.g. VT IN-112/IN-119, DE two-column, MT capital-gains worksheet); federal worksheets are proof-tree nodes, not printed lines |
| calculation proofs and citations | yes — every answer carries a proof tree, every rule a statute/form citation with a verbatim excerpt, verifiable offline ([PROOF-FORMAT.md](../PROOF-FORMAT.md)) |
| rendered forms / PDF | no |
| federal or state MeF XML | no |

## Federal individual (Form 1040) — 115 rule ids

| rule | form / schedule | TY2025 | TY2026 | note |
|---|---|---|---|---|
| `us.federal.excess_business_loss_disallowed` | Form 461 | ✓ | ✓ |  |
| `us.federal.qsbs_exclusion` | Schedule D / Form 8949 | ✓ | ✓ |  |
| `us.federal.standard_deduction.base_amount` | Form 1040 / Schedule 1 | ✓ | ✓ |  |
| `us.federal.standard_deduction.base` | Form 1040 / Schedule 1 | ✓ | ✓ |  |
| `us.federal.standard_deduction.dependent_limit` | Form 1040 / Schedule 1 | ✓ | ✓ |  |
| `us.federal.standard_deduction.mfs_spouse_itemizes` | Form 1040 / Schedule 1 | ✓ | ✓ |  |
| `us.federal.standard_deduction.additional` | Form 1040 / Schedule 1 | ✓ | ✓ |  |
| `us.federal.standard_deduction` | Form 1040 / Schedule 1 | ✓ | ✓ |  |
| `us.federal.amt` | Form 6251 | ✓ | ✓ |  |
| `us.federal.salt_deduction` | Schedule A | ✓ | ✓ |  |
| `us.federal.mortgage_interest_deduction` | Schedule A | ✓ | ✓ |  |
| `us.federal.charitable_deduction_itemizer` | Schedule A | ✓ | ✓ |  |
| `us.federal.medical_expense_deduction` | Schedule A | ✓ | ✓ |  |
| `us.federal.casualty_loss_deduction` | Schedule A | ✓ | ✓ |  |
| `us.federal.itemized_deductions_before_limitation` | Schedule A | ✓ | ✓ |  |
| `us.federal.itemized_deductions` | Schedule A | ✓ | ✓ |  |
| `us.federal.deduction_election` | Schedule A | ✓ | ✓ |  |
| `us.federal.education.aotc_tentative` | Form 8863 | ✓ | ✓ |  |
| `us.federal.education.aotc` | Form 8863 | ✓ | ✓ |  |
| `us.federal.education.aotc_refundable` | Form 8863 | ✓ | ✓ |  |
| `us.federal.education.llc` | Form 8863 | ✓ | ✓ |  |
| `us.federal.education.nonrefundable` | Form 8863 | ✓ | ✓ |  |
| `us.federal.ira_deduction` | Form 1040 / Schedule 1 | ✓ | ✓ |  |
| `us.federal.ira8606.taxable_amount` | Form 8606 | ✓ | ✓ |  |
| `us.federal.ira8606.basis_carryforward` | Form 8606 | ✓ | ✓ |  |
| `us.federal.schedule_d.preferential_lt_gain` | Schedule D / Form 8949 | ✓ | ✓ |  |
| `us.federal.schedule_d.ordinary_st_gain` | Schedule D / Form 8949 | ✓ | ✓ |  |
| `us.federal.schedule_d.net_loss` | Schedule D / Form 8949 | ✓ | ✓ |  |
| `us.federal.rental.depreciation` | Schedule E / Form 8582 | ✓ | ✓ |  |
| `us.federal.rental.net_income` | Schedule E / Form 8582 | ✓ | ✓ |  |
| `us.federal.pension.simplified_method_exclusion` | Form 1040 line 5 (Simplified Method) | ✓ | ✓ | simplified/approximated — see title |
| `us.federal.pension.simplified_method_taxable` | Form 1040 line 5 (Simplified Method) | ✓ | ✓ | simplified/approximated — see title |
| `us.federal.capital_loss_ordinary_offset` | Schedule D / Form 8949 | ✓ | ✓ |  |
| `us.federal.capital_loss_carryover` | Schedule D / Form 8949 | ✓ | ✓ | simplified/approximated — see title |
| `us.federal.kiddie.net_unearned_income` | Form 1040 line 16 / Tax Table / Form 8615 / Schedule D worksheet | ✓ | ✓ |  |
| `us.federal.kiddie_tax` | Form 1040 line 16 / Tax Table / Form 8615 / Schedule D worksheet | ✓ | ✓ |  |
| `us.federal.income_tax_before_credits.kiddie` | Form 1040 line 16 / Tax Table / Form 8615 / Schedule D worksheet | ✓ | ✓ |  |
| `us.federal.gross_income` | Form 1040 / Schedule 1 | ✓ | ✓ | simplified/approximated — see title |
| `us.federal.above_the_line_adjustments` | Form 1040 / Schedule 1 | ✓ | ✓ |  |
| `us.federal.agi_before_student_loan` | Form 1040 / Schedule 1 | ✓ | ✓ |  |
| `us.federal.agi` | Form 1040 / Schedule 1 | ✓ | ✓ |  |
| `us.federal.taxable_income_before_qbi` | Form 1040 / Schedule 1 | ✓ | ✓ |  |
| `us.federal.taxable_income` | Form 1040 / Schedule 1 | ✓ | ✓ |  |
| `us.federal.ordinary_taxable_income` | Form 1040 / Schedule 1 | ✓ | ✓ |  |
| `us.federal.income_tax_before_credits` | Form 1040 line 16 / Tax Table / Form 8615 / Schedule D worksheet | ✓ | ✓ |  |
| `us.federal.income_tax_before_credits.tax_table` | Form 1040 line 16 / Tax Table / Form 8615 / Schedule D worksheet | ✓ | ✓ |  |
| `us.federal.ctc.tentative` | Schedule 8812 | ✓ | ✓ |  |
| `us.federal.ctc.phaseout_threshold` | Schedule 8812 | ✓ | ✓ |  |
| `us.federal.ctc.reduction` | Schedule 8812 | ✓ | ✓ |  |
| `us.federal.ctc.after_phaseout` | Schedule 8812 | ✓ | ✓ |  |
| `us.federal.ctc` | Schedule 8812 | ✓ | ✓ |  |
| `us.federal.actc` | Schedule 8812 | ✓ | ✓ | simplified/approximated — see title |
| `us.federal.income_tax_after_credits` | Form 1040 lines 22-37 / Schedule 2 / Schedule 3 | ✓ | ✓ |  |
| `us.federal.cdcc.tentative` | Form 2441 | ✓ | ✓ |  |
| `us.federal.cdcc` | Form 2441 | ✓ | ✓ |  |
| `us.federal.savers.tentative` | Form 8880 | ✓ | ✓ |  |
| `us.federal.savers_credit` | Form 8880 | ✓ | ✓ |  |
| `us.federal.adoption.allowed` | Form 8839 | ✓ | ✓ |  |
| `us.federal.adoption.refundable` | Form 8839 | ✓ | ✓ |  |
| `us.federal.adoption.nonrefundable` | Form 8839 | ✓ | ✓ |  |
| `us.federal.adoption.carryforward` | Form 8839 | ✓ | ✓ |  |
| `us.federal.ptc` | Form 8962 | ✓ | ✓ |  |
| `us.federal.ptc.net` | Form 8962 | ✓ | ✓ |  |
| `us.federal.ptc.excess_aptc_repayment` | Form 8962 | ✓ | ✓ |  |
| `us.federal.feie.exclusion` | Form 2555 | ✓ | ✓ |  |
| `us.federal.income_tax_before_credits.feie` | Form 1040 line 16 / Tax Table / Form 8615 / Schedule D worksheet | ✓ | ✓ |  |
| `us.federal.eitc.feie_denial` | Schedule EIC / EIC Table | ✓ | ✓ |  |
| `us.federal.household_employment_taxes` | Schedule H | ✓ | ✓ |  |
| `us.federal.estimated.required_annual_payment.farmer` | Form 2210 / Schedule AI / § 6654 | ✓ | ✓ |  |
| `us.federal.home_office_simplified` | Schedule C / Schedule SE / Schedule 1 | ✓ | ✓ | simplified/approximated — see title |
| `us.federal.senior_deduction` | Schedule 1-A (OBBBA deductions) | ✓ | ✓ | simplified/approximated — see title |
| `us.federal.senior_deduction.magi_threshold` | Schedule 1-A (OBBBA deductions) | ✓ | ✓ |  |
| `us.federal.taxable_social_security` | Form 1040 line 6 (§ 86 worksheet) | ✓ | ✓ |  |
| `us.federal.tips_deduction` | Schedule 1-A (OBBBA deductions) | ✓ | ✓ |  |
| `us.federal.overtime_deduction` | Schedule 1-A (OBBBA deductions) | ✓ | ✓ | simplified/approximated — see title |
| `us.federal.eligible.tips_occupation` | Schedule 1-A (OBBBA deductions) | ✓ | ✓ |  |
| `us.federal.eligible.tips_deduction` | Schedule 1-A (OBBBA deductions) | ✓ | ✓ |  |
| `us.federal.car_loan_interest_deduction` | Schedule 1-A (OBBBA deductions) | ✓ | ✓ | simplified/approximated — see title |
| `us.federal.charitable_deduction_nonitemizer` | Schedule 1-A (OBBBA deductions) | ✓ | ✓ |  |
| `us.federal.eitc` | Schedule EIC / EIC Table | ✓ | ✓ | simplified/approximated — see title |
| `us.federal.eitc_no_age_gate` | Schedule EIC / EIC Table | ✓ | ✓ |  |
| `us.federal.employer.payroll_tax` | Forms 941 / 940 (employer payroll tax per employee) | ✓ | ✓ |  |
| `us.federal.credit.research_asc` | Form 6765 (§ 41 ASC) | ✓ | ✓ | simplified/approximated — see title |
| `us.federal.se_net_earnings` | Schedule C / Schedule SE / Schedule 1 | ✓ | ✓ |  |
| `us.federal.se_tax` | Schedule C / Schedule SE / Schedule 1 | ✓ | ✓ |  |
| `us.federal.se_tax_half_deduction` | Schedule C / Schedule SE / Schedule 1 | ✓ | ✓ |  |
| `us.federal.passive_loss_allowed` | Schedule E / Form 8582 | ✓ | ✓ |  |
| `us.federal.passive_loss_suspended` | Schedule E / Form 8582 | ✓ | ✓ |  |
| `us.federal.schedule_r.tentative` | Schedule R | ✓ | ✓ |  |
| `us.federal.schedule_r_credit` | Schedule R | ✓ | ✓ |  |
| `us.federal.vehicle_standard_mileage` | Schedule C / Schedule SE / Schedule 1 | ✓ | ✓ |  |
| `us.federal.hsa_deduction` | Form 1040 / Schedule 1 | ✓ | ✓ |  |
| `us.federal.sep_deduction` | Schedule C / Schedule SE / Schedule 1 | ✓ | ✓ |  |
| `us.federal.sehi_deduction` | Schedule C / Schedule SE / Schedule 1 | ✓ | ✓ |  |
| `us.federal.student_loan_interest_deduction` | Form 1040 / Schedule 1 | ✓ | ✓ |  |
| `us.federal.qbi_deduction` | Form 8995 / 8995-A (§ 199A) | ✓ | ✓ |  |
| `us.federal.niit` | Form 8960 | ✓ | ✓ |  |
| `us.federal.additional_medicare_tax` | Form 8959 | ✓ | ✓ |  |
| `us.federal.other_taxes` | Form 1040 lines 22-37 / Schedule 2 / Schedule 3 | ✓ | ✓ |  |
| `us.federal.refundable_credits` | Form 1040 lines 22-37 / Schedule 2 / Schedule 3 | ✓ | ✓ |  |
| `us.federal.net_tax` | Form 1040 lines 22-37 / Schedule 2 / Schedule 3 | ✓ | ✓ |  |
| `us.federal.balance_due` | Form 1040 lines 22-37 / Schedule 2 / Schedule 3 | ✓ | ✓ |  |
| `us.federal.estimated.required_annual_payment` | Form 2210 / Schedule AI / § 6654 | ✓ | ✓ |  |
| `us.federal.estimated.required_annual_payment.high_agi` | Form 2210 / Schedule AI / § 6654 | ✓ | ✓ |  |
| `us.federal.estimated.quarterly_payment` | Form 2210 / Schedule AI / § 6654 | ✓ | ✓ |  |
| `us.federal.estimated.safe_harbor_met` | Form 2210 / Schedule AI / § 6654 | ✓ | ✓ |  |
| `us.federal.estimated.annualized_installment_q1` | Form 2210 / Schedule AI / § 6654 | ✓ | ✓ |  |
| `us.federal.estimated.annualized_installment_q2` | Form 2210 / Schedule AI / § 6654 | ✓ | ✓ |  |
| `us.federal.estimated.annualized_installment_q3` | Form 2210 / Schedule AI / § 6654 | ✓ | ✓ |  |
| `us.federal.estimated.annualized_installment_q4` | Form 2210 / Schedule AI / § 6654 | ✓ | ✓ |  |
| `us.federal.dependent.qualifying_child` | § 152 dependent determination (Form 1040 dependents) | ✓ | ✓ |  |
| `us.federal.dependent.qualifying_relative` | § 152 dependent determination (Form 1040 dependents) | ✓ | ✓ |  |
| `us.federal.dependent.qualifying_relative.multiple_support` | § 152 dependent determination (Form 1040 dependents) | ✓ | ✓ |  |
| `us.federal.dependent.qualifying_child.divorced_release` | § 152 dependent determination (Form 1040 dependents) | ✓ | ✓ |  |
| `us.federal.dependent.is_dependent` | § 152 dependent determination (Form 1040 dependents) | ✓ | ✓ |  |

## Federal business entities — 34 rule ids

| return | coverage | detail |
|---|---|---|
| 1120 (C corporation) | calculation-only | Taxable income (line 30 given or computed: § 179, § 168(k), § 174A, § 163(j), DRD/§ 245A, NOL, charitable ceiling and floor), 21% tax, § 250, GBC/§ 38(c), FTC/§ 904, BEAT, AET, PHC, § 4501 excise, § 6655 estimates and annualized installments. No printed-form line set, no Schedule L/M-1/M-2/K, no state corporate returns. |
| 1120-S (S corporation) | calculation-only, entity-level taxes only | § 1374 built-in gains and § 1375 excess net passive income taxes; S-election validity via entity classification. Owner-level K-1 income flows into calculate_tax (QBI, no SE tax). No Form 1120-S line set, no Schedule K-1 generation, no basis/AAA tracking. |
| 1065 (partnership) | classification only | Check-the-box classification (disregarded / partnership / S / C) with proof; partner K-1 box 1 income flows into calculate_tax. No Form 1065 computation, no § 704 allocations, no partner basis. |
| 1041 (estate / trust) | calculation-only, rate schedule only | § 1(e) compressed brackets and the § 642(b) exemption on taxable income after the distribution deduction. Retained capital gains REFUSE (§ 1(h) trust breakpoints not modeled); no DNI, no Schedule K-1, no Form 1041 line set. |
| 990 (exempt organizations) | none | Not modeled. |
| State business returns | none | No state corporate, partnership, franchise or PTE-tax returns are modeled. |

| rule | form | TY2025 | TY2026 |
|---|---|---|---|
| `us.federal.corp.entity_classification` | Form 8832 / Reg. § 301.7701-3 (entity classification) | ✓ | ✓ |
| `us.federal.corp.income_tax` | Form 1120 (corporate income tax computation) | ✓ | ✓ |
| `us.federal.corp.stock_buyback_excise` | Form 7208 (§ 4501 excise) | ✓ | ✓ |
| `us.federal.corp.entity_level_income_tax` | Form 1120 (corporate income tax computation) | ✓ | ✓ |
| `us.federal.corp.depreciation_deduction` | Form 4562 (§ 179, § 168(k)) | ✓ | ✓ |
| `us.federal.corp.research_deduction` | Form 1120 (corporate income tax computation) | ✓ | ✓ |
| `us.federal.corp.interest_deduction` | Form 8990 (§ 163(j)) | ✓ | ✓ |
| `us.federal.corp.section179_deduction` | Form 4562 (§ 179, § 168(k)) | ✓ | ✓ |
| `us.federal.corp.section179_carryforward` | Form 4562 (§ 179, § 168(k)) | ✓ | ✓ |
| `us.federal.corp.charitable_deduction` | Form 1120 (corporate income tax computation) | ✓ | ✓ |
| `us.federal.corp.dividends_received_deduction` | Form 1120 (corporate income tax computation) | ✓ | ✓ |
| `us.federal.corp.nol_deduction` | Form 1120 (corporate income tax computation) | ✓ | ✓ |
| `us.federal.corp.taxable_income` | Form 1120 (corporate income tax computation) | ✓ | ✓ |
| `us.federal.corp.capital_loss_carryover_generated` | Form 1120 (corporate income tax computation) | ✓ | ✓ |
| `us.federal.corp.estimated.required_annual_payment` | Form 1120-W / § 6655 corporate estimates | ✓ | ✓ |
| `us.federal.corp.estimated.quarterly_payment` | Form 1120-W / § 6655 corporate estimates | ✓ | ✓ |
| `us.federal.corp.s_corp_entity_taxes` | Form 1120-S (§ 1374 / § 1375 entity-level taxes only) | ✓ | ✓ |
| `us.federal.corp.accumulated_earnings_tax` | Form 1120 Schedule PH / §§ 531, 541 | ✓ | ✓ |
| `us.federal.corp.is_personal_holding_company` | Form 1120 Schedule PH / §§ 531, 541 | ✓ | ✓ |
| `us.federal.corp.phc_tax` | Form 1120 Schedule PH / §§ 531, 541 | ✓ | ✓ |
| `us.federal.corp.annualized_installment_q1` | Form 1120-W / § 6655 corporate estimates | ✓ | ✓ |
| `us.federal.corp.annualized_installment_q2` | Form 1120-W / § 6655 corporate estimates | ✓ | ✓ |
| `us.federal.corp.annualized_installment_q3` | Form 1120-W / § 6655 corporate estimates | ✓ | ✓ |
| `us.federal.corp.annualized_installment_q4` | Form 1120-W / § 6655 corporate estimates | ✓ | ✓ |
| `us.federal.corp.ftc` | Form 1118 (corporate FTC) | ✓ | ✓ |
| `us.federal.corp.beat` | Form 8991 (BEAT) | ✓ | ✓ |
| `us.federal.corp.section250_deduction` | Form 8993 / § 250, § 245A | ✓ | ✓ |
| `us.federal.corp.gbc_allowed` | Form 3800 (general business credit) | ✓ | ✓ |
| `us.federal.corp.income_tax_after_credits` | Form 1120 (corporate income tax computation) | ✓ | ✓ |
| `us.federal.corp.gbc_carryforward` | Form 3800 (general business credit) | ✓ | ✓ |
| `us.federal.corp.section245a_drd` | Form 8993 / § 250, § 245A | ✓ | ✓ |
| `us.federal.corp.charitable_carryover` | Form 1120 (corporate income tax computation) | ✓ | ✓ |
| `us.federal.corp.interest_carryforward` | Form 8990 (§ 163(j)) | ✓ | ✓ |
| `us.federal.fiduciary.income_tax` | Form 1041 (§ 1(e) rate schedule and § 642(b) exemption only) | ✓ | ✓ |

## States

Every composed state is the FULL-YEAR RESIDENT return; part-year and nonresident returns are out of scope in every state. No state business returns.

| state | tier | form | rules | fixtures | TY2025 | TY2026 return composable | 2026 unblocked by |
|---|---|---|---|---|---|---|---|
| AL | deep+composer | Form 40 | 6 | 14 | ✓ | ✓ |  |
| AK | no-income-tax |  | 1 | 0 | ✓ |  |  |
| AZ | calculation-only | rate/parameter rules only — no printed-form line set | 1 | 1 | ✓ | calc ✓ |  |
| AR | deep+composer | Form AR1000F | 9 | 10 | ✓ | no (9 stale rules) | 2026 DFA indexed bracket and threshold sheets and the 2026 AR1000F booklet (dfa.arkansas.gov/incometax, ~November-December 2026); Acts 1-2 of the 2026 1st Ex. Sess. already cut the top rate to 3.7% |
| CA | deep+composer | Form 540 | 7 | 28 | ✓ | no (7 stale rules) | FTB's 2026 indexed amounts (brackets, exemption credits, standard deduction, CalEITC tables) and the 2026 Form 540 booklet (~December 2026) |
| CO | calculation-only | rate/parameter rules only — no printed-form line set | 1 | 1 | ✓ | calc ✓ |  |
| CT | deep+composer | Form CT-1040 | 6 | 15 | ✓ | ✓ |  |
| DE | deep+composer | Form PIT-RES | 9 | 36 | ✓ | ✓ |  |
| FL | no-income-tax |  | 1 | 0 | ✓ |  |  |
| GA | deep+composer | Form 500 | 6 | 13 | ✓ | ✓ | 2026 Form 500 booklet (retirement exclusion, low income credit table, dependent care credit) (~January 2027) |
| HI | deep+composer | Form N-11 | 11 | 12 | ✓ | ✓ | 2026 Form N-11 instructions (the reserve pay exclusion is the E-5 pay-grade amount, re-set each year) |
| ID | deep+composer | Form 40 | 18 | 20 | ✓ | no (6 stale rules) | 2026 Form 40 booklet (EIN00046: indexed brackets and federal standard deduction conformity; the $205 child tax credit sunset after TY2025 under § 63-3029L) (~December 2026) |
| IL | deep+composer | Form IL-1040 | 4 | 3 | ✓ | no (4 stale rules) | 2026 IL-1040 booklet (exemption allowance, use tax table) (~December 2026) |
| IN | calculation-only | rate/parameter rules only — no printed-form line set | 1 | 1 | ✓ | calc ✓ |  |
| IA | calculation-only | rate/parameter rules only — no printed-form line set | 1 | 1 | ✓ | calc ✓ |  |
| KS | deep+composer | Form K-40 | 6 | 10 | ✓ | ✓ |  |
| KY | calculation-only | rate/parameter rules only — no printed-form line set | 1 | 2 | ✓ | calc ✓ |  |
| LA | calculation-only | rate/parameter rules only — no printed-form line set | 1 | 1 | ✓ | calc ✓ |  |
| ME | deep+composer | Form 1040ME | 14 | 21 | ✓ | ✓ | 2026 Form 1040ME booklet (indexed pension deduction; P.L. 2025 c. 650's 2026 dependent credit repeal and PTFC $1,500 cap; STFC tables) (~December 2026) |
| MD | deep+composer | Form 502 | 7 | 17 | ✓ | no (7 stale rules) | 2026 Form 502 booklet and the Comptroller's 2026 local income tax rates (~December 2026) |
| MA | calculation-only | rate/parameter rules only — no printed-form line set | 1 | 2 | ✓ | calc ✓ |  |
| MI | calculation-only | rate/parameter rules only — no printed-form line set | 1 | 1 | ✓ | calc ✓ |  |
| MN | deep+composer | Form M1 | 5 | 14 | ✓ | no (5 stale rules) | 2026 Form M1 booklet and the Department of Revenue's 2026 inflation adjustments (~December 2026) |
| MS | calculation-only | rate/parameter rules only — no printed-form line set | 1 | 2 | ✓ | calc ✓ |  |
| MO | deep+composer | Form MO-1040 | 5 | 9 | ✓ | no (5 stale rules) | 2026 MO-1040 booklet and tax chart (~December 2026) |
| MT | deep+composer | Form 2 | 10 | 33 | ✓ | ✓ | 2026 Form 2 booklet (the CPI-indexed age-65 subtraction and the 529 subtraction cap) (~September 2026; the 2025 booklet already prints the TY2026 and TY2027 rate tables) |
| NE | deep+composer | Form 1040N | 11 | 16 | ✓ | ✓ |  |
| NV | no-income-tax |  | 1 | 0 | ✓ |  |  |
| NH | no-income-tax |  | 1 | 1 | ✓ |  |  |
| NJ | deep+composer | Form NJ-1040 | 7 | 17 | ✓ | no (7 stale rules) | 2026 NJ-1040 booklet (~December 2026) |
| NM | deep+composer | Form PIT-1 | 15 | 15 | ✓ | ✓ | 2026 PIT-RC (LICTR and child income tax credit tables are CPI-indexed) (~December 2026) |
| NY | deep+composer | Form IT-201 | 5 | 11 | ✓ | ✓ | 2026 IT-201 instructions and the 2026 NYC rate schedule / IT-214 (~December 2026) |
| NC | deep+composer | Form D-400 | 5 | 8 | ✓ | ✓ | 2026 Form D-400 booklet use tax table (~January 2027) |
| ND | deep+composer | Form ND-1 | 6 | 27 | ✓ | ✓ | 2026 Form ND-1 booklet's Marriage Penalty Credit Worksheet (the preprinted half-standard-deduction figure, the gates and the maximum are re-set yearly) (~December 2026) |
| OH | deep+composer | Form IT 1040 | 9 | 15 | ✓ | no (7 stale rules) | 2026 Ohio IT 1040 booklet — the indexed personal exemption amount, without which the return cannot be composed, and the Schedule of Credits (~December 2026); HB 96's TY2026 rate changes are already encoded |
| OK | deep+composer | Form 511 | 11 | 22 | ✓ | ✓ | 2026 Form 511 packet use tax table (~December 2026) |
| OR | deep+composer | Form OR-40 | 7 | 16 | ✓ | no (7 stale rules) | 2026 Form OR-40 booklet and the Department of Revenue's 2026 indexed amounts (~December 2026) |
| PA | deep+composer | Form PA-40 | 6 | 9 | ✓ | ✓ | 2026 PA-40 booklet (the child and dependent care enhancement credit) (~December 2026) |
| RI | deep+composer | Form RI-1040 | 10 | 48 | ✓ | ✓ | Division of Taxation ADV 2026-xx (the indexed Social Security and pension modification limits and RI-1040H figures, ~November 2026) and the 2026 RI-1040 booklet |
| SC | deep+composer | Form SC1040 | 7 | 23 | ✓ | ✓ | 2026 SC1040 booklet (~December 2026) |
| SD | no-income-tax |  | 1 | 0 | ✓ |  |  |
| TN | no-income-tax |  | 1 | 0 | ✓ |  |  |
| TX | no-income-tax |  | 1 | 1 | ✓ |  |  |
| UT | calculation-only | rate/parameter rules only — no printed-form line set | 1 | 2 | ✓ | calc ✓ |  |
| VT | deep+composer | Form IN-111 | 17 | 63 | ✓ | no (2 stale rules) | 2026 Form IN-111 booklet — the indexed standard deduction and per-box amount (§ 5811(21)(D)) and the Estimated Use Tax Table (~December 2026); the 2026 rate schedules and $5,400 exemption are already encoded from the 2026 IN-114 instructions and GB-1210-2026 |
| VA | deep+composer | Form 760 | 4 | 4 | ✓ | no (3 stale rules) | 2026 Form 760 booklet and Tax Table (~December 2026) |
| WA | no-income-tax |  | 1 | 2 | ✓ |  |  |
| WV | deep+composer | Form IT-140 | 12 | 14 | ✓ | ✓ | 2026 IT-140 booklet (the Family Tax Credit table follows the 2026 HHS poverty guideline; SCTC-A and HEPTC-1) (~December 2026); SB 392's TY2026 rates are already encoded |
| WI | deep+composer | Form 1 | 6 | 17 | ✓ | no (6 stale rules) | 2026 Form 1 booklet and the Department of Revenue's 2026 indexed brackets and standard deduction table (~December 2026) |
| WY | no-income-tax |  | 1 | 0 | ✓ |  |  |

## Refusal conditions

| code | meaning | exit |
|---|---|---|
| NEEDS_FACTS | a required input is missing; error.data.missing lists each fact id, type and description | 2 |
| NO_APPLICABLE_RULE | no rule version is valid on the asOf date (e.g. a TY2026 state amount the Department has not published) | 3 |
| UNHANDLED_ENUM_CASE | a filing status / classification combination the corpus does not encode | 3 |
| unsupported (rule-level) | the rule exists but declares the situation out of scope (CAMT $1B+ AFSI; retained trust capital gains; kiddie preferential income; 4th simultaneous AOTC student; § 199A interaction with the § 68 haircut) | 3 |
| composer refusal (throw) | a state composer refuses rather than compose on a missing starting point (e.g. ndFederalTaxableIncome, mtFederalDeductions, deSpouseFederalAgi for DE status 4) or an unpublished year (VT line 4 for TY2026) | 1 |
| input validation | unknown keys are rejected (strict schemas); money must be dollars; counts are bounded (max exemptions, boxes) | 1 |

## Disclosed approximations (federal rules whose title says so)

- `us.federal.pension.simplified_method_exclusion` — Simplified Method tax-free portion (§ 72(d): cost ÷ anticipated payments × months, capped at unrecovered cost)
- `us.federal.pension.simplified_method_taxable` — Taxable pension under the Simplified Method (gross payments minus the § 72(d) exclusion)
- `us.federal.capital_loss_carryover` — Capital loss carryover to the following year (simplified)
- `us.federal.gross_income` — Gross income (simplified: wages + interest + capital gains (long/short-term) + qualified/ordinary dividends + SE net profit + K-1 pass-through income − allowed capital loss − § 911 exclusion)
- `us.federal.actc` — Additional child tax credit — refundable (simplified: 3+-child SS-tax alternative not modeled)
- `us.federal.home_office_simplified` — Home office deduction — simplified safe harbor ($5/sq ft, 300 sq ft cap)
- `us.federal.senior_deduction` — Temporary deduction for seniors (OBBBA; simplified: MAGI approximated as AGI)
- `us.federal.overtime_deduction` — Deduction for qualified overtime compensation (OBBBA; simplified: MAGI approximated as AGI)
- `us.federal.car_loan_interest_deduction` — Qualified passenger vehicle loan interest deduction (OBBBA; simplified: MAGI approximated as AGI)
- `us.federal.eitc` — Earned income credit (TY2026; EIC Table method — § 32(f) $50 brackets at midpoints; § 32(d) separated spouses not modeled)
- `us.federal.credit.research_asc` — Research credit — alternative simplified credit (§ 41(c)(4))

## Per-state out-of-scope notes (from each parameters rule)

- **DE**: OUT OF SCOPE: nonresident and part-year returns (Form PIT-NON), the separate tax on lump-sum distributions (Form PIT-STC, § 1102(b)), the itemized-deduction detail on Form PIT-RSA, Delaware S corporation payments (Schedule V), and county or school district levies (Delaware has no local income tax).
- **MT**: OUT OF SCOPE: nonresident, part-year and mixed-residency returns (Schedule II apportionment), the Montana medical savings account Part II adjustment, Schedule IV penalties and interest, the pass-through entity tax credit, and the property tax rebate (House Bill 231 rebated TAX YEAR 2024 property taxes on a separate application at getmyrebate.mt.gov and never touches Form 2 — but the booklet requires counting it in gross household income on Schedule 2EC line 8).
- **VT**: OUT OF SCOPE, named: Schedule IN-113 (part-year and nonresident income adjustment — line 15 is 100% for a full-year resident); the Renter Credit (Form RCC-146, a separate claim computed from household income, family size and county fair market rent, paid outside Form IN-111); the Property Tax Credit (Form HS-122 / HI-144, chapter 154); Schedule IN-119 Part II business credits other than the 24% items (charitable housing, mobile home, research and development, affordable housing, historic rehabilitation, facade, code improvements — transcribed as an input; the VHEIP credit on line 1 is us.vt.vheip_credit); nonresident real estate withholding and Schedule K-1VT payments (inputs); IN-152 underpayment interest (input); bonus depreciation and QSBS modifications (inputs on the generic additions and subtractions). LEGISLATIVE CURRENCY: 2025 Act 71 (S.51, signed June 25, 2025), retroactive to tax years from January 1, 2025 — § 1 child tax credit age five to six; § 2 childless EITC 38% to 100%; § 3 every retirement-exclusion AGI threshold up $5,000 and the military retirement/survivor exclusion at $125,000-$175,000 for every status, electable alongside one other; §§ 4-5 the $250 veteran credit. 2026 Act 164 (H.933, June 18, 2026): § 55 amends § 5811(21)(B) to add subtractions for R&E amortization and decouples from IRC § 168(n) (bonus depreciation on qualified production property) — effective retroactively January 1, 2026 and applying to taxable years from January 1, 2025 under the act's § (8); § 55a requires an addback of the federal qualified small business stock exclusion for taxable years beginning on and after January 1, 2026; §§ 56-57 recast the § 5822(e) apportionment for part-year and nonresident filers; §§ 60-61 link Vermont income tax to federal law as of December 31, 2025, applying to taxable years from January 1, 2025
