/**
 * INCOMPLETE_RETURN — the strict-mode refusal when a composed return depends
 * on a line the engine could not compute. Same envelope as every other
 * refusal: { code, message, data }, routed on `code`, never on text.
 *
 * Non-strict calls return ok:true with `complete: false` and the same items in
 * `incomplete`, so a pipeline can route on either without reading notes.
 */
import { OpenTaxError } from "@invaro/opentax-core";
import type { IncompleteItem } from "@invaro/opentax-compose";

export class IncompleteReturnError extends OpenTaxError {
  readonly incomplete: IncompleteItem[];
  constructor(incomplete: IncompleteItem[], message?: string) {
    super(
      "INCOMPLETE_RETURN",
      message ??
        `strict mode: the return depends on ${incomplete.length} item(s) this build does not compute: ${incomplete
          .map((i) => `${i.form} ${i.line}`)
          .join("; ")}`,
    );
    this.incomplete = incomplete;
  }
  override data(): Record<string, unknown> {
    return {
      incomplete: this.incomplete,
      hint: "every item names the printed form and line, the reason, and what to do; the non-strict call returns the same list under `incomplete` with complete:false",
    };
  }
}
