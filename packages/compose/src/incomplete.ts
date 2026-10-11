/**
 * The completeness contract.
 *
 * A composed line set is either COMPLETE (every line the return depends on was
 * computed) or it carries a machine-readable list of what could not be, with
 * the printed line it affects. A caller that needs a finished return routes on
 * `incomplete.length` (or asks for strict mode and routes on the
 * INCOMPLETE_RETURN error code) — never on note text.
 */

export type IncompleteCode =
  /** the rule exists but has no version valid on asOf (a tax year's amounts not yet published / encoded) */
  | "UNPUBLISHED"
  /** the corpus has no rule for this item at all; the caller must compute it */
  | "NOT_COMPUTED";

export interface IncompleteItem {
  code: IncompleteCode;
  /** printed form the line belongs to, e.g. "Form 1040", "Schedule 3", "VT IN-111" */
  form: string;
  /** printed line reference, e.g. "11", "line 4 (standard deduction)" */
  line: string;
  /** what the line holds */
  item: string;
  /** why it was not computed */
  reason: string;
  /** what the caller should do */
  action: string;
  /** corpus target that refused, when one exists */
  target?: string;
  /** the amount involved when it is known (dollars, formatted) */
  amount?: string;
  /** keys in `lines` whose figures exclude this item */
  affectedLines?: string[];
  /** how the affected line is rendered in `lines` while the item is outstanding */
  rendered?: string;
}

// Composers receive a `notes: string[]` channel; the structured items ride
// alongside it, keyed by that very array, so no composer signature changes and
// nothing leaks between calls.
const SINK = new WeakMap<string[], IncompleteItem[]>();

export function incompleteItems(notes: string[]): IncompleteItem[] {
  let items = SINK.get(notes);
  if (!items) {
    items = [];
    SINK.set(notes, items);
  }
  return items;
}

/**
 * Record a line a composer could not fill because its target has no rule
 * valid on asOf. Pushes the human note AND the structured item; returns null
 * so a composer can write `tryEval(...) ?? 0n` exactly as before.
 */
export function markUnpublished(
  notes: string[],
  p: { form: string; line: string; target: string; note: string; rendered?: string; action?: string },
): null {
  notes.push(p.note);
  incompleteItems(notes).push({
    code: "UNPUBLISHED",
    form: p.form,
    line: p.line,
    item: p.line,
    target: p.target,
    reason: `${p.target} has no applicable rule as of this date — this tax year's amount is not yet published or encoded`,
    action: p.action ?? "re-run once the year's forms publish; until then this line set is not a complete return",
    rendered: p.rendered ?? "$0.00 placeholder",
  });
  return null;
}

/**
 * Thrown by a composer when a line it cannot fill makes every downstream line
 * wrong (e.g. the standard deduction) — a $0 placeholder would be a silent
 * wrong answer, so the whole return refuses. The server maps it to the
 * INCOMPLETE_RETURN envelope in strict and non-strict mode alike.
 */
export class IncompleteReturnRefusal extends Error {
  readonly code = "INCOMPLETE_RETURN";
  readonly incomplete: IncompleteItem[];
  constructor(message: string, incomplete: IncompleteItem[]) {
    super(message);
    this.name = "IncompleteReturnRefusal";
    this.incomplete = incomplete;
  }
}

export const isIncompleteReturnRefusal = (err: unknown): err is IncompleteReturnRefusal =>
  err instanceof Error && (err as { code?: unknown }).code === "INCOMPLETE_RETURN" && Array.isArray((err as { incomplete?: unknown }).incomplete);
