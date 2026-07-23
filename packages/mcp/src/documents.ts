/**
 * Document compiler — deterministic transcription-to-facts.
 *
 * Every agent-variance failure observed in evaluation runs happened where the
 * MCP accepted a pre-digested JUDGMENT instead of a raw document value: a
 * dependent pre-classified from a checkbox label, a Form 8959 Part IV
 * reconciliation left to mental arithmetic, a penalty decided from a payer's
 * box code, a documented amount deleted as "anomalous". This module moves
 * those derivations into code: agents transcribe boxes and dates; the
 * compiler classifies, sums, reconciles, and DISCLOSES — and it throws
 * loudly if the same value arrives both raw and pre-digested.
 */

import { z } from "zod";

const usd = z.union([z.number(), z.string()]).describe('dollars, e.g. 50000 or "1234.56"');
const dob = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("date of birth, YYYY-MM-DD");

export const documentsShape = z
  .object({
    taxpayerDateOfBirth: dob
      .optional()
      .describe("derives age-based facts (65+, 25-64 EITC window, 50/55 catch-ups, 59½ penalty)"),
    spouseDateOfBirth: dob.optional(),
    w2s: z
      .array(
        z
          .object({
            box1: usd.describe("wages, tips, other compensation"),
            box2: usd.optional().describe("federal income tax withheld"),
            box3: usd.optional().describe("social security wages"),
            box5: usd.optional().describe("Medicare wages and tips"),
            box6: usd.optional().describe("Medicare tax withheld — Part IV excess over 1.45% of box 5 is added to withholding automatically"),
            box17: usd.optional().describe("state income tax withheld — surfaced as a SALT note; enter in itemized.stateAndLocalTaxesPaid yourself if itemizing"),
          })
          .strict(),
      )
      .optional()
      .describe("one entry per W-2, boxes transcribed verbatim"),
    f1099rs: z
      .array(
        z
          .object({
            box1: usd.describe("gross distribution"),
            box2a: usd.describe("taxable amount (0 if fully rolled over / converted basis applied via ira8606)"),
            box4: usd.optional().describe("federal income tax withheld"),
            box7: z.string().describe('distribution code(s), e.g. "1", "7", "4", "G", "3", "C"'),
            iraSepSimple: z.boolean().optional().describe("the IRA/SEP/SIMPLE checkbox"),
            recipient: z.enum(["taxpayer", "spouse"]).optional().describe("whose distribution (for the age-based penalty test); default taxpayer"),
            rolledOver: z.boolean().optional().describe("interview-confirmed full rollover (e.g. 'distributions less rollovers = 0') — excluded from taxable income regardless of box 2a"),
            disabilityBeforeRetirementAge: z.boolean().optional().describe("code-3 disability received before minimum retirement age — reported as WAGES (Pub. 525) and counted as § 22 disability income"),
          })
          .strict(),
      )
      .optional()
      .describe("one entry per 1099-R; routing, penalty, and rollover handling are computed, not judged"),
    ssa1099s: z
      .array(
        z
          .object({
            box5: usd.describe("net benefits (box 5) — includible amount computed by the § 86 0/50/85% formula, not judged here"),
            box6: usd.optional().describe("voluntary federal income tax withheld"),
          })
          .strict(),
      )
      .optional()
      .describe("one entry per SSA-1099 (or RRB-1099 tier-1 equivalent); box 5 sums into socialSecurityBenefits, box 6 into withholding"),
    f1099necs: z
      .array(
        z
          .object({
            box1: usd.describe("nonemployee compensation (gross)"),
            box4: usd.optional().describe("federal income tax withheld"),
          })
          .strict(),
      )
      .optional()
      .describe("one entry per 1099-NEC; box 1 sums into Schedule C gross receipts and nets against scheduleCExpensesTotal"),
    f1099ks: z
      .array(
        z
          .object({
            box1a: usd.describe("gross amount of payment card / third-party network transactions"),
            box4: usd.optional().describe("federal income tax withheld"),
          })
          .strict(),
      )
      .optional()
      .describe("one entry per 1099-K (business receipts); box 1a sums into Schedule C gross receipts alongside 1099-NECs"),
    scheduleCExpensesTotal: usd
      .optional()
      .describe("TOTAL Schedule C expenses to net against the 1099-NEC/1099-K gross receipts (one business; the taxpayer's own expense total, transcribed not judged)"),
    f1099ints: z
      .array(
        z
          .object({
            box1: usd.optional().describe("interest income"),
            box3: usd.optional().describe("U.S. Treasury/savings-bond interest — federally taxable (state-exempt; noted)"),
            box4: usd.optional().describe("federal income tax withheld"),
            box8: usd.optional().describe("tax-exempt interest (municipal) — feeds § 86 provisional income, not taxable income"),
          })
          .strict(),
      )
      .optional()
      .describe("one entry per 1099-INT; boxes 1+3 sum into taxableInterest, box 8 into taxExemptInterest"),
    f1099divs: z
      .array(
        z
          .object({
            box1a: usd.describe("total ordinary dividends (INCLUDES box 1b)"),
            box1b: usd.optional().describe("qualified dividends (subset of 1a)"),
            box2a: usd.optional().describe("total capital gain distributions — long-term by statute (§ 852(b)(3)(B)), summed into the LT bucket"),
            box4: usd.optional().describe("federal income tax withheld"),
          })
          .strict(),
      )
      .optional()
      .describe("one entry per 1099-DIV; the compiler performs the 1a-minus-1b split the fact model expects and errors if 1b exceeds 1a"),
    f1099bs: z
      .array(
        z
          .object({
            proceeds: usd.describe("box 1d proceeds"),
            basis: usd.describe("box 1e cost or other basis"),
            term: z.enum(["short", "long"]).describe("holding period per the form's Part I/II section"),
            washSaleLossDisallowed: usd.optional().describe("box 1g — disallowed loss added back to this lot's result"),
            box4: usd.optional().describe("federal income tax withheld"),
          })
          .strict(),
      )
      .optional()
      .describe("one entry per 1099-B lot or summary line; per-bucket ST/LT results are netted here and the engine's § 1222 Schedule D netting rules do the cross-bucket math"),
    f1099gs: z
      .array(
        z
          .object({
            box1: usd.optional().describe("unemployment compensation"),
            box2: usd.optional().describe("state/local income tax refund — NOT auto-included (taxable only if it produced a benefit when itemizing the prior year, § 111); surfaced as a note"),
            box4: usd.optional().describe("federal income tax withheld"),
          })
          .strict(),
      )
      .optional()
      .describe("one entry per 1099-G; box 1 sums into unemploymentCompensation"),
    dependents: z
      .array(
        z
          .object({
            dateOfBirth: dob,
            relationship: z
              .enum(["child_or_descendant", "sibling_or_descendant", "parent_or_other_relative"])
              .optional()
              .describe(
                "§ 152(c)(2) lineage: children/grandchildren and siblings/nieces/nephews can be QUALIFYING CHILDREN; a parent or other relative can only be a qualifying RELATIVE (ODC, never CTC/EIC-child). TRANSCRIBE the document's own label: son/daughter/grandchild/foster/sibling/niece → child_or_descendant or sibling_or_descendant; an explicit 'other' relationship on a source form → parent_or_other_relative (never default it back to child lineage). The child_or_descendant default is ONLY for documents that state a child relationship or say nothing at all.",
              ),
            isPermanentlyDisabled: z.boolean().optional(),
            isFullTimeStudent: z.boolean().optional(),
            hasRequiredSSN: z.boolean().optional().describe("default true"),
            monthsLivedWithTaxpayer: z.number().int().min(0).max(12).optional().describe("default 12"),
          })
          .strict(),
      )
      .optional()
      .describe("one entry per dependent, RAW facts — CTC vs ODC vs EIC-child vs CDCC classification is computed from the statute's age tests, never from intake checkbox labels"),
  })
  .strict()
  .describe(
    "RAW document transcription (preferred over hand-mapped facts): W-2 boxes, 1099-R boxes/codes, SSA-1099 boxes, dependents' birth dates. SSA-1099s are first-class: box 5 sums into socialSecurityBenefits and box 6 into withholding, so the § 86 taxable-benefits worksheet runs on the transcribed total instead of a hand-mapped guess. The tool derives wages/withholding (incl. Form 8959 Part IV), box-3/5 wage coordination, dependent classifications, age facts, and early-distribution penalties deterministically — and errors if the same value is also passed as a hand-mapped fact.",
  );

