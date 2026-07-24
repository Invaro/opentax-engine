/**
 * @invaro/opentax — the tax oracle for AI agents, over the Model Context
 * Protocol (transport-agnostic server factory).
 *
 * The contract for the model: NEVER compute tax yourself — call these tools.
 * Every answer is derived from a content-addressed corpus of cited rules,
 * ships its assumptions, and is independently re-verifiable.
 *
 *   claude mcp add opentax -- npx -y @invaro/opentax
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { evaluate, OpenTaxError, parseDollars } from "@invaro/opentax-core";
import { compareAcross, factCheck, findCliffs, lookupParameters, searchRules } from "@invaro/opentax-solve";
import { composeStateReturn, makeStateTaxEvaluator, stateReturnShape } from "@invaro/opentax-compose";
import { matchOccupation, TIPPED_OCCUPATIONS } from "@invaro/opentax-corpus-us-federal";
import {
  buildFactsValidated,
  businessShape,
  corpus,
  dependentShape,
  factsObjectParam,
  fiduciaryShape,
  individualNestedShape,
  money,
} from "./schema.js";

function ok(payload: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }] };
}

function fail(err: unknown) {
  const payload =
    err instanceof OpenTaxError
      ? { ok: false, error: err.toJSON() }
      : { ok: false, error: { code: "ERROR", message: String((err as Error)?.message ?? err) } };
  return {
    content: [{ type: "text" as const, text: JSON.stringify(payload, null, 2) }],
    isError: true,
  };
}

const fmt = (cents: bigint) => {
  const sign = cents < 0n ? "-" : "";
  let abs = cents < 0n ? -cents : cents;
  const dollars = (abs / 100n)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}$${dollars}.${(abs % 100n).toString().padStart(2, "0")}`;
};

// ---------------------------------------------------------------------------

/** Build a fully-registered opentax MCP server (one per transport/session). */
export function createServer(): McpServer {
const server = new McpServer({ name: "opentax", version: "0.1.0" });

server.registerTool(
  "calculate_tax",
  {
    description:
      "Compute US federal INDIVIDUAL income tax (or balance due if withholding is given) from a content-addressed corpus of cited rules. NEVER estimate tax yourself — call this, and report ONLY numbers returned by oracle calls made with the real facts (never hand-check or approximate a line the oracle can compute: your recalled parameters may be stale). Negative result = refund. Returns the answer, every assumption made, and hashes that let anyone re-verify the full derivation offline. Facts are grouped (filing, income, retirement, credits, …) — fill the groups that apply; unknown keys are rejected, and the engine names any missing fact the target needs. When source documents CONFLICT on a value, do not silently pick one: compute both branches, disclose the conflict and your choice; an interview/confirmation answer (rollover, conversion, taxable-amount screens) usually reflects taxpayer intent better than a payer form's box code — prefer it and disclose. That heuristic covers FACTS only: LEGAL classifications (qualifying child vs other dependent, filing status, SSTB) follow the statute's tests, not intake checkbox labels — a generic 'claim dependent credit' flag does not convert a qualifying child into an ODC dependent. TRANSCRIBE documented amounts as given even when they look anomalous (e.g. state withholding in a no-income-tax state): disclose the anomaly, never delete or 'correct' a documented number from outside knowledge. If you believe an oracle result is wrong, report the ORACLE's number and note your dissent — never substitute your own: the corpus is primary-source-verified and your recollection is not. Business entities → calculate_business_tax; estates/trusts → calculate_fiduciary_tax; § 152 dependency → determine_dependent.",
    inputSchema: z.object(individualNestedShape).strict(),
  },
  async (args: Record<string, unknown>) => {
    try {
      const { facts, asOf, target, documentNotes } = buildFactsValidated(args);
      const { value, proof } = evaluate(corpus, facts, { asOf, target });
      const cents = value.type === "money" ? value.cents : 0n;
      return ok({
        ok: true,
        target,
        asOf,
        answer: fmt(cents),
        valueCents: cents.toString(),
        ...(documentNotes.length ? { documentNotes } : {}),
        meaning:
          target === "us.federal.balance_due"
            ? cents < 0n
              ? "refund expected at filing"
              : "balance due at filing"
            : cents < 0n
              ? "net refund (refundable credits exceed tax)"
              : "net federal income tax",
        assumptions: proof.assumptions,
        corpusMerkleRoot: proof.corpus.merkleRoot,
        artifactHash: proof.artifactHash,
        note: "Tell the user about any assumptions that may not match their situation. This is computation with citations, not tax advice.",
      });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "calculate_business_tax",
  {
    description:
      "Compute US federal BUSINESS-ENTITY tax from the same cited corpus: check-the-box entity classification, Form 1120 corporate income tax (§ 179/168(k)/174A/163(j)/DRD/NOL, § 250, GBC/FTC/BEAT), S-corp entity taxes, corporate estimates, the § 4501 buyback excise, AET and PHC taxes. Individual returns → calculate_tax. Unknown keys are rejected; unmodeled territory refuses loudly with the reason.",
    inputSchema: z.object(businessShape).strict(),
  },
  async (args: Record<string, unknown>) => {
    try {
      const { facts, asOf, target } = buildFactsValidated(
        args,
        "us.federal.corp.entity_level_income_tax",
      );
      const { value, proof } = evaluate(corpus, facts, { asOf, target });
      const cents = value.type === "money" ? value.cents : 0n;
      return ok({
        ok: true,
        target,
        asOf,
        answer: fmt(cents),
        valueCents: cents.toString(),
        assumptions: proof.assumptions,
        corpusMerkleRoot: proof.corpus.merkleRoot,
        artifactHash: proof.artifactHash,
        note: "Tell the user about any assumptions that may not match their situation. This is computation with citations, not tax advice.",
      });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "calculate_fiduciary_tax",
  {
    description:
      "Compute US federal income tax for an ESTATE or TRUST (Form 1041): the § 1(e) compressed brackets and § 642(b) exemption. Input is taxable income before the exemption, after the §§ 651/661 distribution deduction. Retained capital gains refuse loudly (§ 1(h) trust breakpoints not modeled). Grantor trusts belong on the grantor's individual return via calculate_tax.",
    inputSchema: z.object(fiduciaryShape).strict(),
  },
  async (args: Record<string, unknown>) => {
    try {
      const { facts, asOf, target } = buildFactsValidated(
        args,
        "us.federal.fiduciary.income_tax",
      );
      const { value, proof } = evaluate(corpus, facts, { asOf, target });
      const cents = value.type === "money" ? value.cents : 0n;
      return ok({
        ok: true,
        target,
        asOf,
        answer: fmt(cents),
        valueCents: cents.toString(),
        assumptions: proof.assumptions,
        corpusMerkleRoot: proof.corpus.merkleRoot,
        artifactHash: proof.artifactHash,
        note: "Tell the user about any assumptions that may not match their situation. This is computation with citations, not tax advice.",
      });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "determine_dependent",
  {
    description:
      "Determine whether ONE candidate person is the taxpayer's § 152 dependent — qualifying child or qualifying relative, including multiple-support agreements and the divorced-parents release — as a proof-backed yes/no with citations. Feed the result into calculate_tax's credits group (qualifyingChildren / otherDependents).",
    inputSchema: z.object(dependentShape).strict(),
  },
  async (args: Record<string, unknown>) => {
    try {
      const { facts, asOf, target } = buildFactsValidated(
        args,
        "us.federal.dependent.is_dependent",
      );
      const { value, proof } = evaluate(corpus, facts, { asOf, target });
      const answer =
        value.type === "bool" ? (value.value ? "yes" : "no") : fmt(value.type === "money" ? value.cents : 0n);
      return ok({
        ok: true,
        target,
        asOf,
        answer,
        assumptions: proof.assumptions,
        corpusMerkleRoot: proof.corpus.merkleRoot,
        artifactHash: proof.artifactHash,
      });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "compute_state_return",
  {
    description:
      "Compose a STATE return's printed-form line set deterministically (2025 IL-1040 / VA 760 / CA 540 / NY IT-201 / PA-40) — correct line NUMBERS from the printed forms and whole-dollar rounding, with the state tax computed by the oracle targets internally. PA is CLASS-BASED: transcribe the pa* class fields (Box 16 compensation, per-spouse loss classes) — federalAGI is NOT the PA base; the composer runs the class netting, Schedule O, and Tax Forgiveness targets itself, and reports the WPTC as a note (no printed line). Workflow: run compute_return first for the federal substrate, compute any state-specific components the citations describe (additions, subtractions, credits without targets — disclose each), then call this ONCE and report its line set VERBATIM. Never hand-assemble state line numbers: transposed lines on correct dollars are the dominant state error mode. ALWAYS pass taxableSocialSecurity and unemploymentCompensation when nonzero (VA/CA/NY subtractions are applied by the composer). ALWAYS transcribe the intake's state-specific block (e.g. ca_tax_return.ca_form540_schca: AB 5 employee-classification additions; va_sch_a fields; county/use-tax questions) — those fields drive composer inputs. For VA MFJ, pass vaYourVagi/vaSpouseVagi (the separate-VAGI worksheet) so the composer can run the Spouse Tax Adjustment worksheet itself.",
    inputSchema: z
      .object({ ...stateReturnShape, asOf: z.string().describe("year-end date, e.g. 2025-12-31 — REQUIRED"), filingJoint: z.boolean().optional(), filingHoh: z.boolean().optional(), filingHohOrQss: z.boolean().optional() })
      .strict(),
  },
  async (args: Record<string, unknown>) => {
    try {
      const asOf = args.asOf as string;
      if (!asOf) throw new Error("asOf is required — pass the tax year's year-end date");
      const evalStateTax = makeStateTaxEvaluator((facts, target) => {
        const { value } = evaluate(corpus, facts as never, { asOf, target });
        return value.type === "money" ? value.cents : 0n;
      }, args);
      const { lines, notes } = composeStateReturn(args as never, evalStateTax);
      return ok({ ok: true, asOf, jurisdiction: args.jurisdiction, lines, ...(notes.length ? { notes } : {}) });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "compute_return",
  {
    description:
      "Compute the COMPLETE Form 1040 bottom-line set in one call — the 17 lines that determine the return (1a, 9, 10, 11, 12e, 15, 16, 17 AMT, 19, 22, 23, 24, 25d, 27a, 28, 32, 33, 34/37), each whole-dollar rounded by the engine. Takes the SAME input as calculate_tax (prefer the documents block: transcribe W-2/1099-R/SSA-1099 boxes and dependent birth dates — SSA-1099s are first-class, box 5 and box 6 are summed for you; the tool derives ages, classifications, Part IV withholding, and penalties deterministically). Never assemble return lines by hand — this tool is the return. TRANSCRIPTION CONVENTIONS: (1) a PRIOR-YEAR Form 1040 in the file supplies CONTINUING conditions the current-year interview omits — the 'Someone can claim: You as a dependent' checkbox and the blindness boxes carry forward unless the current-year data contradicts them; (2) COMMUNITY PROPERTY: do NOT split income 50/50 between MFS spouses when they lived apart all year with no transfers (§ 66(a) allocates earned income to the earner) or when a written separation agreement ended the community — transcribe each document to its named earner; never invent a Form 8958 split the intake does not request; (3) bonus depreciation for assets placed in service 1/1-1/19/2025 is 40% (§ 168(k) pre-OBBBA phase-down; 100% only for property ACQUIRED after 1/19/2025).",
    inputSchema: z.object(individualNestedShape).strict(),
  },
  async (args: Record<string, unknown>) => {
    try {
      const { facts, asOf, documentNotes, w2Box1Cents } = buildFactsValidated(args);
      const get = (target: string): bigint => {
        const { value } = evaluate(corpus, facts, { asOf, target });
        return value.type === "money" ? value.cents : 0n;
      };
      const rd = (c: bigint): bigint => {
        const neg = c < 0n;
        const abs = neg ? -c : c;
        const r = ((abs + 50n) / 100n) * 100n;
        return neg ? -r : r;
      };
      const gross = get("us.federal.gross_income");
      const agi = get("us.federal.agi");
      const deduction = get("us.federal.deduction_election");
      const ti = get("us.federal.taxable_income");
      const tax16 = get("us.federal.income_tax_before_credits");
      const amt = get("us.federal.amt");
      const ctc = get("us.federal.ctc");
      const after = get("us.federal.income_tax_after_credits");
      const other = get("us.federal.other_taxes");
      const eitc = get("us.federal.eitc");
      const actc = get("us.federal.actc");
      const aotcRef = get("us.federal.education.aotc_refundable");
      const refundable = get("us.federal.refundable_credits");
      const wagesFact = facts.wages;
      const wages = wagesFact && wagesFact.type === "money" ? BigInt(wagesFact.value) : 0n;
      const withheldFact = facts.federalTaxWithheld;
      const withheld = withheldFact && withheldFact.type === "money" ? BigInt(withheldFact.value) : 0n;
      const extFact = facts.federalExtensionPayment;
      const extension = extFact && extFact.type === "money" ? BigInt(extFact.value) : 0n;
      const estFact = facts.federalEstimatedPayments;
      const estimated = estFact && estFact.type === "money" ? BigInt(estFact.value) : 0n;
      const total24 = rd(after) + rd(other);
      const payments = rd(withheld) + rd(refundable) + rd(extension) + rd(estimated);
      const balance = payments - total24;
      const { proof } = evaluate(corpus, facts, { asOf, target: "us.federal.net_tax" });
      const d = (c: bigint) => fmt(rd(c));
      return ok({
        ok: true,
        asOf,
        ...(documentNotes.length ? { documentNotes } : {}),
        lines: {
          // Form 1040 line 1a is W-2 box 1 ONLY; anything else folded into the
          // wages fact (e.g. pre-retirement disability per Pub. 525) is line 1h.
          "1a_wages": d(w2Box1Cents ?? wages),
          ...(w2Box1Cents !== undefined && wages > w2Box1Cents
            ? { "1h_other_earned_income": d(wages - w2Box1Cents) }
            : {}),
          "9_total_income": d(gross),
          "10_adjustments": d(gross - agi),
          "11_agi": d(agi),
          "12e_deduction": d(deduction),
          "15_taxable_income": d(ti),
          "16_tax": d(tax16),
          "17_amt": d(amt),
          "19_ctc_odc": d(ctc),
          "22_tax_after_credits": d(after),
          "23_other_taxes": d(other),
          "24_total_tax": fmt(total24),
          "25d_withholding": d(withheld),
          "26_estimated_payments": d(estimated),
          "27a_eitc": d(eitc),
          "28_actc": d(actc),
          "29_aotc_refundable": d(aotcRef),
          "32_refundable_credits": d(refundable),
          ...(extension > 0n ? { "31_other_payments_incl_extension": fmt(rd(extension)) } : {}),
          "33_total_payments": fmt(payments),
          "34_refund_or_37_owed": balance >= 0n ? `refund ${fmt(balance)}` : `owed ${fmt(-balance)}`,
        },
        note: "Lines 9-37 are engine-computed and whole-dollar rounded; senior/tips/overtime/QBI deductions sit between 12e and 15 (lines 13-14). Line 1a is W-2 box 1 ONLY (Form 1040); non-W-2 earned income (e.g. pre-retirement disability) is line 1h. Gross document lines (4a/5a/6a) come from your transcription. Report these numbers as-is.",
        assumptions: proof.assumptions,
        corpusMerkleRoot: proof.corpus.merkleRoot,
      });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "verify_tax_claim",
  {
    description:
      "Verify a claimed tax amount (yours, a user's, or another tool's) against the law. Returns verdict 'verified' or 'refuted' with the correct value. Use this as a self-check before presenting any tax number. Put asOf (and target, if any) INSIDE the facts object — e.g. facts: {..., \"asOf\": \"2025-12-31\"} — otherwise the claim is checked under today's law.",
    inputSchema: z
      .object({
        facts: factsObjectParam,
        claimedAmount: money.describe("the amount to verify (negative = refund)"),
        toleranceDollars: z.number().min(0).optional().describe("default 1"),
      })
      .strict(),
  },
  async (args: Record<string, unknown>) => {
    try {
      const { facts, asOf, target } = buildFactsValidated(args.facts);
      const { value, proof } = evaluate(corpus, facts, { asOf, target });
      const actual = value.type === "money" ? value.cents : 0n;
      const claimed = parseDollars(args.claimedAmount as string | number);
      const tolerance = BigInt(
        Math.round(((args.toleranceDollars as number | undefined) ?? 1) * 100),
      );
      const diff = actual - claimed;
      const abs = diff < 0n ? -diff : diff;
      return ok({
        ok: true,
        verdict: abs <= tolerance ? "verified" : "refuted",
        claimed: fmt(claimed),
        correct: fmt(actual),
        differenceCents: diff.toString(),
        assumptions: proof.assumptions,
        corpusMerkleRoot: proof.corpus.merkleRoot,
      });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "list_input_facts",
  {
    description:
      "Discover every input the tax corpus understands: id, type, whether required, and its documented default. Call this if unsure what information to collect from the user.",
    inputSchema: z.object({}).strict(),
  },
  async () => {
    return ok({
      ok: true,
      facts: corpus.facts.map((f) => ({
        id: f.id,
        type: f.type,
        ...(f.enumValues ? { enumValues: f.enumValues } : {}),
        required: f.default === undefined,
        ...(f.default !== undefined ? { default: f.default.value } : {}),
        description: f.description,
      })),
    });
  },
);

server.registerTool(
  "explain_rule",
  {
    description:
      "Get a tax rule's statutory citation, verbatim excerpt, validity window, parameters, and dependencies. Use to quote the actual law behind an answer.",
    inputSchema: z
      .object({
        ruleId: z
          .string()
          .describe('e.g. "us.federal.standard_deduction" — list via calculate_tax proof or corpus'),
      })
      .strict(),
  },
  async ({ ruleId }) => {
    const versions = corpus.byId.get(ruleId);
    if (!versions) {
      const near = [...corpus.byId.keys()].filter((id) => id.includes(ruleId));
      return fail(
        new Error(`unknown rule "${ruleId}"${near.length ? ` — did you mean: ${near.slice(0, 5).join(", ")}` : ""}`),
      );
    }
    return ok({
      ok: true,
      versions: versions.map((r) => ({
        id: r.id,
        version: r.version,
        title: r.title,
        citation: r.citation,
        effectiveFrom: r.effectiveFrom,
        effectiveTo: r.effectiveTo ?? "open",
        parameters: r.parameters,
        hash: corpus.ruleHashes.get(`${r.id}@${r.version}`),
      })),
    });
  },
);

server.registerTool(
  "find_tax_cliffs",
  {
    description:
      "Find exact dollar amounts where one more cent of an input costs MORE than a cent of tax (marginal rate over 100%) — e.g. the EITC investment-income kill switch, CTC phase-out steps. Every probe is a real evaluation.",
    inputSchema: z
      .object({
        facts: factsObjectParam,
        vary: z.string().describe('money fact to vary, e.g. "wages" or "taxableInterest"'),
        fromDollars: z.number(),
        toDollars: z.number(),
        stepDollars: z.number().optional().describe("coarse scan step, default 1000"),
      })
      .strict(),
  },
  async (args: Record<string, unknown>) => {
    try {
      const { facts, asOf, target } = buildFactsValidated(args.facts);
      const result = findCliffs(corpus, facts, {
        vary: args.vary as string,
        fromCents: BigInt(Math.round((args.fromDollars as number) * 100)),
        toCents: BigInt(Math.round((args.toDollars as number) * 100)),
        stepCents: args.stepDollars
          ? BigInt(Math.round((args.stepDollars as number) * 100))
          : undefined,
        asOf,
        target,
      });
      return ok({
        ok: true,
        cliffs: result.cliffs.map((c) => ({
          at: fmt(c.atCents),
          oneMoreCentCosts: fmt(c.jumpCents),
        })),
        corpusMerkleRoot: result.corpusMerkleRoot,
      });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "compare_filing_statuses",
  {
    description:
      "Compute the answer under every filing status for the same facts — e.g. to answer 'should we file jointly or separately?'. Statuses that need more facts report their error instead of guessing.",
    inputSchema: z.object({ facts: factsObjectParam }).strict(),
  },
  async (args: Record<string, unknown>) => {
    try {
      const { facts, asOf, target } = buildFactsValidated(args.facts);
      const result = compareAcross(corpus, facts, {
        vary: "filingStatus",
        asOf,
        target,
      });
      return ok({
        ok: true,
        scenarios: result.scenarios.map((s) =>
          s.ok
            ? { filingStatus: s.value, result: fmt(s.valueCents!) }
            : { filingStatus: s.value, error: s.errorCode, message: s.errorMessage },
        ),
        corpusMerkleRoot: result.corpusMerkleRoot,
      });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "lookup_tax_parameter",
  {
    description:
      "Look up the current-law dollar amounts behind a question ('standard deduction', 'CTC phase-out threshold', 'tips deduction cap') with their statutory citations and validity windows. Use this to fact-check ANY tax number before stating it — your training data likely predates the OBBBA.",
    inputSchema: z
      .object({
        query: z.string().describe("plain-English search, e.g. 'standard deduction'"),
        asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .strict(),
  },
  async ({ query, asOf }) => {
    const when = asOf ?? new Date().toISOString().slice(0, 10);
    const hits = lookupParameters(corpus, query, when);
    return ok({
      ok: true,
      query,
      asOf: when,
      hits: hits.map((h) => ({
        ruleId: h.ruleId,
        title: h.title,
        citation: h.citation,
        effective: `[${h.effectiveFrom}, ${h.effectiveTo ?? "open"})`,
        byFilingStatus: Object.fromEntries(
          Object.entries(h.byFilingStatus).map(([k, v]) => [k, fmt(BigInt(v))]),
        ),
        parameters: Object.fromEntries(
          Object.entries(h.parameters).map(([k, v]) => [k, fmt(BigInt(v))]),
        ),
      })),
      corpusMerkleRoot: corpus.merkleRoot,
    });
  },
);

server.registerTool(
  "search_tax_rules",
  {
    description:
      "Full-text search over the encoded tax-law corpus ('kiddie tax', 'NIIT threshold', 'california renters credit'). Returns matching rules: id, title, statutory citation, effective window, and a verbatim excerpt of the law text. A hit means the engine computes this; zero hits means it is outside the corpus — say so rather than guessing. Follow up with explain_rule for a hit's full formula, or lookup_tax_parameter for its dollar amounts.",
    inputSchema: z
      .object({
        query: z.string().describe("plain-English search, e.g. 'kiddie tax'"),
        asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
        limit: z.number().int().min(1).max(20).optional(),
      })
      .strict(),
  },
  async ({ query, asOf, limit }) => {
    const hits = searchRules(corpus, query, asOf, limit ?? 8);
    return ok({
      ok: true,
      query,
      ...(asOf ? { asOf } : {}),
      covered: hits.length > 0,
      hits: hits.map((h) => ({
        ruleId: h.ruleId,
        title: h.title,
        jurisdiction: h.jurisdiction,
        citation: `${h.citation.source} ${h.citation.section}`,
        effective: `[${h.effectiveFrom}, ${h.effectiveTo ?? "open"})`,
        excerpt: h.snippet,
        hasDollarParameters: h.hasParameters,
      })),
      corpusMerkleRoot: corpus.merkleRoot,
    });
  },
);

server.registerTool(
  "verify_fact",
  {
    description:
      "Fact-check a claimed dollar amount about tax law ('the 2026 MFJ standard deduction is $32,200', 'CTC is $2,000 per child') against the corpus. Returns verified / refuted (with the correct value and citation) / unknown. Never states a verdict it cannot ground.",
    inputSchema: z
      .object({
        query: z.string().describe("what the amount is, e.g. 'standard deduction'"),
        claimedAmount: money,
        filingStatus: z.enum(["single", "mfj", "mfs", "hoh", "qss"]).optional(),
        asOf: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
      })
      .strict(),
  },
  async ({ query, claimedAmount, filingStatus, asOf }) => {
    try {
      const when = asOf ?? new Date().toISOString().slice(0, 10);
      const result = factCheck(
        corpus,
        query,
        parseDollars(claimedAmount as string | number),
        when,
        filingStatus,
      );
      if (result.verdict === "unknown") {
        return ok({ ok: true, verdict: "unknown", message: result.message });
      }
      if (result.verdict === "verified") {
        return ok({
          ok: true,
          verdict: "verified",
          claimed: fmt(BigInt(result.claimedCents)),
          rule: result.matchedRuleId,
          field: result.matchedField,
          citation: result.citation,
          asOf: when,
          corpusMerkleRoot: corpus.merkleRoot,
        });
      }
      // refuted: no corpus value matches the claim — report the values that
      // DO exist near this query so the agent can state the right number
      const nearby = [
        { rule: result.matchedRuleId, field: result.matchedField, value: fmt(BigInt(result.actualCents)) },
        ...result.alternatives.flatMap((h) => [
          ...Object.entries(h.byFilingStatus).map(([k, v]) => ({
            rule: h.ruleId,
            field: k,
            value: fmt(BigInt(v)),
          })),
          ...Object.entries(h.parameters).map(([k, v]) => ({
            rule: h.ruleId,
            field: k,
            value: fmt(BigInt(v)),
          })),
        ]),
      ].slice(0, 8);
      return ok({
        ok: true,
        verdict: "refuted",
        claimed: fmt(BigInt(result.claimedCents)),
        message:
          "no corpus value near this query equals the claim — the actual values are listed below",
        nearbyValues: nearby,
        citation: result.citation,
        asOf: when,
        corpusMerkleRoot: corpus.merkleRoot,
      });
    } catch (err) {
      return fail(err);
    }
  },
);

server.registerTool(
  "is_tipped_occupation",
  {
    description:
      "Determine whether a job is on the Treasury Tipped Occupation list (Treas. Reg. § 1.224-1, final Apr 2026) for the § 224 'no tax on tips' deduction. Fuzzy-matches the job name; returns the official listing (name, TTC code, category) or a definitive 'not listed'.",
    inputSchema: z
      .object({ job: z.string().describe('e.g. "bartender", "software engineer", "DJ"') })
      .strict(),
  },
  async ({ job }) => {
    const match = matchOccupation(job);
    if ("slug" in match && match.slug !== "other") {
      const o = TIPPED_OCCUPATIONS.find((t) => t.slug === match.slug)!;
      return ok({
        ok: true,
        listed: true,
        occupation: o.name,
        ttcCode: o.code,
        category: o.category,
        citation:
          "Treas. Reg. § 1.224-1 (final rule, IR-2026-49, Apr. 10, 2026)",
        note: "Listing is necessary but not sufficient — tips must also be voluntary/non-negotiated, not from an SSTB employer, and married taxpayers must file jointly. Use calculate_tax or the eligibility rule for the full determination.",
      });
    }
    if ("candidates" in match && match.candidates.length > 0) {
      return ok({
        ok: true,
        listed: "ambiguous",
        candidates: match.candidates,
        note: "Several listed occupations match — ask the user which applies.",
      });
    }
    return ok({
      ok: true,
      listed: false,
      job,
      citation: "Treas. Reg. § 1.224-1 (final rule, IR-2026-49, Apr. 10, 2026)",
      note: "Not on the Treasury Tipped Occupation list — tips from this occupation do not qualify for the § 224 deduction.",
    });
  },
);

return server;
}
