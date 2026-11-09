/**
 * Form 4562 — Depreciation and Amortization (individuals, calendar tax years
 * 2025–2027): § 179 expensing (Part I), the § 168(k) special depreciation
 * allowance (Part II), MACRS (Part III), and listed property / § 280F
 * passenger automobile limits (Part V). Composed from:
 *
 *   26 U.S.C. §§ 168, 179, 280F as amended by Pub. L. 119-21 (OBBBA §§ 70301,
 *   70306); Treas. Reg. §§ 1.168(b)-1, 1.168(d)-1, 1.168(k)-2, 1.179-1 to -3;
 *   Notice 2026-11; Rev. Proc. 2025-32 / 2026-35 (§ 179 amounts); Rev. Proc.
 *   2025-16 / 2026-15 (§ 280F caps); Publication 946 (2025) Appendix A tables
 *   (macrs-tables.ts) and Appendix B asset classes; the 2025 Instructions for
 *   Form 4562.
 *
 * Order (Reg. § 1.168(k)-2(e); i4562 line 14): cost × business use, less the
 * § 179 expense ELECTED (basis drops by the elected amount even when part of
 * it carries over — Reg. §§ 1.179-1(f)(1), 1.179-3(f)), is the unadjusted
 * depreciable basis; the special allowance is that × the applicable
 * percentage; the rest is MACRS basis, depreciated with the printed Pub 946
 * table percentages (the tables filed returns use; Pub 946 notes figuring
 * without them "will generally result in a slightly different amount").
 *
 * Refuses, with the reason, rather than guess: short or fiscal tax years,
 * general asset accounts, § 168(n) qualified production property, computer
 * software and other non-MACRS property, property acquired before
 * September 28, 2017 with a special allowance, longer-production-period
 * property acquired before January 20, 2025 and placed in service in 2027,
 * a disposition in an asset's last (stub) recovery year, passenger
 * automobiles placed in service before 2025 or in 2027 (no published caps
 * on file) or with a 100% special allowance (the Rev. Proc. 2019-13 safe
 * harbor), § 280F(b) recapture, and elections of § 179 above the dollar
 * limit (the form needs the taxpayer's own allocation).
 */

import { MACRS_TABLES } from "./macrs-tables.js";
import type { Cents } from "./money.js";

export type RecoveryClass = "3" | "5" | "7" | "10" | "15" | "20" | "25" | "27.5" | "39" | "qip";
export type DepreciationMethod = "default" | "150DB" | "SL" | "ADS";

export type DepreciationAsset = {
  id: string;
  description?: string;
  /** the business this asset belongs to (Schedule C, Schedule E property, …) — totals are reported per activity */
  activity?: string;
  /** cost or other basis, excluding land */
  cost: Cents;
  placedInService: string;
  /** date acquired (the binding written contract date — OBBBA § 70301(c)(4)); needed for any special allowance */
  acquiredOn?: string;
  /** GDS recovery class, or give assetClass */
  recoveryClass?: RecoveryClass;
  /** Rev. Proc. 87-56 asset class (Pub 946 Table B-1/B-2), e.g. "57.0" — sets the GDS and ADS periods */
  assetClass?: string;
  /** percent used in the trade or business (or for the production of income), 0–100; default 100 */
  businessUsePercent?: number;
  /** § 179 expense elected for this asset (current-year assets) */
  section179?: Cents;
  /**
   * § 179 property must be § 1245 property (§ 179(d)(1)(B)(i)). 15- and 20-year property can be either
   * (land improvements and buildings are § 1250), and asset class 57.1 mixes both — for those, say which
   * when § 179 is in play. Land improvements (00.3) are never § 1245.
   */
  section1245Property?: boolean;
  /** a 39-year improvement that is § 179(e) qualified real property (roof, HVAC, fire protection, security) */
  section179QualifiedRealProperty?: boolean;
  /** depreciation system / method election (§ 168(b)(5), (g)(7)) */
  method?: DepreciationMethod;
  /** ADS recovery period when method is ADS and there's no assetClass */
  adsRecoveryPeriod?: number;
  /** listed property (§ 280F(d)(4)) */
  listed?: boolean;
  /** a § 280F(d)(5) passenger automobile (6,000 lb or less) — the dollar caps apply */
  passengerAutomobile?: boolean;
  /** a § 179(b)(5) sport utility vehicle (over 6,000 lb, not over 14,000 lb) — the § 179 SUV cap applies */
  sportUtilityVehicle?: boolean;
  /** § 168(k)(2)(B)/(C) longer-production-period property or certain aircraft */
  longProductionPeriod?: boolean;
  // assets placed in service BEFORE the tax year
  /** the convention used in the year placed in service (personal property) */
  convention?: "HY" | "MQ";
  /** § 179 deducted or elected in an earlier year (0 if none) */
  section179Taken?: Cents;
  /** special depreciation allowance taken in the year placed in service (0 if none) */
  specialAllowanceTaken?: Cents;
  /** sold, exchanged, abandoned or otherwise disposed of during the tax year */
  disposedOn?: string;
};

export type Form4562Input = {
  taxYear: number;
  filingStatus: "single" | "mfj" | "mfs" | "hoh" | "qss";
  assets: DepreciationAsset[];
  /**
   * § 179 expense allocated to you on Schedules K-1 (partnerships, S corporations): it joins the elected
   * cost (line 6) and the business income limitation, but not the line 2 cost or the threshold
   * (Pub 946 ch. 2, the Dean example; Reg. § 1.179-2(b)(3))
   */
  section179FromK1?: Cents;
  /** line 10: carryover of disallowed § 179 deduction from last year's line 13 */
  section179Carryover?: Cents;
  /**
   * line 11: taxable income from the active conduct of any trade or business,
   * computed without § 179, the § 164(f) half of SE tax and any NOL — including
   * wages (i4562 line 11; Reg. § 1.179-2(c)). Joint return: both spouses.
   */
  section179BusinessIncome?: Cents;
  /** MFS: cost of § 179 property your spouse placed in service (line 2 counts it) */
  spouseSection179Cost?: Cents;
  /** MFS: your elected share of the dollar limit, percent (§ 179(b)(4)); default 50 */
  mfsAllocationPercent?: number;
  /** § 168(k)(7): recovery classes elected OUT of the special allowance */
  electOutOfSpecialAllowance?: RecoveryClass[];
  /** § 168(k)(10): TY2025 only — 40% (60% long-production) instead of 100% for all post-January 19, 2025 property */
  elect40PercentFor2025?: boolean;
};

