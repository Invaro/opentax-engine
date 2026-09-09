/**
 * Machine-readable coverage matrix — every rule in the corpus, every state,
 * every composed form, with residency scope, composition depth, validity
 * windows, staleness, refusal conditions and the disclosed limitations.
 *
 *   node packages/corpus-us-federal/scripts/coverage-matrix.mjs   # writes docs/coverage/coverage-matrix.{json,md}
 */
import { writeFileSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getCorpus, STALE_AT_HORIZON, STALE_HORIZON } from "../dist/index.js";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
const corpus = getCorpus();
const YEARS = ["2025", "2026"];
const validIn = (versions, y) => versions.some((v) => v.from <= `${y}-12-31` && (v.to ?? "9999-12-31") > `${y}-12-31`);

// ---- federal: rule id -> the form / schedule it computes (authored mapping, prefix-based) ----
const FORM_MAP = [
  [/^us\.federal\.corp\.(entity_classification)/, "Form 8832 / Reg. § 301.7701-3 (entity classification)"],
  [/^us\.federal\.corp\.s_corp_entity_taxes/, "Form 1120-S (§ 1374 / § 1375 entity-level taxes only)"],
  [/^us\.federal\.corp\.(estimated|annualized)/, "Form 1120-W / § 6655 corporate estimates"],
  [/^us\.federal\.corp\.(accumulated_earnings|phc|is_personal_holding)/, "Form 1120 Schedule PH / §§ 531, 541"],
  [/^us\.federal\.corp\.stock_buyback/, "Form 7208 (§ 4501 excise)"],
  [/^us\.federal\.corp\.(beat)/, "Form 8991 (BEAT)"],
  [/^us\.federal\.corp\.ftc/, "Form 1118 (corporate FTC)"],
  [/^us\.federal\.corp\.(section250|section245a)/, "Form 8993 / § 250, § 245A"],
  [/^us\.federal\.corp\.(interest_deduction|interest_carryforward)/, "Form 8990 (§ 163(j))"],
  [/^us\.federal\.corp\.(section179|depreciation)/, "Form 4562 (§ 179, § 168(k))"],
  [/^us\.federal\.corp\.(gbc)/, "Form 3800 (general business credit)"],
  [/^us\.federal\.corp\./, "Form 1120 (corporate income tax computation)"],
  [/^us\.federal\.credit\.research_asc/, "Form 6765 (§ 41 ASC)"],
  [/^us\.federal\.fiduciary/, "Form 1041 (§ 1(e) rate schedule and § 642(b) exemption only)"],
  [/^us\.federal\.employer\.payroll/, "Forms 941 / 940 (employer payroll tax per employee)"],
  [/^us\.federal\.household_employment/, "Schedule H"],
  [/^us\.federal\.(se_|sehi|sep_|home_office|vehicle_standard)/, "Schedule C / Schedule SE / Schedule 1"],
  [/^us\.federal\.(rental|passive_loss)/, "Schedule E / Form 8582"],
  [/^us\.federal\.(schedule_d|capital_loss|qsbs)/, "Schedule D / Form 8949"],
  [/^us\.federal\.(itemized|salt|mortgage|charitable_deduction_itemizer|medical|casualty|deduction_election)/, "Schedule A"],
  [/^us\.federal\.(tips|overtime|senior_deduction|car_loan|charitable_deduction_nonitemizer|eligible\.)/, "Schedule 1-A (OBBBA deductions)"],
  [/^us\.federal\.qbi_deduction/, "Form 8995 / 8995-A (§ 199A)"],
  [/^us\.federal\.(above_the_line|agi|hsa|ira_deduction|student_loan|taxable_income|gross_income|ordinary_taxable|standard_deduction)/, "Form 1040 / Schedule 1"],
  [/^us\.federal\.(ira8606)/, "Form 8606"],
  [/^us\.federal\.pension/, "Form 1040 line 5 (Simplified Method)"],
  [/^us\.federal\.taxable_social_security/, "Form 1040 line 6 (§ 86 worksheet)"],
  [/^us\.federal\.(income_tax_before_credits|kiddie)/, "Form 1040 line 16 / Tax Table / Form 8615 / Schedule D worksheet"],
  [/^us\.federal\.amt/, "Form 6251"],
  [/^us\.federal\.(ctc|actc)/, "Schedule 8812"],
  [/^us\.federal\.eitc/, "Schedule EIC / EIC Table"],
  [/^us\.federal\.education/, "Form 8863"],
  [/^us\.federal\.cdcc/, "Form 2441"],
  [/^us\.federal\.savers/, "Form 8880"],
  [/^us\.federal\.adoption/, "Form 8839"],
  [/^us\.federal\.schedule_r/, "Schedule R"],
  [/^us\.federal\.ptc/, "Form 8962"],
  [/^us\.federal\.feie/, "Form 2555"],
  [/^us\.federal\.(niit)/, "Form 8960"],
  [/^us\.federal\.additional_medicare/, "Form 8959"],
  [/^us\.federal\.estimated/, "Form 2210 / Schedule AI / § 6654"],
  [/^us\.federal\.dependent/, "§ 152 dependent determination (Form 1040 dependents)"],
  [/^us\.federal\.excess_business_loss/, "Form 461"],
  [/^us\.federal\.(income_tax_after_credits|refundable_credits|other_taxes|net_tax|balance_due)/, "Form 1040 lines 22-37 / Schedule 2 / Schedule 3"],
];
const formFor = (id) => (FORM_MAP.find(([re]) => re.test(id)) ?? [null, "calculation (no printed-form mapping)"])[1];

