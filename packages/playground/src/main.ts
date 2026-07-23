/**
 * The opentax playground: the engine, corpus, and verifier running entirely
 * client-side. No server, no network — the corpus is compiled into this
 * bundle and pinned by the same Merkle root the CLI prints.
 */

import {
  coerceFacts,
  evaluate,
  verifyProof,
  NeedsFactsError,
  NotModeledError,
  NoApplicableRuleError,
  UnhandledEnumCaseError,
} from "@invaro/opentax-core";
import type { DerivationNode, ProofArtifact, TypedValueJSON } from "@invaro/opentax-core";
import { DEFAULT_TARGET, getCorpus, TIPPED_OCCUPATIONS } from "@invaro/opentax-corpus-us-federal";

const corpus = getCorpus();
const $ = <T extends HTMLElement = HTMLElement>(id: string): T =>
  document.getElementById(id) as T;

// ── formatting ─────────────────────────────────────────────────────────────

function fmtCents(cents: bigint | string): string {
  let n = typeof cents === "bigint" ? cents : BigInt(cents);
  const neg = n < 0n;
  if (neg) n = -n;
  const dollars = n / 100n;
  const rem = (n % 100n).toString().padStart(2, "0");
  const withCommas = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${neg ? "−" : ""}$${withCommas}.${rem}`;
}

function fmtValue(v: TypedValueJSON): string {
  switch (v.type) {
    case "money": return fmtCents(v.value as string);
    case "bool": return v.value ? "yes" : "no";
    case "int": return String(v.value);
    case "enum": return String(v.value);
  }
}

// ── proof-tree lookups (every summary number IS a derivation node) ─────────

function findNode(root: DerivationNode, ruleId: string): DerivationNode | null {
  if (root.ruleId === ruleId || root.resolvedFrom === ruleId) return root;
  for (const child of root.children ?? []) {
    const hit = findNode(child, ruleId);
    if (hit) return hit;
  }
  return null;
}

function centsOf(root: DerivationNode, ruleId: string): bigint | null {
  const node = findNode(root, ruleId);
  if (!node || node.value.type !== "money") return null;
  return BigInt(node.value.value as string);
}

// ── the filing form ─────────────────────────────────────────────────────────

const MONEY_FIELDS: [string, string][] = [
  ["f-wages", "wages"],
  ["f-interest", "taxableInterest"],
  ["f-gains", "longTermCapitalGains"],
  ["f-seProfit", "selfEmploymentNetProfit"],
  ["f-salt", "stateAndLocalTaxesPaid"],
  ["f-mortgageInterest", "mortgageInterestPaid"],
  ["f-mortgageBalance", "mortgageAverageBalance"],
  ["f-medical", "medicalExpenses"],
  ["f-charity", "charitableCashContributions"],
  ["f-tips", "qualifiedTips"],
  ["f-overtime", "qualifiedOvertimePremium"],
  ["f-carLoan", "carLoanInterest"],
  ["f-studentLoan", "studentLoanInterest"],
  ["f-hsa", "hsaContribution"],
  ["f-withheld", "federalTaxWithheld"],
];

const CHECKBOXES: [string, string][] = [
  ["f-age65", "isAge65OrOlder"],
  ["f-blind", "isBlind"],
  ["f-spouse65", "spouseIsAge65OrOlder"],
  ["f-spouseBlind", "spouseIsBlind"],
  ["f-dependent", "isClaimedAsDependent"],
];

function moneyOf(id: string): string | null {
  const raw = $(id) ? ($(id) as HTMLInputElement).value.trim() : "";
  if (!raw) return null;
  const cleaned = raw.replace(/[$,\s]/g, "");
  return cleaned === "" ? null : cleaned;
}

function collectFacts(): Record<string, unknown> {
  const plain: Record<string, unknown> = {
    filingStatus: ($("f-status") as HTMLSelectElement).value,
    isAtLeastAge25: ($("f-age25") as HTMLInputElement).checked,
  };
  const kids = ($("f-kids") as HTMLInputElement).value.trim();
  if (kids) plain.qualifyingChildren = Number(kids);
  for (const [id, factId] of MONEY_FIELDS) {
    const v = moneyOf(id);
    if (v !== null) plain[factId] = v;
  }
  for (const [id, factId] of CHECKBOXES) {
    if (($(id) as HTMLInputElement).checked) plain[factId] = true;
  }
  if (plain.filingStatus === "mfs") {
    plain.spouseItemizes = ($("f-spouseItemizes") as HTMLInputElement).checked;
  }
  if (plain.qualifiedTips) {
    plain.occupation = ($("f-occupation") as HTMLSelectElement).value;
  }
  if (plain.hsaContribution) {
    plain.hsaCoverage = ($("f-hsaCoverage") as HTMLSelectElement).value;
  }
  return plain;
}

// conditional field visibility mirrors what the engine will actually demand
function refreshConditionals(): void {
  const status = ($("f-status") as HTMLSelectElement).value;
  $("cond-spouse").classList.toggle("on", status === "mfj");
  $("cond-mfs").classList.toggle("on", status === "mfs");
  $("cond-mortgage").classList.toggle("on", moneyOf("f-mortgageInterest") !== null);
  $("cond-tips").classList.toggle("on", moneyOf("f-tips") !== null);
  $("cond-hsa").classList.toggle("on", moneyOf("f-hsa") !== null);
}

// ── presets: real scenarios from the fixture suite ──────────────────────────

interface Preset { label: string; set: Record<string, string | boolean> }
const PRESETS: Preset[] = [
  { label: "W-2 family", set: { "f-status": "mfj", "f-wages": "120000", "f-kids": "2" } },
  {
    label: "Homeowner, itemizing",
    set: {
      "f-status": "mfj", "f-wages": "300000", "f-salt": "50000",
      "f-mortgageInterest": "30000", "f-mortgageBalance": "900000",
      "f-medical": "30000", "f-charity": "10000",
    },
  },
  { label: "Freelancer", set: { "f-status": "single", "f-seProfit": "80000" } },
  { label: "SALT phase-down", set: { "f-status": "single", "f-wages": "550000", "f-salt": "45000" } },
  {
    label: "EITC cliff (1¢ of interest)",
    // TY2025: the § 32(i) investment-income limit is exactly $11,950 —
    // one cent past it destroys the whole credit
    set: { "f-status": "hoh", "f-wages": "30000", "f-kids": "2", "f-interest": "11950", "f-year": "2025-12-31" },
  },
  { label: "Tipped bartender", set: { "f-status": "single", "f-wages": "48000", "f-tips": "14000" } },
];

function applyPreset(p: Preset): void {
  ($("facts-form") as HTMLFormElement).reset();
  ($("f-age25") as HTMLInputElement).checked = true;
  for (const [id, value] of Object.entries(p.set)) {
    const el = $(id) as HTMLInputElement | HTMLSelectElement;
    if (typeof value === "boolean") (el as HTMLInputElement).checked = value;
    else el.value = value;
  }
  refreshConditionals();
  compute();
}

// ── the answer: summary ledger + assumptions + proof tree ──────────────────

const STATUS_LABEL: Record<string, string> = {
  single: "Single", mfj: "Married filing jointly", mfs: "Married filing separately",
  hoh: "Head of household", qss: "Qualifying surviving spouse",
};

function el(tag: string, className?: string, text?: string): HTMLElement {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function ledgerRow(label: string, amount: bigint, note?: string): HTMLElement {
  const row = el("div", "lrow");
  row.append(el("span", "llabel", label));
  if (note) row.append(el("span", "lnote", `(${note})`));
  row.append(el("span", "leader"));
  row.append(el("span", "amt", fmtCents(amount)));
  return row;
}

function renderLedger(proof: ProofArtifact, withholdingMode: boolean): HTMLElement {
  const root = proof.root;
  const agi = centsOf(root, "us.federal.agi") ?? 0n;
  const stdDed = centsOf(root, "us.federal.standard_deduction") ?? 0n;
  const senior = centsOf(root, "us.federal.senior_deduction") ?? 0n;
  const tips = centsOf(root, "us.federal.tips_deduction") ?? 0n;
  const overtime = centsOf(root, "us.federal.overtime_deduction") ?? 0n;
  const carLoan = centsOf(root, "us.federal.car_loan_interest_deduction") ?? 0n;
  const charityNI = centsOf(root, "us.federal.charitable_deduction_nonitemizer") ?? 0n;
  const qbi = centsOf(root, "us.federal.qbi_deduction") ?? 0n;
  const elected = centsOf(root, "us.federal.deduction_election");
  const itemized = centsOf(root, "us.federal.itemized_deductions") ?? 0n;
  const taxable = centsOf(root, "us.federal.taxable_income") ?? 0n;
  const before = centsOf(root, "us.federal.income_tax_before_credits") ?? 0n;
  const amt = centsOf(root, "us.federal.amt") ?? 0n;
  const ctc = centsOf(root, "us.federal.ctc") ?? 0n;
  const education = centsOf(root, "us.federal.education.nonrefundable") ?? 0n;
  const refundable = centsOf(root, "us.federal.refundable_credits") ?? 0n;
  const otherTaxes = centsOf(root, "us.federal.other_taxes") ?? 0n;
  const net = withholdingMode
    ? (centsOf(root, "us.federal.net_tax") ?? 0n)
    : BigInt(root.value.value as string);

  const itemizing = elected !== null && itemized > stdDed + charityNI;
  const deductions = (elected ?? stdDed + charityNI) + senior + tips + overtime + carLoan + qbi;
  const dedParts = [
    itemizing ? "itemized — Schedule A" : "standard deduction",
    senior > 0n ? "senior" : null, tips > 0n ? "tips" : null,
    overtime > 0n ? "overtime" : null, carLoan > 0n ? "car loan" : null,
    !itemizing && charityNI > 0n ? "charitable" : null, qbi > 0n ? "QBI" : null,
  ].filter(Boolean).join(" + ");

  const card = el("div", "ledger reveal");
  const status = STATUS_LABEL[String(proof.facts.filingStatus?.value ?? "")] ?? "Taxpayer";
  card.append(el("h2", undefined, `${status} · tax year ${proof.asOf.slice(0, 4)}`));
  card.append(el("div", "asof", `computed under the law in force ${proof.asOf}`));
  card.append(ledgerRow("Income (AGI)", agi));
  card.append(ledgerRow("− Deductions", deductions, dedParts));
  card.append(ledgerRow("= Taxable income", taxable));
  card.append(ledgerRow("Tax before credits", before));
  if (amt > 0n) card.append(ledgerRow("+ Alternative minimum tax", amt, "Form 6251"));
  if (education + ctc + refundable > 0n) {
    card.append(ledgerRow("− Credits", education + ctc + refundable));
  }
  if (otherTaxes > 0n) card.append(ledgerRow("+ Other taxes", otherTaxes, "SE tax / Add’l Medicare / NIIT"));

  const totalRow = ledgerRow(
    withholdingMode ? "Tax for the year" : net < 0n ? "Your refund" : "You owe",
    net < 0n ? -net : net,
  );
  totalRow.classList.add("total");
  if (net < 0n) totalRow.classList.add("refund");
  card.append(totalRow);

  if (withholdingMode) {
    const balance = BigInt(root.value.value as string);
    const withheld = net - balance;
    card.append(ledgerRow("− Withheld so far", withheld));
    const due = ledgerRow(balance < 0n ? "Refund expected next April" : "Balance due next April",
      balance < 0n ? -balance : balance);
    due.classList.add("total");
    if (balance < 0n) due.classList.add("refund");
    card.append(due);
  } else if (net > 0n && agi > 0n) {
    const bps = Number((net * 10000n) / agi);
    card.append(el("div", "effective", `${(bps / 100).toFixed(1)}% of income`));
  }
  return card;
}

function nodeLine(n: DerivationNode): HTMLElement {
  const line = el("span", "nodeline");
  if (n.kind === "rule") {
    line.append(el("span", "ntitle", n.title ?? n.ruleId ?? "rule"));
    line.append(el("span", "nval", fmtValue(n.value)));
    if (n.citation?.section) line.append(el("span", "ncite", `[${n.citation.section}]`));
  } else {
    line.append(el("span", "nkind", n.kind === "assumption" ? "assumed" : "fact"));
    line.append(el("span", "ntitle", n.factId ?? ""));
    line.append(el("span", "nval", `= ${fmtValue(n.value)}`));
    if (n.kind === "assumption") line.append(el("span", "ncite", "(default)"));
  }
  return line;
}

/** Lazy tree: children materialize on first expand — 1MB proofs stay snappy. */
function nodeEl(n: DerivationNode, depth: number): HTMLElement {
  if (!n.children?.length) {
    const leaf = el("div", "leaf");
    leaf.append(nodeLine(n));
    return leaf;
  }
  const details = document.createElement("details");
  if (depth < 2) details.open = true;
  const summary = document.createElement("summary");
  summary.append(nodeLine(n));
  details.append(summary);
  let loaded = false;
  const load = () => {
    if (loaded) return;
    loaded = true;
    for (const child of n.children!) details.append(nodeEl(child, depth + 1));
  };
  if (depth < 2) load();
  else details.addEventListener("toggle", load, { once: true });
  return details;
}

function renderResult(proof: ProofArtifact, withholdingMode: boolean): void {
  const box = $("result");
  box.textContent = "";
  box.append(renderLedger(proof, withholdingMode));

  const actions = el("div", "actions");
  const dl = el("button", undefined, "Download proof JSON") as HTMLButtonElement;
  dl.type = "button";
  dl.addEventListener("click", () => {
    const blob = new Blob([JSON.stringify(proof, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "proof.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });
  const toVerify = el("button", undefined, "Verify it in the next tab →") as HTMLButtonElement;
  toVerify.type = "button";
  toVerify.addEventListener("click", () => {
    ($("proof-input") as HTMLTextAreaElement).value = JSON.stringify(proof, null, 2);
    switchTab("verify");
  });
  actions.append(dl, toVerify);
  box.append(actions);

  if (proof.assumptions.length) {
    const abox = el("div", "assumebox");
    const title = el("div", "boxtitle");
    title.append(el("span", undefined, `Assumptions (${proof.assumptions.length})`));
    title.append(el("span", "hint", "defaults the engine relied on — change a fact if yours differs"));
    abox.append(title);
    const ul = el("ul");
    for (const a of proof.assumptions) {
      const li = el("li");
      const code = el("code", undefined, a.factId);
      li.append(code, document.createTextNode(` = ${fmtValue(a.value)} — ${a.rationale}`));
      ul.append(li);
    }
    abox.append(ul);
    box.append(abox);
  }

  const pbox = el("div", "proofbox");
  const ptitle = el("div", "boxtitle");
  ptitle.append(el("span", undefined, "The proof"));
  ptitle.append(el("span", "hint", "every line is a rule with its citation — expand any step"));
  pbox.append(ptitle);
  const tree = el("div", "tree");
  tree.append(nodeEl(proof.root, 0));
  pbox.append(tree);
  box.append(pbox);
}

function renderRefusal(err: unknown): void {
  const box = $("result");
  box.textContent = "";
  const card = el("div", "refusal reveal");
  if (err instanceof NeedsFactsError) {
    card.append(el("h3", undefined, "More facts needed — the engine never guesses"));
    const ul = el("ul");
    for (const m of err.missing) {
      const li = el("li");
      li.append(el("code", undefined, m.factId), document.createTextNode(` — ${m.description ?? ""}`));
      ul.append(li);
    }
    card.append(ul);
  } else if (
    err instanceof NotModeledError ||
    err instanceof NoApplicableRuleError ||
    err instanceof UnhandledEnumCaseError
  ) {
    card.append(el("h3", undefined, "Refused: outside the encoded law"));
    card.append(el("p", undefined, (err as Error).message));
    card.append(el("p", "why",
      "This is the design working as intended — where the corpus has no cited rule, opentax refuses rather than produce a plausible wrong number."));
  } else {
    card.append(el("h3", undefined, "Invalid input"));
    card.append(el("p", undefined, (err as Error).message));
  }
  box.append(card);
}

function compute(): void {
  try {
    const plain = collectFacts();
    const target = plain.federalTaxWithheld !== undefined
      ? "us.federal.balance_due"
      : DEFAULT_TARGET;
    const asOf = ($("f-year") as HTMLSelectElement).value;
    const facts = coerceFacts(corpus, plain);
    const { proof } = evaluate(corpus, facts, { asOf, target });
    renderResult(proof, target === "us.federal.balance_due");
  } catch (err) {
    renderRefusal(err);
  }
}

// ── verify pane ─────────────────────────────────────────────────────────────

function runVerify(): void {
  const out = $("verdict");
  out.textContent = "";
  let artifact: ProofArtifact;
  try {
    artifact = JSON.parse(($("proof-input") as HTMLTextAreaElement).value);
  } catch {
    const card = el("div", "verdict fail reveal");
    card.append(el("h3", undefined, "✗ Not a proof"));
    card.append(el("p", undefined, "That isn’t valid JSON. Paste the artifact produced by “Download proof” or the CLI’s --proof flag."));
    out.append(card);
    return;
  }
  const res = verifyProof(artifact, corpus);
  if (res.ok) {
    const card = el("div", "verdict pass reveal");
    card.append(el("h3", undefined, "✓ VERIFIED — re-derived independently in this tab"));
    card.append(el("p", undefined,
      `Every step re-derives from this page’s own copy of the corpus and matches the recorded derivation. Target ${res.target} = ${typeof res.value === "string" ? fmtCents(res.value) : res.value}.`));
    const hash = el("p", "mono", `corpus ${res.corpusMerkleRoot}`);
    card.append(hash);
    out.append(card);
  } else {
    const card = el("div", "verdict fail reveal");
    card.append(el("h3", undefined, "✗ REFUTED"));
    card.append(el("p", undefined, `${res.reason}: ${res.message}`));
    if (res.path) card.append(el("p", "mono", `at ${res.path}`));
    card.append(el("p", undefined,
      res.reason === "corpus-mismatch"
        ? "The proof was computed against a different corpus version than the one compiled into this page — its numbers may be honest under that other corpus, but this page cannot vouch for them."
        : "The file does not re-derive: it was altered, or it was never a faithful derivation."));
    out.append(card);
  }
}

// ── tabs & wiring ───────────────────────────────────────────────────────────

function switchTab(which: "compute" | "verify"): void {
  const compute = which === "compute";
  $("pane-compute").hidden = !compute;
  $("pane-verify").hidden = compute;
  $("tab-compute").setAttribute("aria-selected", String(compute));
  $("tab-verify").setAttribute("aria-selected", String(!compute));
}

function init(): void {
  $("seal").innerHTML = "";
  const left = el("span");
  left.append(el("b", undefined, "corpus "), document.createTextNode(corpus.merkleRoot));
  const right = el("span", undefined,
    `${corpus.rules.length} rules · tax years 2025–2026 · engine + corpus + verifier compiled into this page`);
  $("seal").append(left, right);

  const occ = $("f-occupation") as HTMLSelectElement;
  for (const o of TIPPED_OCCUPATIONS) {
    const opt = document.createElement("option");
    opt.value = o.slug;
    opt.textContent = o.name;
    occ.append(opt);
  }
  const other = document.createElement("option");
  other.value = "other";
  other.textContent = "not on the Treasury list";
  occ.append(other);

  const presets = $("presets");
  for (const p of PRESETS) {
    const b = el("button", undefined, p.label) as HTMLButtonElement;
    b.type = "button";
    b.addEventListener("click", () => applyPreset(p));
    presets.append(b);
  }

  $("facts-form").addEventListener("submit", (e) => {
    e.preventDefault();
    compute();
  });
  $("facts-form").addEventListener("input", refreshConditionals);
  $("tab-compute").addEventListener("click", () => switchTab("compute"));
  $("tab-verify").addEventListener("click", () => switchTab("verify"));
  $("verify-btn").addEventListener("click", runVerify);
  ($("proof-file") as HTMLInputElement).addEventListener("change", async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    ($("proof-input") as HTMLTextAreaElement).value = await file.text();
    runVerify();
  });
  refreshConditionals();
}

init();