export type Form4562AssetResult = {
  id: string;
  activity: string;
  recoveryClass: RecoveryClass;
  system: "GDS" | "ADS";
  method: string;
  convention: "HY" | "MQ" | "MM";
  table: string;
  recoveryYear: number;
  rate: string;
  businessBasis: Cents;
  section179Elected: Cents;
  section179Deducted: Cents;
  specialAllowance: Cents;
  specialAllowanceRate: number;
  macrsBasis: Cents;
  depreciation: Cents;
  line: string;
  notes: string[];
};

export type Form4562Result = {
  taxYear: number;
  lines: Record<string, string>;
  line19: Record<string, string>;
  line20: Record<string, string>;
  assets: Form4562AssetResult[];
  /** depreciation and § 179 by activity (Schedule C line 13, Schedule E line 18, …), whole dollars */
  byActivity: Record<string, string>;
  totalCents: string;
  section179CarryoverToNextYear: string;
  notes: string[];
};

export class Form4562Refusal extends Error {
  constructor(message: string) {
    super(message);
    this.name = "Form4562Refusal";
  }
}

/** An input the form needs is missing (NEEDS_FACTS, exit 2): ids like "assets[truck].acquiredOn". */
export class Form4562MissingInput extends Error {
  constructor(public missing: { id: string; description: string }[]) {
    super(`Form 4562 needs: ${missing.map((m) => m.id).join(", ")}`);
    this.name = "Form4562MissingInput";
  }
  /** the NEEDS_FACTS envelope the CLI and the MCP tool return */
  toJSON() {
    return {
      code: "NEEDS_FACTS",
      message: this.message,
      data: {
        missing: this.missing.map((m) => ({
          factId: m.id,
          type: m.id.endsWith(".acquiredOn") ? "date" : m.id.endsWith(".convention") ? "enum" : m.id.endsWith(".section1245Property") ? "bool" : "money",
          ...(m.id.endsWith(".convention") ? { enumValues: ["HY", "MQ"] } : {}),
          description: m.description,
        })),
      },
    };
  }
}

// ---------------------------------------------------------------------------
// statutory amounts

/** § 179(b)(1), (2), (5)(A): 2025 statute (OBBBA § 70306); 2026 Rev. Proc. 2025-32 § 4.24; 2027 Rev. Proc. 2026-35 § 3.26 */
const SECTION_179: Record<number, { limit: Cents; threshold: Cents; suv: Cents; source: string }> = {
  2025: { limit: 250_000_000n, threshold: 400_000_000n, suv: 3_130_000n, source: "§ 179(b) as amended by OBBBA § 70306; Rev. Proc. 2025-32 § 3.02; SUV: Rev. Proc. 2024-40 § 2.25" },
  2026: { limit: 256_000_000n, threshold: 409_000_000n, suv: 3_200_000n, source: "Rev. Proc. 2025-32 § 4.24" },
  2027: { limit: 264_000_000n, threshold: 423_000_000n, suv: 3_310_000n, source: "Rev. Proc. 2026-35 § 3.26" },
};

/**
 * § 280F(a) caps by year placed in service: year 1 with and without § 168(k), year 2, year 3, each later
 * year. 2025 and 2026: Rev. Proc. 2025-16 / 2026-15. Earlier placements are only ever in year 2 or later
 * for a 2025–2027 return: the 2025 Instructions for Form 4562, Table 2 (and Rev. Proc. 2024-13 for a
 * 2024 automobile's fourth and later years).
 */
const AUTO_CAPS: Record<number, { y1Bonus?: Cents; y1?: Cents; y2?: Cents; y3?: Cents; later: Cents; source: string }> = {
  2020: { y3: 970_000n, later: 576_000n, source: "2025 Instructions for Form 4562, Table 2" },
  2021: { y3: 980_000n, later: 586_000n, source: "2025 Instructions for Form 4562, Table 2" },
  2022: { y3: 1_080_000n, later: 646_000n, source: "2025 Instructions for Form 4562, Table 2" },
  2023: { y3: 1_170_000n, later: 696_000n, source: "2025 Instructions for Form 4562, Table 2" },
  2024: { y2: 1_980_000n, y3: 1_190_000n, later: 716_000n, source: "2025 Instructions for Form 4562, Table 2; Rev. Proc. 2024-13, Tables 1 and 2" },
  2025: { y1Bonus: 2_020_000n, y1: 1_220_000n, y2: 1_960_000n, y3: 1_180_000n, later: 706_000n, source: "Rev. Proc. 2025-16, Tables 1 and 2" },
  2026: { y1Bonus: 2_030_000n, y1: 1_230_000n, y2: 1_980_000n, y3: 1_190_000n, later: 716_000n, source: "Rev. Proc. 2026-15, Tables 1 and 2" },
};

const GDS_PERIOD: Record<RecoveryClass, number> = { "3": 3, "5": 5, "7": 7, "10": 10, "15": 15, "20": 20, "25": 25, "27.5": 27.5, "39": 39, qip: 15 };
/** ADS periods where the class itself fixes one (§ 168(g)(2)(C), (g)(3)(B)) */
const ADS_FIXED: Partial<Record<RecoveryClass, number>> = { "27.5": 30, "39": 40, qip: 20 };