type Docs = z.infer<typeof documentsShape>;

const toCents = (v: number | string): bigint => {
  const s = typeof v === "number" ? v.toFixed(2) : String(v).replace(/[$,]/g, "");
  const m = /^(-?)(\d+)(?:\.(\d{1,2}))?$/.exec(s);
  if (!m) throw new Error(`not a dollar amount: ${JSON.stringify(v)}`);
  const cents = BigInt(m[2]) * 100n + BigInt((m[3] ?? "0").padEnd(2, "0"));
  return m[1] === "-" ? -cents : cents;
};
const dollars = (c: bigint): string => `${c / 100n}.${(c % 100n < 0n ? -(c % 100n) : c % 100n).toString().padStart(2, "0")}`;

/** Age attained by the close of the tax year (IRS born-before-Jan-2 rule for 65). */
function ageAtYearEnd(dobStr: string, taxYear: number): number {
  const [y, m, d] = dobStr.split("-").map(Number);
  // attained age N during the tax year if birthday (y+N) falls on or before Dec 31;
  // the Jan-1 birthday counts as attained the day before (prior tax year)
  let age = taxYear - y;
  if (m === 1 && d === 1) return age; // Jan 1: deemed attained Dec 31 of prior year — age already counts
  return age;
}
/** Age in years (with the half-year test) on the last day of the tax year. */
function ageYearsExact(dobStr: string, taxYear: number): number {
  const [y, m, d] = dobStr.split("-").map(Number);
  const end = Date.UTC(taxYear, 11, 31);
  const birth = Date.UTC(y, m - 1, d);
  return (end - birth) / (365.25 * 24 * 3600 * 1000);
}

