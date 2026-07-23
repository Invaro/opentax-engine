/**
 * Business-entity classification and entity-level federal income tax —
 * verified July 2026.
 *
 * "LLC tax" is not a federal tax type: an LLC is a STATE-LAW entity that
 * federal law taxes by CLASSIFICATION (Treas. Reg. § 301.7701-3, the
 * check-the-box rules):
 *   single member, no election  → disregarded entity (the owner's return —
 *                                 the individual chain of this corpus)
 *   2+ members, no election     → partnership (§ 701: no entity-level tax)
 *   Form 8832 election          → association taxed as a C corporation
 *   timely Form 2553 S election → deemed association + S status
 *                                 (Reg. § 301.7701-3(c)(1)(v)(C))
 *
 * C corporations: § 11(b) — a FLAT 21 percent of taxable income (TCJA,
 * permanent; confirmed unchanged by Pub. L. 119-21). The 15% corporate
 * alternative minimum tax (§§ 55–56A, Inflation Reduction Act; NOT
 * repealed by the OBBBA — interim guidance most recently Notice 2026-7)
 * applies to corporations with 3-year-average adjusted financial
 * statement income over $1 billion: above that this module REFUSES.
 *
 * S corporations: § 1363(a) — generally no entity-level tax; § 1361(b)
 * eligibility (≤100 shareholders with § 1361(c)(1) family aggregation,
 * no ineligible/nonresident-alien shareholders, one class of stock). An
 * ineffective S election refuses (§ 1362(f) inadvertent-election relief
 * is not modeled) rather than silently reclassifying.
 */

import type { Expr, Rule } from "@invaro/opentax-core";

const J = "us.federal";
const FROM = { effectiveFrom: "2025-01-01" }; // statutory, unindexed: open-ended

const fact = (factId: string): Expr => ({ kind: "fact", factId });
const money = (cents: string): Expr => ({ kind: "money", cents });
const ruleRef = (ruleId: string): Expr => ({ kind: "rule", ruleId });
const enumLit = (value: string): Expr => ({ kind: "enum", value });
const zero = money("0");

// § 1361(b)(1) small-business-corporation eligibility
const S_ELIGIBLE: Expr = {
  kind: "and",
  args: [
    {
      kind: "cmp",
      op: "le",
      left: fact("sCorpShareholderCount"),
      right: { kind: "int", value: "100" },
    },
    { kind: "not", arg: fact("sCorpHasIneligibleShareholder") },
    { kind: "not", arg: fact("sCorpHasMultipleStockClasses") },
  ],
};

const INEFFECTIVE_S: Expr = {
  kind: "unsupported",
  reason:
    "the S election appears ineffective — § 1361(b) eligibility failed (over 100 shareholders, an ineligible shareholder, or a second class of stock); § 1362(f) inadvertent-election relief is not modeled",
};