/** Pub 946 Appendix B (Rev. Proc. 87-56): asset class → class, ADS period */
export const ASSET_CLASSES: Record<string, { gds: RecoveryClass; ads: number; description: string }> = {
  "00.11": { gds: "7", ads: 10, description: "Office furniture, fixtures, and equipment" },
  "00.12": { gds: "5", ads: 5, description: "Information systems (computers and peripherals)" },
  "00.13": { gds: "5", ads: 6, description: "Data handling equipment, except computers" },
  "00.22": { gds: "5", ads: 5, description: "Automobiles, taxis" },
  "00.241": { gds: "5", ads: 5, description: "Light general purpose trucks" },
  "00.242": { gds: "5", ads: 6, description: "Heavy general purpose trucks" },
  "00.3": { gds: "15", ads: 20, description: "Land improvements" },
  "57.0": { gds: "5", ads: 9, description: "Distributive trades and services" },
  "57.1": { gds: "15", ads: 20, description: "Distributive trades and services — billboard, service station buildings, petroleum marketing land improvements" },
  "79.0": { gds: "7", ads: 10, description: "Recreation" },
  "80.0": { gds: "7", ads: 12.5, description: "Theme and amusement parks" },
  "no-class-life": { gds: "7", ads: 12, description: "Personal property with no class life (Table B-2)" },
};

/** asset class 00.3 is land improvements — never § 179 property (Pub 946 ch. 2: "Land and land improvements do not qualify as section 179 property") */
const NOT_SECTION_179_CLASSES = new Set(["00.3"]);
/** asset classes that mix § 1245 and § 1250 property (Pub 946 Table B-1, 57.1: "whether section 1245 or 1250 property") */
const MIXED_1245_CLASSES = new Set(["57.1"]);

// ---------------------------------------------------------------------------
// helpers