export interface CompiledDocs {
  facts: Record<string, unknown>;
  notes: string[];
  /** Sum of W-2 box 1 in cents — Form 1040 line 1a is W-2 box 1 ONLY; any other
   * amount folded into the wages fact (e.g. pre-retirement disability, Pub. 525)
   * is line 1h other earned income. */
  w2Box1Cents: bigint;
}

export function compileDocuments(docs: Docs, asOf: string): CompiledDocs {
  const taxYear = Number(asOf.slice(0, 4));
  const sums: Record<string, bigint> = {};
  const ints: Record<string, number> = {};
  const bools: Record<string, boolean> = {};
  const notes: string[] = [];
  const add = (id: string, c: bigint) => {
    sums[id] = (sums[id] ?? 0n) + c;
  };

  // --- taxpayer / spouse ages -----------------------------------------------
  const born65Cutoff = (dobStr: string) => ageAtYearEnd(dobStr, taxYear) >= 65;
  if (docs.taxpayerDateOfBirth) {
    const age = ageAtYearEnd(docs.taxpayerDateOfBirth, taxYear);
    bools.isAge65OrOlder = born65Cutoff(docs.taxpayerDateOfBirth);
    bools.isAtLeastAge25 = age >= 25;
    bools.isAge50OrOlder = age >= 50;
    bools.isAge55OrOlder = age >= 55;
    notes.push(`taxpayer age at year end: ${age} (from ${docs.taxpayerDateOfBirth})`);
  }
  if (docs.spouseDateOfBirth) {
    bools.spouseIsAge65OrOlder = born65Cutoff(docs.spouseDateOfBirth);
    notes.push(`spouse age at year end: ${ageAtYearEnd(docs.spouseDateOfBirth, taxYear)} (from ${docs.spouseDateOfBirth})`);
  }

  // --- W-2s -------------------------------------------------------------------
  const multiW2 = (docs.w2s ?? []).length > 1;
  if (multiW2 && (docs.w2s ?? []).some((w) => w.box3 !== undefined)) {
    notes.push(
      "MULTIPLE W-2s: box-3 sums are NOT set as socialSecurityWages (Schedule SE coordination is PER PERSON — if there is self-employment income, set income.socialSecurityWages to the SE-earner's OWN box 3 yourself)",
    );
  }
  let w2Box1Cents = 0n;
  for (const [i, w] of (docs.w2s ?? []).entries()) {
    add("wages", toCents(w.box1));
    w2Box1Cents += toCents(w.box1);
    if (w.box2 !== undefined) add("federalTaxWithheld", toCents(w.box2));
    if (w.box3 !== undefined && !multiW2) add("socialSecurityWages", toCents(w.box3));
    if (w.box5 !== undefined) {
      const b5 = toCents(w.box5);
      add("medicareWages", b5);
      if (w.box6 !== undefined && b5 > 20000000n) {
        // Form 8959 Part IV: withholding over 1.45% of box 5 is
        // Additional-Medicare-Tax withholding → credited on line 25.
        // Only engaged above the $200,000 employer-withholding trigger
        // (§ 3102(f)) — below it, tiny box-6 excesses are rounding noise
        const regular = (b5 * 145n + 5000n) / 10000n; // 1.45%, half-up
        const excess = toCents(w.box6) - regular;
        if (excess > 0n) {
          add("federalTaxWithheld", excess);
          notes.push(`W-2 #${i + 1}: Form 8959 Part IV — box 6 exceeds 1.45% of box 5 by $${dollars(excess)}; added to withholding`);
        }
      }
    }
    if (w.box17 !== undefined && toCents(w.box17) > 0n) {
      notes.push(`W-2 #${i + 1}: box 17 state income tax $${dollars(toCents(w.box17))} is DOCUMENTED — include in itemized.stateAndLocalTaxesPaid if itemizing; do not discard it as anomalous`);
    }
  }

  // --- 1099-Rs ----------------------------------------------------------------
  const PENALTY_EXEMPT_CODES = new Set(["2", "3", "4", "7", "G", "H", "Q", "T", "C"]);
  for (const [i, r] of (docs.f1099rs ?? []).entries()) {
    if (r.box4 !== undefined) add("federalTaxWithheld", toCents(r.box4));
    const taxable = toCents(r.box2a);
    if (r.rolledOver || r.box7.toUpperCase().includes("G")) {
      notes.push(`1099-R #${i + 1}: treated as ROLLOVER (${r.rolledOver ? "interview-confirmed" : "code G"}) — gross on 4a/5a only, $0 taxable`);
      continue;
    }
    if (r.disabilityBeforeRetirementAge) {
      add("wages", taxable);
      add("scheduleRDisabilityIncome", taxable);
      notes.push(`1099-R #${i + 1}: code-3 disability before minimum retirement age — $${dollars(taxable)} reported as WAGES (Pub. 525, Form 1040 line 1h — NOT line 1a, which is W-2 box 1 only) and counted as § 22 disability income`);
      continue;
    }
    if (r.iraSepSimple) add("taxableIraDistributions", taxable);
    else add("taxablePensionsAndAnnuities", taxable);
    // § 72(t): the penalty is an AGE question, not a box-code question
    const dobStr = r.recipient === "spouse" ? docs.spouseDateOfBirth : docs.taxpayerDateOfBirth;
    const code = r.box7.toUpperCase();
    if ([...code].some((c) => c === "1")) {
      if (dobStr && ageYearsExact(dobStr, taxYear) >= 59.5) {
        notes.push(`1099-R #${i + 1}: payer code 1 (early) but the ${r.recipient ?? "taxpayer"} is over 59½ — no § 72(t) penalty (age controls, not the box code)`);
      } else if ([...code].every((c) => !PENALTY_EXEMPT_CODES.has(c))) {
        add("earlyDistributionSubjectToPenalty", taxable);
        notes.push(`1099-R #${i + 1}: code 1 and no age exception established — $${dollars(taxable)} subject to the 10% § 72(t) tax`);
      }
    }
  }

  // --- SSA-1099s ----------------------------------------------------------------
  for (const s of docs.ssa1099s ?? []) {
    add("socialSecurityBenefits", toCents(s.box5));
    if (s.box6 !== undefined) add("federalTaxWithheld", toCents(s.box6));
  }

  // --- 1099-NEC / 1099-K → Schedule C ------------------------------------------
  let seGross = 0n;
  for (const n of docs.f1099necs ?? []) {
    seGross += toCents(n.box1);
    if (n.box4 !== undefined) add("federalTaxWithheld", toCents(n.box4));
  }
  for (const k of docs.f1099ks ?? []) {
    seGross += toCents(k.box1a);
    if (k.box4 !== undefined) add("federalTaxWithheld", toCents(k.box4));
  }
  if (seGross > 0n || docs.scheduleCExpensesTotal !== undefined) {
    const expenses = docs.scheduleCExpensesTotal !== undefined ? toCents(docs.scheduleCExpensesTotal) : 0n;
    const net = seGross - expenses;
    if (net >= 0n) {
      if (net > 0n) add("selfEmploymentNetProfit", net);
      notes.push(
        `Schedule C: $${dollars(seGross)} gross (1099-NEC/K) − $${dollars(expenses)} expenses = $${dollars(net)} net profit → SE tax + QBI machinery engage on it`,
      );
    } else {
      add("scheduleCNetLoss", -net);
      notes.push(`Schedule C: expenses exceed 1099-NEC/K gross by $${dollars(-net)} — recorded as scheduleCNetLoss`);
    }
  }

  // --- 1099-INTs ----------------------------------------------------------------
  for (const [i, t] of (docs.f1099ints ?? []).entries()) {
    if (t.box1 !== undefined) add("taxableInterest", toCents(t.box1));
    if (t.box3 !== undefined && toCents(t.box3) > 0n) {
      add("taxableInterest", toCents(t.box3));
      notes.push(`1099-INT #${i + 1}: box 3 Treasury interest $${dollars(toCents(t.box3))} is federally taxable (state returns exempt it — the state composers handle that subtraction)`);
    }
    if (t.box8 !== undefined) add("taxExemptInterest", toCents(t.box8));
    if (t.box4 !== undefined) add("federalTaxWithheld", toCents(t.box4));
  }

  // --- 1099-DIVs (the 1a-minus-1b split the fact model expects) ------------------
  for (const [i, d] of (docs.f1099divs ?? []).entries()) {
    const total = toCents(d.box1a);
    const qualified = d.box1b !== undefined ? toCents(d.box1b) : 0n;
    if (qualified > total) {
      throw new Error(`1099-DIV #${i + 1}: box 1b (qualified, $${dollars(qualified)}) exceeds box 1a (total, $${dollars(total)}) — transcription error`);
    }
    if (qualified > 0n) add("qualifiedDividends", qualified);
    if (total - qualified > 0n) add("ordinaryDividends", total - qualified);
    if (d.box2a !== undefined && toCents(d.box2a) > 0n) {
      add("__ltProceeds", toCents(d.box2a)); // capital gain distributions: LT by statute, join the 1099-B LT bucket
      notes.push(`1099-DIV #${i + 1}: box 2a capital gain distributions $${dollars(toCents(d.box2a))} — long-term by statute (§ 852(b)(3)(B)), joined to the Schedule D long-term bucket`);
    }
    if (d.box4 !== undefined) add("federalTaxWithheld", toCents(d.box4));
  }

  // --- 1099-Bs → per-bucket net results; the § 1222 corpus rules cross-net -------
  let stNet = 0n;
  let ltNet = sums.__ltProceeds ?? 0n;
  delete sums.__ltProceeds;
  let sawB = (docs.f1099bs ?? []).length > 0 || ltNet !== 0n;
  for (const b of docs.f1099bs ?? []) {
    let lot = toCents(b.proceeds) - toCents(b.basis);
    if (b.washSaleLossDisallowed !== undefined) lot += toCents(b.washSaleLossDisallowed);
    if (b.term === "short") stNet += lot;
    else ltNet += lot;
    if (b.box4 !== undefined) add("federalTaxWithheld", toCents(b.box4));
  }
  if (sawB) {
    if (stNet > 0n) add("shortTermCapitalGains", stNet);
    else if (stNet < 0n) add("shortTermCapitalLoss", -stNet);
    if (ltNet > 0n) add("longTermCapitalGains", ltNet);
    else if (ltNet < 0n) add("longTermCapitalLoss", -ltNet);
    notes.push(
      `Schedule D buckets from 1099-B/DIV: short-term net $${dollars(stNet)}, long-term net $${dollars(ltNet)} — the § 1222 netting rules combine them (character preserved, § 1211(b) caps any overall loss)`,
    );
  }

  // --- 1099-Gs ----------------------------------------------------------------
  for (const [i, g] of (docs.f1099gs ?? []).entries()) {
    if (g.box1 !== undefined) add("unemploymentCompensation", toCents(g.box1));
    if (g.box4 !== undefined) add("federalTaxWithheld", toCents(g.box4));
    if (g.box2 !== undefined && toCents(g.box2) > 0n) {
      notes.push(
        `1099-G #${i + 1}: box 2 state refund $${dollars(toCents(g.box2))} NOT auto-included — taxable only to the extent the prior-year SALT deduction produced a benefit (§ 111); add it to otherOrdinaryIncome yourself if it did`,
      );
    }
  }

  // --- dependents: statute tests, not checkbox labels --------------------------
  for (const dep of docs.dependents ?? []) {
    const age = ageAtYearEnd(dep.dateOfBirth, taxYear);
    const disabled = dep.isPermanentlyDisabled === true;
    const student = dep.isFullTimeStudent === true;
    const ssn = dep.hasRequiredSSN !== false;
    const months = dep.monthsLivedWithTaxpayer ?? 12;
    // § 152(c)(2): only child/descendant or sibling/descendant lineage can be
    // a qualifying child — a PARENT can never be one (EIC-child included)
    const childLineage = (dep.relationship ?? "child_or_descendant") !== "parent_or_other_relative";
    if (months <= 6 && !disabled) {
      notes.push(`dependent (b. ${dep.dateOfBirth}): lived ≤6 months — residency test not met, excluded (divorced-parents release etc. via determine_dependent)`);
      continue;
    }
    if (!childLineage) {
      ints.otherDependents = (ints.otherDependents ?? 0) + 1;
      if (disabled) ints.careQualifyingIndividuals = (ints.careQualifyingIndividuals ?? 0) + 1;
      notes.push(`dependent (b. ${dep.dateOfBirth}, parent/other relative): qualifying RELATIVE — $500 ODC only, never a CTC/EIC qualifying child (§ 152(c)(2))${disabled ? "; CDCC-qualifying (incapable of self-care)" : ""}`);
      continue;
    }
    if (age < 17 && ssn) {
      ints.qualifyingChildren = (ints.qualifyingChildren ?? 0) + 1;
      notes.push(`dependent (b. ${dep.dateOfBirth}, age ${age}): CTC qualifying child — § 24(c) age test controls regardless of any intake 'other dependent' checkbox`);
    } else {
      ints.otherDependents = (ints.otherDependents ?? 0) + 1;
      // EIC qualifying child has WIDER age rules than the CTC
      if (age < 19 || (age < 24 && student) || disabled) {
        ints.eitcAdditionalQualifyingChildren = (ints.eitcAdditionalQualifyingChildren ?? 0) + 1;
        notes.push(`dependent (b. ${dep.dateOfBirth}, age ${age}): $500 ODC for the CTC, but an EIC qualifying child (§ 32(c)(3): ${disabled ? "disabled, any age" : student ? "student under 24" : "under 19"})`);
      }
    }
    if (age < 13 || disabled) {
      ints.careQualifyingIndividuals = (ints.careQualifyingIndividuals ?? 0) + 1;
    }
  }

  const facts: Record<string, unknown> = { ...bools };
  for (const [id, c] of Object.entries(sums)) facts[id] = dollars(c);
  for (const [id, n] of Object.entries(ints)) facts[id] = n;
  return { facts, notes, w2Box1Cents };
}