const byId = new Map();
for (const r of corpus.rules) {
  const e = byId.get(r.id) ?? { id: r.id, jurisdiction: r.jurisdiction, versions: [], titles: [] };
  e.versions.push({ version: r.version, from: r.effectiveFrom, to: r.effectiveTo ?? null, computable: r.formula?.kind !== "unsupported" });
  e.titles.push(r.title);
  byId.set(r.id, e);
}
const federal = [...byId.values()].filter((e) => e.jurisdiction === "us.federal").map((e) => ({
  id: e.id, title: e.titles.at(-1), form: formFor(e.id),
  computable: e.versions.some((v) => v.computable),
  ty2025: validIn(e.versions, "2025"), ty2026: validIn(e.versions, "2026"),
  simplified: /simplif|approximat|not modeled|refuses/i.test(e.titles.at(-1)),
}));

// ---- states ----
const COMPOSED = { al: "Form 40", ar: "Form AR1000F", ca: "Form 540", ct: "Form CT-1040", de: "Form PIT-RES", ga: "Form 500", hi: "Form N-11", id: "Form 40", il: "Form IL-1040", ks: "Form K-40", md: "Form 502", me: "Form 1040ME", mn: "Form M1", mo: "Form MO-1040", mt: "Form 2", nc: "Form D-400", nd: "Form ND-1", ne: "Form 1040N", nj: "Form NJ-1040", nm: "Form PIT-1", ny: "Form IT-201", oh: "Form IT 1040", ok: "Form 511", or: "Form OR-40", pa: "Form PA-40", ri: "Form RI-1040", sc: "Form SC1040", va: "Form 760", vt: "Form IN-111", wi: "Form 1", wv: "Form IT-140" };
const NO_TAX = ["ak", "fl", "nv", "nh", "sd", "tn", "tx", "wa", "wy"];
const ALL = "al ak az ar ca co ct de fl ga hi id il in ia ks ky la me md ma mi mn ms mo mt ne nv nh nj nm ny nc nd oh ok or pa ri sc sd tn tx ut vt va wa wv wi wy".split(" ");
const fixtureFiles = readdirSync(path.join(root, "packages/corpus-us-federal/test/fixtures"));
const states = ALL.map((j) => {
  const rules = [...byId.values()].filter((e) => e.jurisdiction === `us.${j}`);
  const params = corpus.rules.find((r) => r.id === `us.${j}.parameters`);
  const excerpt = params?.citation?.excerpt ?? "";
  const oos = excerpt.match(/OUT OF SCOPE[^.]*(?:\.[^.]*){0,6}/)?.[0] ?? null;
  const composed = COMPOSED[j];
  const stale = STALE_AT_HORIZON[j];
  return {
    state: j.toUpperCase(),
    tier: NO_TAX.includes(j) ? "no-income-tax" : composed ? "deep+composer" : rules.length ? "calculation-only" : "uncovered",
    form: composed ?? (NO_TAX.includes(j) ? null : rules.length ? "rate/parameter rules only — no printed-form line set" : null),
    rules: rules.filter((e) => !e.id.endsWith(".parameters")).map((e) => e.id),
    fixtures: fixtureFiles.filter((f) => f.match(new RegExp(`^\\d+_${j}_`))).length,
    residency: { fullYearResident: !!composed || rules.length > 0, partYear: false, nonresident: false },
    composition: composed ? "full printed-form line set (compute_state_return)" : rules.length ? "calculation only (calculate_tax targets)" : "none",
    ty2025: rules.some((e) => validIn(e.versions, "2025")),
    ty2026: { anyRule: rules.some((e) => validIn(e.versions, "2026")), returnComposable: composed ? !(stale?.tier === "return") : null, staleTier: stale?.tier ?? null, staleRules: stale?.rules ?? [], unblockedBy: stale?.unblockedBy ?? null },
    businessState: false,
    outOfScope: oos,
  };
});