const dayNum = (iso: string, label: string): number => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) throw new Form4562Refusal(`${label}: expected YYYY-MM-DD, got "${iso}"`);
  const t = Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
  if (new Date(t).toISOString().slice(0, 10) !== iso) throw new Form4562Refusal(`${label}: "${iso}" is not a date`);
  return t / 86_400_000;
};
const yearOf = (iso: string) => Number(iso.slice(0, 4));
const monthOf = (iso: string) => Number(iso.slice(5, 7));
const quarterOf = (iso: string) => Math.floor((monthOf(iso) - 1) / 3) + 1;
/** a printed percent string × cents, half-up to the cent */
const pct = (basis: Cents, printed: string): Cents => {
  const [w, f = ""] = printed.split(".");
  const den = 100n * 10n ** BigInt(f.length);
  const num = BigInt(w + f);
  return (basis * num * 2n + den) / (2n * den);
};
const mulRatio = (c: Cents, num: bigint, den: bigint): Cents => (c * num * 2n + den) / (2n * den);
const rd = (c: Cents): Cents => ((c + 50n) / 100n) * 100n;
const fmt = (c: Cents): string => {
  const neg = c < 0n;
  const a = neg ? -c : c;
  return `${neg ? "-" : ""}$${(a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
};
const D = (c: Cents) => fmt(rd(c));
const minC = (a: Cents, b: Cents) => (a < b ? a : b);
const max0 = (a: Cents) => (a > 0n ? a : 0n);

const REAL: RecoveryClass[] = ["27.5", "39"];
const BONUS_CLASSES: RecoveryClass[] = ["3", "5", "7", "10", "15", "20", "25", "qip"];
const SECTION_179_CLASSES: RecoveryClass[] = ["3", "5", "7", "10", "15", "20", "25", "qip"];

/** the printed table column for an asset */
function tableFor(
  cls: RecoveryClass,
  system: "GDS" | "ADS",
  method: DepreciationMethod,
  convention: "HY" | "MQ" | "MM",
  quarter: number,
  month: number,
  adsPeriod: number | undefined,
): { table: string; column: string; methodLabel: string } {
  if (cls === "27.5") return system === "ADS" ? { table: "A-13", column: String(month), methodLabel: "SL 30-yr ADS" } : { table: "A-6", column: String(month), methodLabel: "SL 27.5-yr" };
  if (cls === "39") return system === "ADS" ? { table: "A-13a", column: String(month), methodLabel: "SL 40-yr ADS" } : { table: "A-7a", column: String(month), methodLabel: "SL 39-yr" };
  const slTable = convention === "HY" ? "A-8" : `A-${8 + quarter}`;
  if (system === "ADS") return { table: slTable, column: String(adsPeriod), methodLabel: `SL ${adsPeriod}-yr ADS` };
  const period = String(GDS_PERIOD[cls]);
  if (cls === "25" || cls === "qip" || method === "SL") return { table: slTable, column: period, methodLabel: `SL ${period}-yr` };
  if (method === "150DB" && (cls === "3" || cls === "5" || cls === "7" || cls === "10"))
    return { table: convention === "HY" ? "A-14" : `A-${14 + quarter}`, column: period, methodLabel: `150DB ${period}-yr` };
  // GDS default: 200DB for 3–10, 150DB for 15 and 20 (§ 168(b)(1), (2)); A-1..A-5 hold both
  return { table: convention === "HY" ? "A-1" : `A-${1 + quarter}`, column: period, methodLabel: `${cls === "15" || cls === "20" ? "150DB" : "200DB"} ${period}-yr` };
}

// ---------------------------------------------------------------------------

export function composeForm4562(input: Form4562Input): Form4562Result {
  const { taxYear: year } = input;
  const law179 = SECTION_179[year];
  if (!law179) throw new Form4562Refusal(`Form 4562 is composed for tax years 2025, 2026 and 2027, not ${year}`);
  const notes: string[] = [];
  const elect40 = input.elect40PercentFor2025 === true;
  if (elect40 && year !== 2025)
    throw new Form4562Refusal("elect40PercentFor2025: § 168(k)(10) applies only to the first taxable year ending after January 19, 2025 — TY2025 for a calendar-year taxpayer");
  for (const c of input.electOutOfSpecialAllowance ?? [])
    if (c === "qip")
      throw new Form4562Refusal('electOutOfSpecialAllowance: qualified improvement property is 15-year property (§ 168(e)(3)(E)(vii)) — elect out of class "15" (Reg. § 1.168(k)-2(f)(1)(ii)(A))');
  const electedOut = new Set(input.electOutOfSpecialAllowance ?? []);
  const missing: { id: string; description: string }[] = [];
  const ids = new Set<string>();

  type Work = {
    a: DepreciationAsset;
    cls: RecoveryClass;
    adsPeriod?: number;
    system: "GDS" | "ADS";
    method: DepreciationMethod;
    use: number;
    current: boolean;
    disposedThisYear: boolean;
    businessBasis: Cents;
    s179: Cents;
    notes: string[];
  };
  const work: Work[] = input.assets.map((given) => {
    let a = given;
    const where = `asset "${a.id}"`;
    if (!a.id) throw new Form4562Refusal("every asset needs an id");
    if (ids.has(a.id)) throw new Form4562Refusal(`duplicate asset id "${a.id}"`);
    ids.add(a.id);
    if (a.cost < 0n) throw new Form4562Refusal(`${where}: cost can't be negative`);
    dayNum(a.placedInService, `${where}.placedInService`);
    if (yearOf(a.placedInService) > year) throw new Form4562Refusal(`${where}: placed in service after ${year}`);
    let cls = a.recoveryClass;
    let adsPeriod = a.adsRecoveryPeriod;
    if (a.assetClass !== undefined) {
      const ac = ASSET_CLASSES[a.assetClass];
      if (!ac) throw new Form4562Refusal(`${where}: asset class "${a.assetClass}" isn't in the table this engine carries (${Object.keys(ASSET_CLASSES).join(", ")}) — give recoveryClass and adsRecoveryPeriod instead`);
      if (cls !== undefined && cls !== ac.gds) throw new Form4562Refusal(`${where}: recoveryClass ${cls} conflicts with asset class ${a.assetClass} (${ac.gds}-year)`);
      cls = ac.gds;
      adsPeriod ??= ac.ads;
    }
    if (cls === undefined) throw new Form4562Refusal(`${where}: give recoveryClass (3, 5, 7, 10, 15, 20, 25, 27.5, 39 or qip) or assetClass`);
    if (!(cls in GDS_PERIOD)) throw new Form4562Refusal(`${where}: unknown recoveryClass "${cls}"`);
    if (ADS_FIXED[cls] !== undefined) adsPeriod = ADS_FIXED[cls];
    if (a.passengerAutomobile || a.sportUtilityVehicle) {
      if (a.listed === false) throw new Form4562Refusal(`${where}: a vehicle is listed property (§ 280F(d)(4)(A)(i)–(ii))`);
      a = { ...a, listed: true };
      // § 168(g)(3)(D): automobiles and light general purpose trucks have a 5-year ADS period
      if (cls === "5") adsPeriod ??= 5;
    }
    const use = a.businessUsePercent ?? 100;
    if (!(use >= 0 && use <= 100)) throw new Form4562Refusal(`${where}: businessUsePercent must be 0–100`);
    const current = yearOf(a.placedInService) === year;
    if (a.disposedOn !== undefined) {
      dayNum(a.disposedOn, `${where}.disposedOn`);
      if (yearOf(a.disposedOn) !== year) throw new Form4562Refusal(`${where}: disposedOn must fall in ${year}`);
      if (a.disposedOn < a.placedInService) throw new Form4562Refusal(`${where}: disposed before it was placed in service`);
    }
    let method: DepreciationMethod = a.method ?? "default";
    const autoAds = a.listed === true && use <= 50 && current && method !== "ADS";
    if (cls === "39" && a.placedInService < "1993-05-13") throw new Form4562Refusal(`${where}: nonresidential real property placed in service before May 13, 1993 is 31.5-year property (Table A-7) — not modeled`);
    // § 280F(b)(1): listed property not predominantly (> 50%) used in qualified business use → ADS
    if (autoAds) method = "ADS";
    if (a.listed && use <= 50) {
      if (method !== "ADS")
        throw new Form4562Refusal(
          `${where}: listed property used ${use}% for business must be depreciated under ADS (§ 280F(b)(1)) — set method "ADS"; if it was used over 50% in an earlier year, the § 280F(b)(2) excess depreciation recapture applies, which is not modeled`,
        );
    }
    const system: "GDS" | "ADS" = method === "ADS" ? "ADS" : "GDS";
    if (system === "ADS" && adsPeriod === undefined)
      throw new Form4562Refusal(`${where}: ADS needs the class life — give assetClass or adsRecoveryPeriod`);
    if (system === "ADS" && !REAL.includes(cls) && MACRS_TABLES["A-8"][String(adsPeriod)] === undefined)
      throw new Form4562Refusal(`${where}: no printed straight-line table column for a ${adsPeriod}-year ADS period`);
    if (method === "150DB" && !["3", "5", "7", "10", "15", "20"].includes(cls)) throw new Form4562Refusal(`${where}: the 150% election applies to 3- to 20-year property`);
    if (method === "150DB" && (cls === "15" || cls === "20")) method = "default"; // 150DB is already their GDS method
    const businessBasis = mulRatio(a.cost, BigInt(Math.round(use * 10_000)), 1_000_000n);
    const s179 = a.section179 ?? 0n;
    const notes: string[] = [];
    if (autoAds) notes.push(`listed property used ${use}% for business: ADS straight line, no special allowance or § 179 (§ 280F(b)(1))`);
    if (s179 < 0n) throw new Form4562Refusal(`${where}: section179 can't be negative`);
    if (s179 > 0n) {
      if (!current) throw new Form4562Refusal(`${where}: § 179 is elected in the year placed in service — for an earlier year's asset use section179Taken`);
      if (!SECTION_179_CLASSES.includes(cls) && !(cls === "39" && a.section179QualifiedRealProperty))
        throw new Form4562Refusal(
          `${where}: ${cls === "27.5" ? "residential rental property is not § 179 property (§ 179(d)(1); § 50(b)(2))" : "a building is § 179 property only as § 179(e) qualified real property — set section179QualifiedRealProperty for a roof, HVAC, fire protection or security system improvement"}`,
        );
      if (use <= 50) throw new Form4562Refusal(`${where}: § 179 property must be used more than 50% in the trade or business`);
      if ((a.assetClass !== undefined && NOT_SECTION_179_CLASSES.has(a.assetClass)) || a.section1245Property === false)
        throw new Form4562Refusal(`${where}: land improvements and buildings are not § 179 property (§ 179(d)(1)(B); Pub 946 ch. 2 — "Land and land improvements do not qualify as section 179 property")`);
      if (s179 > businessBasis) throw new Form4562Refusal(`${where}: § 179 elected (${fmt(s179)}) exceeds the business cost (${fmt(businessBasis)})`);
      if (a.sportUtilityVehicle && s179 > law179.suv)
        throw new Form4562Refusal(`${where}: a sport utility vehicle's § 179 cost is capped at ${fmt(law179.suv)} for ${year} (§ 179(b)(5)(A); ${law179.source})`);
      if (current && a.disposedOn) throw new Form4562Refusal(`${where}: property placed in service and disposed of in the same year gets no § 179 or depreciation`);
    }
    return { a, cls, adsPeriod, system, method, use, current, disposedThisYear: a.disposedOn !== undefined, businessBasis, s179, notes };
  });

  // ---- Part I: § 179
  const is1245 = (w: Work): boolean | undefined => {
    if (w.a.assetClass !== undefined && NOT_SECTION_179_CLASSES.has(w.a.assetClass)) return false;
    if (w.a.section1245Property !== undefined) return w.a.section1245Property;
    if (w.cls === "15" || w.cls === "20") return w.a.assetClass !== undefined && !MIXED_1245_CLASSES.has(w.a.assetClass) ? true : undefined;
    return true;
  };
  const s179Eligible = (w: Work) =>
    w.current &&
    !w.disposedThisYear &&
    w.use > 50 &&
    (SECTION_179_CLASSES.includes(w.cls) || (w.cls === "39" && w.a.section179QualifiedRealProperty === true)) &&
    (w.cls === "39" || w.cls === "qip" || is1245(w) === true) &&
    (w.cls !== "qip" || w.s179 > 0n) && // qualified real property counts as § 179 property only when elected (§ 179(d)(1)(B)(ii))
    !(w.cls === "39" && w.s179 === 0n);
  const line2own = work.filter(s179Eligible).reduce((t, w) => t + w.businessBasis, 0n);
  const mfs = input.filingStatus === "mfs";
  const line2 = line2own + (mfs ? (input.spouseSection179Cost ?? 0n) : 0n);
  const line1 = law179.limit;
  const line3 = law179.threshold;
  const line4 = max0(line2 - line3);
  let line5 = max0(line1 - line4);
  if (mfs) {
    const p = input.mfsAllocationPercent ?? 50;
    if (!(p >= 0 && p <= 100)) throw new Form4562Refusal("mfsAllocationPercent must be 0–100");
    line5 = mulRatio(line5, BigInt(Math.round(p * 10_000)), 1_000_000n);
    if (input.spouseSection179Cost === undefined)
      notes.push("married filing separately: line 2 should include the cost of § 179 property your spouse placed in service (spouseSection179Cost) — none was given");
  }
  // 15- and 20-year property with no asset class may be a land improvement (not § 179 property): it can't
  // be placed on line 2 without knowing. Line 2 only matters for the phase-out, so ask only when § 179 is used.
  const unclassified = work.filter((w) => w.current && !w.disposedThisYear && w.use > 50 && is1245(w) === undefined);
  const k1 = input.section179FromK1 ?? 0n;
  if (k1 < 0n) throw new Form4562Refusal("section179FromK1 can't be negative");
  const line6 = work.filter((w) => !w.a.listed).reduce((t, w) => t + w.s179, 0n) + k1;
  if (unclassified.length && (work.some((w) => w.s179 > 0n) || k1 > 0n || (input.section179Carryover ?? 0n) > 0n))
    throw new Form4562MissingInput(
      unclassified.map((w) => ({
        id: `assets[${w.a.id}].section1245Property`,
        description: "is it § 1245 property? Line 2 (the § 179 phase-out base) counts § 1245 property but not land improvements or buildings (§ 179(d)(1)(B); Pub 946 ch. 2)",
      })),
    );
  if (unclassified.length)
    notes.push(`line 2 leaves out ${unclassified.map((w) => w.a.id).join(", ")}: 15- or 20-year property may be a land improvement or building, which is not § 179 property — set section1245Property to place it (it only matters when § 179 is used)`);
  const line7 = work.filter((w) => w.a.listed).reduce((t, w) => t + w.s179, 0n);
  const line8 = line6 + line7;
  if (line8 > line5)
    throw new Form4562Refusal(
      `§ 179 elected (${fmt(line8)}) exceeds the dollar limitation on line 5 (${fmt(line5)}): reduce the elections so they total at most line 5 — which assets to reduce is your election (i4562 line 9)`,
    );
  const line9 = line8;
  const line10 = input.section179Carryover ?? 0n;
  if (line9 + line10 > 0n && input.section179BusinessIncome === undefined)
    throw new Form4562MissingInput([
      {
        id: "section179BusinessIncome",
        description:
          "taxable income from the active conduct of any trade or business, including wages, figured without § 179, the deduction for half of SE tax and any NOL (i4562 line 11; Reg. § 1.179-2(c)); both spouses on a joint return",
      },
    ]);
  const line11 = input.section179BusinessIncome === undefined ? 0n : minC(line5, max0(input.section179BusinessIncome));
  const line12 = minC(line9 + line10, line11);
  const line13 = line9 + line10 - line12;
  // current-year elections absorb the income limit before the carryover (§ 179(b)(3)(B): the carryover
  // is deductible only up to the unused allowance); the disallowed current-year part is spread equally
  // across the elected assets (Pub 946, "If you do not make a selection, the total carryover will be
  // allocated equally among the properties you elected to expense")
  const currentDeducted = minC(line9, line12);
  let disallowed = line9 - currentDeducted;
  const K1 = "\u0000k1";
  const deducted179 = new Map<string, Cents>(work.map((w) => [w.a.id, w.s179]));
  if (k1 > 0n) deducted179.set(K1, k1);
  let open: { a: { id: string } }[] = [...work.filter((w) => w.s179 > 0n), ...(k1 > 0n ? [{ a: { id: K1 } }] : [])];
  while (disallowed > 0n && open.length) {
    const share = disallowed / BigInt(open.length) + (disallowed % BigInt(open.length) ? 1n : 0n);
    const next: typeof open = [];
    for (const w of open) {
      if (disallowed === 0n) break;
      const left = deducted179.get(w.a.id)!;
      const take = minC(minC(share, left), disallowed);
      deducted179.set(w.a.id, left - take);
      disallowed -= take;
      if (left - take > 0n) next.push(w);
    }
    open = next;
  }
  const carryoverDeducted = line12 - currentDeducted;

  // ---- mid-quarter test (§ 168(d)(3); Reg. § 1.168(d)-1(b)): current-year non-real MACRS property, not
  // disposed of the same year, basis after § 179 and personal use but before the special allowance
  const testPool = work.filter((w) => w.current && !REAL.includes(w.cls) && !w.disposedThisYear);
  const totalBasis = testPool.reduce((t, w) => t + (w.businessBasis - w.s179), 0n);
  const q4Basis = testPool.filter((w) => quarterOf(w.a.placedInService) === 4).reduce((t, w) => t + (w.businessBasis - w.s179), 0n);
  const midQuarter = totalBasis > 0n && q4Basis * 10n > totalBasis * 4n; // "exceed 40 percent"
  if (testPool.length)
    notes.push(
      `convention: ${midQuarter ? "MID-QUARTER" : "half-year"} — property placed in service in October–December has ${fmt(q4Basis)} of ${fmt(totalBasis)} depreciable basis (${totalBasis > 0n ? ((Number(q4Basis) / Number(totalBasis)) * 100).toFixed(2) : "0.00"}%; mid-quarter applies above 40%, § 168(d)(3))`,
    );

  // ---- per asset
  const results: Form4562AssetResult[] = [];
  let line14 = 0n;
  let line17 = 0n;
  let line21 = 0n;
  const line19: Record<string, Cents> = {};
  const line20: Record<string, Cents> = {};
  for (const w of work) {
    const { a, cls, system } = w;
    const where = `asset "${a.id}"`;
    const pisYear = yearOf(a.placedInService);
    const real = REAL.includes(cls);
    const before = missing.length;
    if (!w.current) {
      if (!real && a.convention === undefined) missing.push({ id: `assets[${a.id}].convention`, description: `the convention used in ${pisYear}, the year placed in service: "HY" or "MQ"` });
      if (a.section179Taken === undefined) missing.push({ id: `assets[${a.id}].section179Taken`, description: "§ 179 deducted or elected for this asset when placed in service (0 if none)" });
      if (a.specialAllowanceTaken === undefined) missing.push({ id: `assets[${a.id}].specialAllowanceTaken`, description: "special depreciation allowance taken when placed in service (0 if none)" });
      if (missing.length > before) continue;
    }
    const convention: "HY" | "MQ" | "MM" = real ? "MM" : w.current ? (midQuarter ? "MQ" : "HY") : a.convention!;
    const quarter = quarterOf(a.placedInService);
    const month = monthOf(a.placedInService);
    const tab = tableFor(cls, system, w.method, convention, quarter, month, w.adsPeriod);
    const column = MACRS_TABLES[tab.table]?.[tab.column];
    if (!column) throw new Form4562Refusal(`${where}: no printed Pub 946 table ${tab.table} column ${tab.column}`);
    const recoveryYear = year - pisYear + 1;

    // special allowance (current-year property only)
    let rate = 0;
    if (w.current && !w.disposedThisYear && BONUS_CLASSES.includes(cls) && !electedOut.has(cls === "qip" ? "15" : cls) && !(a.listed && w.use <= 50)) {
      if (!a.acquiredOn) {
        missing.push({
          id: `assets[${a.id}].acquiredOn`,
          description: `date acquired (the binding written contract date): the special allowance is 100% for property acquired after January 19, 2025 and 40%/20%/0% for earlier acquisitions (OBBBA § 70301(c)) — or elect out of the allowance for class ${cls}`,
        });
        continue;
      }
      dayNum(a.acquiredOn, `${where}.acquiredOn`);
      if (a.acquiredOn > a.placedInService) throw new Form4562Refusal(`${where}: acquired after it was placed in service`);
      if (a.acquiredOn < "2017-09-28") throw new Form4562Refusal(`${where}: property acquired before September 28, 2017 is under the pre-TCJA special allowance rules — not modeled`);
      if (a.acquiredOn >= "2025-01-20") {
        rate = elect40 ? (a.longProductionPeriod ? 60 : 40) : 100; // § 168(k)(1)(A), (k)(10)
      } else {
        // former § 168(k)(6)(A), (B) (TCJA), still governing property acquired before January 20, 2025
        if (pisYear === 2025) rate = a.longProductionPeriod ? 60 : 40;
        else if (pisYear === 2026) rate = a.longProductionPeriod ? 40 : 20;
        else if (a.longProductionPeriod)
          throw new Form4562Refusal(`${where}: long-production property acquired before January 20, 2025 and placed in service in 2027 gets 20% only on its basis attributable to pre-2027 production (former § 168(k)(2)(B)(ii)) — not modeled`);
        else rate = 0;
      }
    }
    const businessBasis = w.businessBasis; // the business-use percentage is taken as the same in every year
    const s179Basis = w.current ? w.s179 : (a.section179Taken ?? 0n);
    const udb = businessBasis - s179Basis;
    if (udb < 0n) throw new Form4562Refusal(`${where}: § 179 exceeds the business cost`);
    const special = w.current ? mulRatio(udb, BigInt(rate), 100n) : 0n;
    const macrsBasis = udb - (w.current ? special : a.specialAllowanceTaken!);
    if (macrsBasis < 0n) throw new Form4562Refusal(`${where}: the special allowance taken exceeds the basis`);

    // MACRS for this year
    let depr = 0n;
    let rateStr = "0";
    if (w.current && w.disposedThisYear) {
      w.notes.push("placed in service and disposed of in the same year: no depreciation (Reg. § 1.168(d)-1(b)(3)(ii))");
    } else if (recoveryYear <= column.length) {
      rateStr = column[recoveryYear - 1];
      depr = pct(macrsBasis, rateStr);
      if (w.disposedThisYear) {
        if (recoveryYear === column.length)
          throw new Form4562Refusal(`${where}: disposed of in its last recovery year — the stub-year disposition rule is not modeled`);
        // Pub 946 ch. 4, Property disposed of before the end of the recovery period
        if (convention === "HY") depr = mulRatio(depr, 1n, 2n);
        else if (convention === "MQ") depr = mulRatio(depr, BigInt(2 * quarterOf(a.disposedOn!) - 1) * 3n, 24n); // 1.5, 4.5, 7.5, 10.5 of 12 months
        else depr = mulRatio(depr, BigInt(2 * monthOf(a.disposedOn!) - 1), 24n); // (month − ½) of 12
        w.notes.push(`disposed of ${a.disposedOn}: ${convention} convention applied to the year of disposition`);
      }
    }

    // § 280F passenger automobile caps
    const s179Deducted = deducted179.get(a.id) ?? 0n;
    if (a.passengerAutomobile) {
      if (!a.listed) throw new Form4562Refusal(`${where}: a passenger automobile is listed property — set listed`);
      const caps = AUTO_CAPS[pisYear];
      if (!caps) throw new Form4562Refusal(`${where}: the § 280F caps for automobiles placed in service in ${pisYear} are not on file (2025 and 2026 are; the 2027 Rev. Proc. isn't published)`);
      if (!w.current && (a.specialAllowanceTaken ?? 0n) > 0n && (a.specialAllowanceTaken ?? 0n) >= udb)
        throw new Form4562Refusal(`${where}: a 100% special allowance taken on a passenger automobile needs the Rev. Proc. 2019-13 safe harbor — not modeled`);
      if (recoveryYear > 6) throw new Form4562Refusal(`${where}: unrecovered basis after the recovery period (§ 280F(a)(1)(B)) is not modeled`);
      const capFull = recoveryYear === 1 ? (special > 0n ? caps.y1Bonus : caps.y1) : recoveryYear === 2 ? caps.y2 : recoveryYear === 3 ? caps.y3 : caps.later;
      if (capFull === undefined) throw new Form4562Refusal(`${where}: no § 280F cap on file for recovery year ${recoveryYear} of a ${pisYear} automobile`);
      if (w.current && rate === 100)
        w.notes.push("100% special allowance on a passenger automobile: year 1 is limited to the § 280F cap; the rest is recovered from year 2 under the Rev. Proc. 2019-13 safe harbor, which this build does not compute — a later year's return refuses");
      const cap = mulRatio(capFull, BigInt(Math.round(w.use * 10_000)), 1_000_000n);
      // i4562 line 26: the § 179 elected (column (i)) and the depreciation (column (h)) together can't exceed the limit
      if (w.s179 > cap)
        throw new Form4562Refusal(`${where}: § 179 elected (${fmt(w.s179)}) exceeds the § 280F limit for this automobile (${fmt(capFull)} × ${w.use}% = ${fmt(cap)}; ${caps.source}) — elect at most the limit`);
      // the limit counts the § 179 cost ELECTED for the automobile (i4562 line 26: "the total of columns (h) and (i)")
      const total = w.s179 + special + depr;
      if (total > cap) {
        let over = total - cap;
        const cut = (x: Cents) => {
          const c = minC(x, over);
          over -= c;
          return x - c;
        };
        depr = cut(depr);
        const specialAfter = cut(special);
        w.notes.push(`§ 280F(a) limit: ${fmt(capFull)} × ${w.use}% = ${fmt(cap)} (${caps.source}); the excess is recovered after the recovery period`);
        results.push(row(w, convention, tab, recoveryYear, rateStr, udb, s179Deducted, specialAfter, rate, macrsBasis, depr));
        line21 += specialAfter + depr;
        continue;
      }
    }
    results.push(row(w, convention, tab, recoveryYear, rateStr, udb, s179Deducted, special, rate, macrsBasis, depr));
    if (a.listed) line21 += special + depr;
    else {
      line14 += special;
      if (!w.current) line17 += depr;
      else if (system === "ADS") {
        const key = cls === "27.5" ? "20c_30_year" : cls === "39" ? "20d_40_year" : w.adsPeriod === 12 ? "20b_12_year" : "20a_class_life";
        line20[key] = (line20[key] ?? 0n) + depr;
      } else {
        const key = { "3": "19a_3_year", "5": "19b_5_year", "7": "19c_7_year", "10": "19d_10_year", "15": "19e_15_year", qip: "19e_15_year", "20": "19f_20_year", "25": "19g_25_year", "27.5": "19h_residential_rental", "39": "19i_nonresidential_real" }[cls];
        line19[key] = (line19[key] ?? 0n) + depr;
      }
    }
  }

  if (missing.length) throw new Form4562MissingInput(missing);

  function row(
    w: Work,
    convention: "HY" | "MQ" | "MM",
    tab: { table: string; column: string; methodLabel: string },
    recoveryYear: number,
    rateStr: string,
    udb: Cents,
    s179Deducted: Cents,
    special: Cents,
    rate: number,
    macrsBasis: Cents,
    depr: Cents,
  ): Form4562AssetResult {
    const { a } = w;
    return {
      id: a.id,
      activity: a.activity ?? "default",
      recoveryClass: w.cls,
      system: w.system,
      method: tab.methodLabel,
      convention,
      table: `${tab.table} col ${tab.column}`,
      recoveryYear,
      rate: rateStr,
      businessBasis: w.businessBasis,
      section179Elected: w.s179,
      section179Deducted: s179Deducted,
      specialAllowance: special,
      specialAllowanceRate: rate,
      macrsBasis,
      depreciation: depr,
      line: a.listed ? "Part V line 28 → line 21" : !w.current ? "line 17" : w.system === "ADS" ? "line 20" : "line 19",
      notes: w.notes,
    };
  }

  const sum = (o: Record<string, Cents>) => Object.values(o).reduce((t, c) => t + c, 0n);
  const line22 = line12 + line14 + line17 + sum(line19) + sum(line20) + line21;
  // by activity: each asset's § 179 deducted, special allowance and depreciation; last year's carryover separately
  const byActivity: Record<string, Cents> = {};
  for (const r of results) byActivity[r.activity] = (byActivity[r.activity] ?? 0n) + r.section179Deducted + r.specialAllowance + r.depreciation;
  const k1Deducted = deducted179.get(K1) ?? 0n;
  if (k1Deducted > 0n) byActivity["section179FromK1"] = k1Deducted; // deducted on Schedule E Part II, not the K-1 business's own return
  if (carryoverDeducted > 0n) {
    byActivity["section179CarryoverFromPriorYears"] = carryoverDeducted;
    notes.push("the § 179 carryover deducted this year belongs to the business whose property generated it — assign it there");
  }
  return {
    taxYear: year,
    lines: {
      "1_maximum": D(line1),
      "2_section179_property_cost": D(line2),
      "3_threshold": D(line3),
      "4_reduction": D(line4),
      "5_dollar_limitation": D(line5),
      "6_elected_cost": D(line6),
      "7_listed_property_elected": D(line7),
      "8_total_elected": D(line8),
      "9_tentative_deduction": D(line9),
      "10_carryover_from_prior_year": D(line10),
      "11_business_income_limitation": D(line11),
      "12_section179_deduction": D(line12),
      "13_carryover_to_next_year": D(line13),
      "14_special_depreciation_allowance": D(line14),
      "17_macrs_prior_years": D(line17),
      "19_gds_current_year": D(sum(line19)),
      "20_ads_current_year": D(sum(line20)),
      "21_listed_property": D(line21),
      "22_total": D(line22),
    },
    line19: Object.fromEntries(Object.entries(line19).map(([k, v]) => [k, D(v)])),
    line20: Object.fromEntries(Object.entries(line20).map(([k, v]) => [k, D(v)])),
    assets: results,
    byActivity: Object.fromEntries(Object.entries(byActivity).map(([k, v]) => [k, D(v)])),
    totalCents: line22.toString(),
    section179CarryoverToNextYear: D(line13),
    notes: [
      ...notes,
      "MACRS uses the printed Publication 946 Appendix A percentages (what filed returns use); each asset is computed to the cent and the form lines are whole dollars",
    ],
  };
}

