// Add your own rules without restating ours.
import { coerceFacts, evaluate } from "@invaro/opentax-core";
import { EXTENSION_POINTS, extendCorpus, getCorpus } from "@invaro/opentax-corpus-us-federal";

export function run() {
  const corpus = extendCorpus({
    name: "@yourfirm/opentax-rules",
    version: "1.0.0",
    facts: [
      {
        id: "firmJuryDutyPayRemitted",
        type: "money",
        min: "0",
        description: "Jury duty pay you gave to your employer (Schedule 1 line 24a). In dollars.",
        default: { value: "0", rationale: "Assumed no jury duty pay remitted" },
      },
    ],
    rules: [
      {
        id: "firm.jury_duty_pay_remitted",
        version: 1,
        jurisdiction: "us.federal",
        title: "Jury duty pay given to the employer",
        citation: { source: "26 U.S.C. § 62(a)(13)", section: "§ 62(a)(13)", url: "https://www.law.cornell.edu/uscode/text/26/62", excerpt: "jury pay remitted to the taxpayer's employer" },
        effectiveFrom: "2025-01-01",
        output: { type: "money" },
        formula: { kind: "fact", factId: "firmJuryDutyPayRemitted" },
        contributesTo: "us.federal.above_the_line_adjustments", // one of EXTENSION_POINTS
      },
    ],
  });

  const agi = (c, extra) =>
    evaluate(c, coerceFacts(c, { filingStatus: "single", wages: 60000, ...extra }), { asOf: "2025-12-31", target: "us.federal.agi" });

  const ours = agi(getCorpus(), {});
  const yours = agi(corpus, { firmJuryDutyPayRemitted: 400 });

  return {
    extensionPoints: Object.keys(EXTENSION_POINTS),
    agiWithout: ours.value.cents,
    agiWith: yours.value.cents, // $400 lower
    corpus: yours.proof.corpus, // "<ours>+<yours>", with its own Merkle root
    differentRoot: yours.proof.corpus.merkleRoot !== ours.proof.corpus.merkleRoot,
  };
}

// Replacing one of our rules needs a pin to the exact version you built against.
export function overrideWithStalePin() {
  try {
    extendCorpus({
      name: "@yourfirm/opentax-rules",
      version: "1.0.0",
      rules: [
        {
          id: "firm.standard_deduction",
          version: 1,
          jurisdiction: "us.federal",
          title: "Firm's standard deduction",
          citation: { source: "example", section: "example", url: "https://example.com", excerpt: "example" },
          effectiveFrom: "2025-01-01",
          output: { type: "money" },
          formula: { kind: "money", cents: "0" },
          overrides: { ruleId: "us.federal.standard_deduction", priority: 50 },
          applicability: { kind: "bool", value: true },
        },
      ],
      pins: { "us.federal.standard_deduction@1": "sha256:0000000000000000000000000000000000000000000000000000000000000000" },
    });
    return "loaded";
  } catch (e) {
    return { code: e.code, issues: e.data().issues ?? e.message };
  }
}