const businessReturns = [
  { form: "1120 (C corporation)", coverage: "calculation-only", detail: "Taxable income (line 30 given or computed: § 179, § 168(k), § 174A, § 163(j), DRD/§ 245A, NOL, charitable ceiling and floor), 21% tax, § 250, GBC/§ 38(c), FTC/§ 904, BEAT, AET, PHC, § 4501 excise, § 6655 estimates and annualized installments. No printed-form line set, no Schedule L/M-1/M-2/K, no state corporate returns." },
  { form: "1120-S (S corporation)", coverage: "calculation-only, entity-level taxes only", detail: "§ 1374 built-in gains and § 1375 excess net passive income taxes; S-election validity via entity classification. Owner-level K-1 income flows into calculate_tax (QBI, no SE tax). No Form 1120-S line set, no Schedule K-1 generation, no basis/AAA tracking." },
  { form: "1065 (partnership)", coverage: "classification only", detail: "Check-the-box classification (disregarded / partnership / S / C) with proof; partner K-1 box 1 income flows into calculate_tax. No Form 1065 computation, no § 704 allocations, no partner basis." },
  { form: "1041 (estate / trust)", coverage: "calculation-only, rate schedule only", detail: "§ 1(e) compressed brackets and the § 642(b) exemption on taxable income after the distribution deduction. Retained capital gains REFUSE (§ 1(h) trust breakpoints not modeled); no DNI, no Schedule K-1, no Form 1041 line set." },
  { form: "990 (exempt organizations)", coverage: "none", detail: "Not modeled." },
  { form: "State business returns", coverage: "none", detail: "No state corporate, partnership, franchise or PTE-tax returns are modeled." },
];

const refusals = [
  { code: "NEEDS_FACTS", meaning: "a required input is missing; error.data.missing lists each fact id, type and description", exit: 2 },
  { code: "NO_APPLICABLE_RULE", meaning: "no rule version is valid on the asOf date (e.g. a TY2026 state amount the Department has not published)", exit: 3 },
  { code: "UNHANDLED_ENUM_CASE", meaning: "a filing status / classification combination the corpus does not encode", exit: 3 },
  { code: "unsupported (rule-level)", meaning: "the rule exists but declares the situation out of scope (CAMT $1B+ AFSI; retained trust capital gains; kiddie preferential income; 4th simultaneous AOTC student; § 199A interaction with the § 68 haircut)", exit: 3 },
  { code: "composer refusal (throw)", meaning: "a state composer refuses rather than compose on a missing starting point (e.g. ndFederalTaxableIncome, mtFederalDeductions, deSpouseFederalAgi for DE status 4) or an unpublished year (VT line 4 for TY2026)", exit: 1 },
  { code: "input validation", meaning: "unknown keys are rejected (strict schemas); money must be dollars; counts are bounded (max exemptions, boxes)", exit: 1 },
];

const out = {
  generated: new Date().toISOString(), corpusVersion: corpus.version, merkleRoot: corpus.merkleRoot, horizon: STALE_HORIZON,
  taxYears: YEARS,
  federal: { individual: federal.filter((f) => !f.id.startsWith("us.federal.corp.") && !f.id.startsWith("us.federal.fiduciary")), businessEntity: federal.filter((f) => f.id.startsWith("us.federal.corp.") || f.id.startsWith("us.federal.fiduciary")) },
  federalComposition: { form1040: "compute_return emits the Form 1040 bottom-line set (lines 1a, 9, 10, 11, 12e, 15, 16, 17 AMT, 19, 22, 23, 24, 25d, 27a, 28, 32, 33, 34/37) plus Part IV withholding and penalties from transcribed documents; every other federal item is a calculate_tax target with a proof tree, not a printed line set", schedulesComposed: [] },
  businessReturns,
  states,
  refusals,
  outputs: { taxTotals: true, formLineSets: "federal bottom-line set + 31 state resident returns", proofsAndCitations: true, renderedPdf: false, mefXml: false },
  approximations: federal.filter((f) => f.simplified).map((f) => ({ id: f.id, title: f.title })),
};
writeFileSync(path.join(root, "docs/coverage/coverage-matrix.json"), JSON.stringify(out, null, 2) + "\n");