// ---------------------------------------------------------------------------
// argument parsing shared by the CLI and the MCP tool (dollars in, cents out; unknown keys rejected)

const dollars = (v: unknown, path: string): Cents => {
  const s = typeof v === "number" ? (Number.isFinite(v) ? String(v) : "") : typeof v === "string" ? v.replace(/[$,\s]/g, "") : "";
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new Form4562Refusal(`${path}: expected a dollar amount like 1234.56, got ${JSON.stringify(v)}`);
  const c = BigInt(m[2]) * 100n + BigInt((m[3] ?? "").padEnd(2, "0"));
  return m[1] ? -c : c;
};
const ASSET_MONEY = ["cost", "section179", "section179Taken", "specialAllowanceTaken"] as const;
const ASSET_KEYS = new Set([
  "id", "description", "activity", "cost", "placedInService", "acquiredOn", "recoveryClass", "assetClass", "businessUsePercent",
  "section179", "section1245Property", "section179QualifiedRealProperty", "method", "adsRecoveryPeriod", "listed", "passengerAutomobile",
  "sportUtilityVehicle", "longProductionPeriod", "convention", "section179Taken", "specialAllowanceTaken", "disposedOn",
]);
const TOP_MONEY = ["section179Carryover", "section179BusinessIncome", "spouseSection179Cost", "section179FromK1"] as const;
const TOP_KEYS = new Set(["taxYear", "filingStatus", "assets", ...TOP_MONEY, "mfsAllocationPercent", "electOutOfSpecialAllowance", "elect40PercentFor2025"]);

