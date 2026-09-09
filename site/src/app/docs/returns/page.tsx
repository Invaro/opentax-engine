import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock, InlineCode as C } from "@/components/docs/code-block";

export const metadata: Metadata = { title: "What it returns" };

export default function ReturnsPage() {
  return (
    <>
      <div className="kicker">outputs</div>
      <h1>
        Numbers, lines, <em className="not-italic text-muted-foreground">and the proof.</em>
      </h1>
      <p className="lede">
        The engine is a computation and composition oracle, not filing software. Here is exactly what comes back,
        and the two things that do not.
      </p>

      <h2>Tax totals</h2>
      <p>
        Not only totals. <C>calculate_tax</C> returns the requested target (default <C>us.federal.net_tax</C>,
        negative for a refund) in integer cents, formatted, with every assumption it relied on. Any rule in the
        corpus can be a target: a Schedule 8812 credit, a Form 8995 deduction, an AMT figure.
      </p>

      <h2>Complete line sets</h2>
      <p>
        <strong>Federal:</strong> <C>compute_return</C> emits the Form 1040 bottom-line set, whole-dollar rounded,
        from transcribed W-2, 1099-R, SSA-1099, 1099-NEC, 1099-INT and 1099-DIV boxes: lines 1a, 9, 10, 11, 12e, 15,
        16, 17 (AMT), 19, 22, 23, 24, 25d, 27a, 28, 32, 33, 34/37, plus Part IV withholding and the § 6654 penalty.
        Every other federal item is a <C>calculate_tax</C> target whose proof tree carries the worksheet
        arithmetic, not a printed line set.
      </p>
      <p>
        <strong>State:</strong> <C>compute_state_return</C> emits the printed line set of the full-year-resident
        return for 31 states: every line the form&apos;s totals consume plus the schedule and worksheet lines those
        totals depend on. Vermont&apos;s IN-112 and IN-119, Delaware&apos;s two-column status 4, Montana&apos;s
        capital-gains worksheet. Ten more states compute the tax only. Part-year and nonresident returns are not
        composed anywhere.
      </p>
      <CodeBlock
        lang="compute_state_return · excerpt"
        code={`{
  "ok": true,
  "asOf": "2025-12-31",
  "jurisdiction": "vt",
  "lines": {
    "1": "$62,000",
    "4": "$7,650",
    "5": "$5,300",
    "7": "$49,050",
    "8": "$1,576",
    …
  },
  "notes": [
    "Line 8: Vermont Tax Table (taxable income under $75,000; the table is mandatory)",
    …
  ],
  "corpusMerkleRoot": "sha256:…"
}`}
      />

      <h2>Calculation proofs and citations</h2>
      <p>
        Every rule carries a statutory or form citation with a verbatim excerpt. Every computing response carries{" "}
        <C>corpusMerkleRoot</C> and <C>artifactHash</C>; pass <C>includeProof: true</C> to <C>calculate_tax</C>,{" "}
        <C>compute_return</C>, <C>calculate_business_tax</C>, <C>calculate_fiduciary_tax</C> or <C>determine_dependent</C> and the response
        also carries <C>proof</C>, the full artifact (about 200 KB): every applied rule, every input, every assumption,
        every rounding, hashed under the corpus Merkle root so the derivation verifies offline months later. The format
        is specified so a third party can write an independent checker:{" "}
        <a href="https://github.com/Invaro/opentax-engine/blob/main/docs/PROOF-FORMAT.md">PROOF-FORMAT.md</a>.{" "}
        <C>explain_rule</C> returns any rule&apos;s formula and law text on its own.
      </p>
      <CodeBlock
        lang="bash"
        code={`# ask the API for the proof, then verify it byte for byte with the CLI
curl -s https://opentax.invaro.ai/v1/tools/calculate_tax -H "Content-Type: application/json" \\
  -d '{"filing":{"filingStatus":"mfj"},"income":{"wages":120000},"credits":{"qualifyingChildren":2},"asOf":"2025-12-31","includeProof":true}' \\
  | jq .proof > proof.json
npx -y @invaro/opentax verify proof.json`}
      />

      <h2>Rendered forms, PDF</h2>
      <p>
        <strong>No.</strong> The engine produces line values, not filled PDFs.
      </p>

      <h2>MeF XML</h2>
      <p>
        <strong>No.</strong> No MeF schema binding, no XML, no transmission. Your own MeF packaging consumes the
        line sets.
      </p>

      <h2>Two consequences for a filing pipeline</h2>
      <ol>
        <li>
          Everything downstream of &quot;here are the correct line values, with proof&quot; is yours: the return
          document, the MeF payload, acknowledgments.
        </li>
        <li>
          Coverage is explicit and refusals are loud. Outside the corpus the call fails with a named code and says
          what is missing. It never estimates. The <Link href="/docs/coverage">coverage matrix</Link> is the whole
          list.
        </li>
      </ol>
    </>
  );
}