// ---- markdown companion ----
const md = [];
md.push(`# Coverage matrix — corpus ${corpus.version}\n\nGenerated ${out.generated} from the rule corpus (Merkle root \`${corpus.merkleRoot}\`). Machine-readable: [coverage-matrix.json](coverage-matrix.json). Regenerate with \`node packages/corpus-us-federal/scripts/coverage-matrix.mjs\`.\n`);
md.push(`## What the API returns\n\n| output | available |\n|---|---|\n| tax totals | yes |\n| complete form line sets | federal Form 1040 bottom-line set; 31 state full-year-resident returns (every printed line the form's totals consume) |\n| worksheet lines | the state composers emit the schedule/worksheet lines their totals consume (e.g. VT IN-112/IN-119, DE two-column, MT capital-gains worksheet); federal worksheets are proof-tree nodes, not printed lines |\n| calculation proofs and citations | yes — every answer carries a proof tree, every rule a statute/form citation with a verbatim excerpt, verifiable offline ([PROOF-FORMAT.md](../PROOF-FORMAT.md)) |\n| rendered forms / PDF | no |\n| federal or state MeF XML | no |\n`);
md.push(`## Federal individual (Form 1040) — ${out.federal.individual.length} rule ids\n\n| rule | form / schedule | TY2025 | TY2026 | note |\n|---|---|---|---|---|`);
for (const f of out.federal.individual) md.push(`| \`${f.id}\` | ${f.form} | ${f.ty2025 ? "✓" : "—"} | ${f.ty2026 ? "✓" : "—"} | ${f.simplified ? "simplified/approximated — see title" : ""} |`);
md.push(`\n## Federal business entities — ${out.federal.businessEntity.length} rule ids\n\n| return | coverage | detail |\n|---|---|---|`);
for (const b of businessReturns) md.push(`| ${b.form} | ${b.coverage} | ${b.detail} |`);
md.push(`\n| rule | form | TY2025 | TY2026 |\n|---|---|---|---|`);
for (const f of out.federal.businessEntity) md.push(`| \`${f.id}\` | ${f.form} | ${f.ty2025 ? "✓" : "—"} | ${f.ty2026 ? "✓" : "—"} |`);
md.push(`\n## States\n\nEvery composed state is the FULL-YEAR RESIDENT return; part-year and nonresident returns are out of scope in every state. No state business returns.\n\n| state | tier | form | rules | fixtures | TY2025 | TY2026 return composable | 2026 unblocked by |\n|---|---|---|---|---|---|---|---|`);
for (const s of states) md.push(`| ${s.state} | ${s.tier} | ${s.form ?? ""} | ${s.rules.length} | ${s.fixtures} | ${s.ty2025 ? "✓" : "—"} | ${s.tier === "deep+composer" ? (s.ty2026.returnComposable ? "✓" : `no (${s.ty2026.staleRules.length} stale rule${s.ty2026.staleRules.length === 1 ? "" : "s"})`) : s.tier === "calculation-only" ? (s.ty2026.anyRule ? "calc ✓" : "—") : ""} | ${s.ty2026.unblockedBy ?? ""} |`);
md.push(`\n## Refusal conditions\n\n| code | meaning | exit |\n|---|---|---|`);
for (const r of refusals) md.push(`| ${r.code} | ${r.meaning} | ${r.exit} |`);
md.push(`\n## Disclosed approximations (federal rules whose title says so)\n`);
for (const a of out.approximations) md.push(`- \`${a.id}\` — ${a.title}`);
md.push(`\n## Per-state out-of-scope notes (from each parameters rule)\n`);
for (const s of states) if (s.outOfScope) md.push(`- **${s.state}**: ${s.outOfScope}`);
writeFileSync(path.join(root, "docs/coverage/coverage-matrix.md"), md.join("\n") + "\n");
console.log(`federal individual ${out.federal.individual.length}, business ${out.federal.businessEntity.length}, states ${states.length} (composed ${states.filter((s) => s.tier === "deep+composer").length}, calc-only ${states.filter((s) => s.tier === "calculation-only").length}, no-tax ${states.filter((s) => s.tier === "no-income-tax").length}), approximations ${out.approximations.length}`);