export function form4562InputFromArgs(args: Record<string, unknown>): Form4562Input {
  const unknown = Object.keys(args).filter((k) => !TOP_KEYS.has(k));
  if (unknown.length) throw new Form4562Refusal(`unknown Form 4562 input(s): ${unknown.join(", ")}`);
  if (!Array.isArray(args.assets)) throw new Form4562Refusal("assets: expected an array");
  const fs = args.filingStatus;
  if (!["single", "mfj", "mfs", "hoh", "qss"].includes(fs as string)) throw new Form4562Refusal("filingStatus: one of single, mfj, mfs, hoh, qss");
  const out: Record<string, unknown> = { ...args };
  for (const k of TOP_MONEY) if (args[k] !== undefined) out[k] = dollars(args[k], k);
  out.assets = (args.assets as unknown[]).map((raw, i) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) throw new Form4562Refusal(`assets[${i}]: expected an object`);
    const a = raw as Record<string, unknown>;
    const bad = Object.keys(a).filter((k) => !ASSET_KEYS.has(k));
    if (bad.length) throw new Form4562Refusal(`assets[${i}]: unknown key(s) ${bad.join(", ")}`);
    const o: Record<string, unknown> = { ...a };
    for (const k of ASSET_MONEY) if (a[k] !== undefined) o[k] = dollars(a[k], `assets[${i}].${k}`);
    if (o.cost === undefined) throw new Form4562Refusal(`assets[${i}].cost is required`);
    if (o.recoveryClass !== undefined) o.recoveryClass = String(o.recoveryClass);
    return o;
  });
  return out as unknown as Form4562Input;
}
