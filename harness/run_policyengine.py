#!/usr/bin/env python3
"""Compute every harness scenario with PolicyEngine US (the independent model).

    python3 harness/run_policyengine.py harness/scenarios.json > harness/results-policyengine.json

Comparable total: income_tax + additional_medicare_tax + self_employment_tax
(probed: PE's income_tax includes NIIT and refundable credits, excludes
the 0.9% Additional Medicare Tax and SE tax, which it exposes separately).
"""

import json
import sys

from policyengine_us import Simulation

STATUS = {"single": "SINGLE", "mfj": "JOINT", "hoh": "HEAD_OF_HOUSEHOLD",
          "mfs": "SEPARATE", "qss": "SURVIVING_SPOUSE"}
YEAR = "2025"


def build(s):
    age = 67 if s.get("age65") else 40
    tips = s.get("tips", 0)
    people = {"adult": {
        "age": {YEAR: age},
        # PE semantics (probed): tip_income is ADDITIVE income; fsla premium
        # is a PORTION of employment income. Ours: both are within wages.
        "employment_income": {YEAR: s["wages"] - tips},
        "tip_income": {YEAR: tips},
        "fsla_overtime_premium": {YEAR: s.get("overtime", 0)},
        "self_employment_income": {YEAR: s.get("seProfit", 0)},
        # probed 2026-07-07: QBI-eligible, not SE-taxed, not NII — matches
        # our k1OrdinaryBusinessIncome (material participation assumed)
        "partnership_s_corp_income": {YEAR: s.get("k1", 0)},
        "social_security_retirement": {YEAR: s.get("ss", 0)},
        "taxable_pension_income": {YEAR: s.get("pensions", 0)},
        "unemployment_compensation": {YEAR: s.get("unemployment", 0)},
        "student_loan_interest": {YEAR: s.get("studentLoan", 0)},
        "taxable_interest_income": {YEAR: s.get("interest", 0)},
        "long_term_capital_gains": {YEAR: s.get("gains", 0)},
        # Schedule A (probed 2026-07-07: PE applies the OBBBA SALT cap with
        # the 30% phase-down and $10k floor; medical 7.5% floor; takes
        # deductible mortgage interest as given — no $750k proration)
        "charitable_cash_donations": {YEAR: s.get("charity", 0)},
        "deductible_mortgage_interest": {YEAR: s.get("mortgage", 0)},
    }}
    members = ["adult"]
    if s["status"] == "mfj":
        people["spouse"] = {"age": {YEAR: age}}
        members.append("spouse")
    for i in range(s.get("kids", 0)):
        people[f"child{i}"] = {"age": {YEAR: 10}}
        members.append(f"child{i}")
    marital = members[:2] if s["status"] == "mfj" else members[:1]
    return {
        "people": people,
        "tax_units": {"tu": {"members": members,
                             "filing_status": {YEAR: STATUS[s["status"]]},
                             "state_and_local_sales_or_income_tax": {YEAR: s.get("salt", 0)},
                             "itemized_medical_expenses": {YEAR: s.get("medical", 0)}}},
        "families": {"f": {"members": members}},
        "spm_units": {"sp": {"members": members}},
        "households": {"h": {"members": members, "state_name": {YEAR: "TX"}}},
        "marital_units": {"m": {"members": marital}},
    }


def main():
    with open(sys.argv[1]) as f:
        scenarios = json.load(f)
    out = {}
    for i, s in enumerate(scenarios):
        try:
            sim = Simulation(situation=build(s))
            total = float(sim.calculate("income_tax", 2025)[0]) \
                + float(sim.calculate("additional_medicare_tax", 2025)[0]) \
                + float(sim.calculate("self_employment_tax", 2025)[0])
            out[s["id"]] = round(total * 100)  # cents
        except Exception as e:  # noqa: BLE001 — record, don't die
            out[s["id"]] = "ERROR:%s" % type(e).__name__
        if (i + 1) % 50 == 0:
            print("  %d/%d" % (i + 1, len(scenarios)), file=sys.stderr)
    json.dump({"engine": "policyengine-us", "results": out}, sys.stdout, indent=1)
    print()


if __name__ == "__main__":
    main()