export const corporateRules: Rule[] = [
  {
    id: "us.federal.corp.entity_classification",
    version: 1,
    jurisdiction: J,
    title: "Federal tax classification of the business entity (check-the-box)",
    citation: {
      source:
        "Treas. Reg. § 301.7701-3; 26 U.S.C. §§ 1361(b), 1362; Forms 8832 & 2553",
      section: "Reg. § 301.7701-3(a), (b)(1), (c)(1)(v)(C)",
      url: "https://www.law.cornell.edu/cfr/text/26/301.7701-3",
      excerpt:
        "A domestic eligible entity that does not elect otherwise is classified as a partnership 'if it has two or more members' or 'disregarded as an entity separate from its owner' if it has a single owner; an eligible entity may elect association (corporate) classification on Form 8832; and 'an eligible entity that timely elects to be an S corporation under section 1362(a)(1) is treated as having made an election… to be classified as an association.' A state-law corporation is a per-se corporation (Reg. § 301.7701-2(b)(1)). S status requires § 1361(b): no more than 100 shareholders (family aggregation per § 1361(c)(1)), no ineligible or nonresident-alien shareholders, one class of stock. [An ineffective S election REFUSES — § 1362(f) relief not modeled.]",
    },
    ...FROM,
    output: { type: "enum" },
    formula: {
      kind: "match",
      on: fact("entityLegalForm"),
      cases: [
        {
          when: "corporation",
          value: {
            kind: "if",
            cond: fact("filedForm2553SElection"),
            then: {
              kind: "if",
              cond: S_ELIGIBLE,
              then: enumLit("s-corporation"),
              else: INEFFECTIVE_S,
            },
            else: enumLit("c-corporation"),
          },
        },
        {
          when: "llc",
          value: {
            kind: "if",
            cond: fact("filedForm2553SElection"),
            then: {
              kind: "if",
              cond: S_ELIGIBLE,
              then: enumLit("s-corporation"),
              else: INEFFECTIVE_S,
            },
            else: {
              kind: "if",
              cond: fact("filedForm8832CorpElection"),
              then: enumLit("c-corporation"),
              else: {
                kind: "if",
                cond: {
                  kind: "cmp",
                  op: "ge",
                  left: fact("llcMemberCount"),
                  right: { kind: "int", value: "2" },
                },
                then: enumLit("partnership"),
                else: enumLit("disregarded-entity"),
              },
            },
          },
        },
      ],
    },
  },
  {
    id: "us.federal.corp.income_tax",
    version: 4, // v3's excerpt predated the 1120 machinery; v4 also guards the line-30 × § 250 double-count
    jurisdiction: J,
    title: "C corporation income tax — flat 21% of taxable income less the § 250 deduction (§ 11)",
    citation: {
      source: "26 U.S.C. § 11(b); § 250; §§ 55–56A (CAMT, guarded)",
      section: "§ 11(a)–(b)",
      url: "https://www.law.cornell.edu/uscode/text/26/11",
      excerpt:
        "A tax is hereby imposed for each taxable year on the taxable income of every corporation… The amount of the tax imposed by subsection (a) shall be 21 percent of taxable income. [Flat since the TCJA; confirmed unchanged by Pub. L. 119-21 (2025). Taxable income is the corpTaxableIncome input if given — which must be PRE-§ 250 (the § 250 deduction is computed and subtracted HERE from corpFDDEI/corpNCTI; an as-filed line 30 already nets it out and must not be combined with those facts) — or computed by the modeled 1120 machinery (charitable limit, DRD/§ 245A, NOL, § 168(k)/§ 179/§ 174A/§ 163(j)). REFUSES for corporations whose 3-year-average adjusted financial statement income exceeds $1,000,000,000 — the §§ 55–56A corporate alternative minimum tax (NOT repealed by the OBBBA; interim guidance through Notice 2026-7) is not modeled. The § 531 accumulated-earnings, § 541 PHC, and § 6655 estimated taxes are modeled as their own targets.]",
    },
    ...FROM,
    output: { type: "money" },
    parameters: {
      camtThreshold: { value: "100000000000", type: "money" }, // $1,000,000,000
    },
    formula: {
      kind: "if",
      cond: {
        kind: "cmp",
        op: "gt",
        left: fact("corpAvgAdjustedFinancialStatementIncome"),
        right: { kind: "param", name: "camtThreshold" },
      },
      then: {
        kind: "unsupported",
        reason:
          "3-year-average adjusted financial statement income exceeds $1 billion — the §§ 55–56A corporate alternative minimum tax applies and is not modeled",
      },
      else: {
        kind: "mulRate",
        base: {
          kind: "max0",
          arg: {
            kind: "sub",
            left: ruleRef("us.federal.corp.taxable_income"),
            right: ruleRef("us.federal.corp.section250_deduction"),
          },
        },
        rate: { num: "21", den: "100" },
        round: "half-up",
      },
    },
  },
  {
    id: "us.federal.corp.stock_buyback_excise",
    version: 1,
    jurisdiction: J,
    title: "Stock repurchase excise tax — 1% of net repurchases (§ 4501)",
    citation: {
      source: "26 U.S.C. § 4501 (added by Pub. L. 117-169; effective repurchases after 2022)",
      section: "§ 4501(a), (c)(3), (e)(3)",
      url: "https://www.law.cornell.edu/uscode/text/26/4501",
      excerpt:
        "There is hereby imposed on each covered corporation a tax equal to 1 percent of the fair market value of any stock of the corporation which is repurchased by such corporation during the taxable year. The amount taken into account… shall be reduced by the fair market value of any stock issued by the covered corporation during the taxable year (§ 4501(c)(3), the netting rule); no tax applies where the total value of the stock repurchased during the taxable year does not exceed $1,000,000 (§ 4501(e)(3), tested against GROSS repurchases). [A chapter-37 excise reported on Forms 720/7208 — not part of the § 11 income tax and not deductible; the § 4501(c)(2) affiliate rules, (d) foreign-corporation rules, and the (e)(1)–(2), (4)–(6) exceptions (reorganizations, ESOP contributions, RIC/REIT, dealers, § 302-dividend treatment) are attested by the repurchase input.]",
    },
    ...FROM,
    output: { type: "money" },
    parameters: {
      deMinimis: { value: "100000000", type: "money" }, // $1,000,000
    },
    formula: {
      kind: "if",
      cond: {
        kind: "and",
        args: [
          fact("corpIsCoveredCorporation"),
          {
            kind: "cmp",
            op: "gt",
            left: fact("corpStockRepurchasedFMV"),
            right: { kind: "param", name: "deMinimis" },
          },
        ],
      },
      then: {
        kind: "mulRate",
        base: {
          kind: "max0",
          arg: {
            kind: "sub",
            left: fact("corpStockRepurchasedFMV"),
            right: fact("corpStockIssuedFMV"),
          },
        },
        rate: { num: "1", den: "100" },
        round: "half-up",
      },
      else: zero,
    },
  },
  {
    id: "us.federal.corp.entity_level_income_tax",
    version: 3, // v2 predated § 59A BEAT in the C-corporation branch
    jurisdiction: J,
    title:
      "Entity-level federal income tax by classification (pass-throughs: $0, taxed on the owners' returns)",
    citation: {
      source: "26 U.S.C. § 11; § 701; § 1363(a); Treas. Reg. § 301.7701-3",
      section: "§ 701; § 1363(a); § 11",
      url: "https://www.law.cornell.edu/uscode/text/26/701",
      excerpt:
        "A partnership as such shall not be subject to the income tax imposed by this chapter — persons carrying on business as partners are liable in their separate capacities (§ 701); an S corporation is generally not subject to chapter-1 taxes (§ 1363(a)) EXCEPT the § 1374 built-in-gains and § 1375 excess-net-passive-income entity taxes, which are computed here; a disregarded entity's activity is reported on its owner's return (this corpus's individual chain — e.g. selfEmploymentNetProfit or k1OrdinaryBusinessIncome); a C corporation pays the flat 21% under § 11.",
    },
    ...FROM,
    output: { type: "money" },
    formula: {
      kind: "match",
      on: ruleRef("us.federal.corp.entity_classification"),
      cases: [
        { when: "disregarded-entity", value: zero },
        { when: "partnership", value: zero },
        { when: "s-corporation", value: ruleRef("us.federal.corp.s_corp_entity_taxes") },
        {
          when: "c-corporation",
          value: {
            kind: "add",
            args: [
              ruleRef("us.federal.corp.income_tax"),
              ruleRef("us.federal.corp.beat"), // § 59A: "in addition to" (zero unless attested applicable)
            ],
          },
        },
      ],
    },
  },
];
