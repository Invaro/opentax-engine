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

      <h2>Federal scope in three buckets</h2>
      <p>Every federal item falls into exactly one of these. The <Link href="/docs/coverage">coverage matrix</Link> lists the rules; this is the form-level view an integrator needs.</p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>bucket</th>
              <th>what you get</th>
              <th>today</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Complete line set</td>
              <td>Machine-readable printed-form lines, whole-dollar rounded, composed by the engine.</td>
              <td>Form 1040 bottom-line set (lines 1a to 37); 31 state resident returns.</td>
            </tr>
            <tr>
              <td>Calculated target, no printed schedule</td>
              <td>The correct amount with a cited proof tree, which you place on the schedule yourself.</td>
              <td>
                Schedules A, SE, 1, 2, 3; Forms 8812, 8863, 8995, 6251, 8960, 8959, 2210, 8615, 8606, 8582, 2555, 8962, 8880, 8839;
                Schedule R; <strong>Schedule H</strong> (<C>us.federal.household_employment_taxes</C>: the tax, not the printed
                schedule lines); Form 1120 items.
              </td>
            </tr>
            <tr>
              <td>Not covered</td>
              <td>No rule in the corpus; the engine refuses rather than approximates.</td>
              <td>
                <strong>Form 5695</strong> (residential energy credits); Schedule 3 line 11 excess social security withholding;
                Form 1065 and Schedule K-1 preparation; Form 990; part-year and nonresident state returns; PDF and MeF output.
                Any of these can be scheduled as a priced deliverable.
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Whole-dollar rounding, missing boxes, strict mode</h2>
      <p>
        <C>compute_return</C> follows the Form 1040 instructions on rounding: document amounts are summed in cents
        first, then every money input is rounded to the nearest dollar (50 cents up) before any computation, so line
        15 and the Tax Table row are always the same number and document order can never change a result. The
        rounding is disclosed in <C>documentNotes</C>. <C>calculate_tax</C> computes in exact cents; it is a
        calculator, not a return.
      </p>
      <p>
        A transcribed document that omits a box the return depends on (a W-2 without box 2) is treated as $0 and
        named in <C>documentNotes</C>. Pass <C>strict: true</C> to refuse instead: the response is{" "}
        <C>NEEDS_FACTS</C> with <C>error.data.missing</C> listing each box by path, so an unknown withholding is never
        finalised into a refund or balance due. W-2 box 4 (social security tax withheld) is accepted and recorded;
        the Schedule 3 line 11 excess-withholding credit across several employers is not computed and a note says so.
      </p>

      <h2>Build identity</h2>
      <p>
        Every response carries <C>versions</C>: the engine, the composer (this server) and the corpus version with
        its Merkle root. Pin all three. The corpus changes when tax law or a state pack changes; the composer
        changes when a line-composition behaviour changes (this page is composer 0.5.0); the engine changes when
        evaluation semantics change.
      </p>

      <h2>Calculation proofs and citations</h2>
      <p>
        Every rule carries a statutory or form citation with a verbatim excerpt. Every computing response carries{" "}
        <C>corpusMerkleRoot</C> and <C>artifactHash</C>; pass <C>includeProof: true</C> to <C>calculate_tax</C>,{" "}
        <C>compute_return</C>, <C>calculate_business_tax</C>, <C>calculate_fiduciary_tax</C> or <C>determine_dependent</C> and the response
        also carries <C>proof</C>, the full artifact (about 200 KB): every applied rule, every input, every assumption,
        every rounding, hashed under the corpus Merkle root so the derivation verifies offline months later. On{" "}
        <C>compute_return</C> the artifact covers the <C>us.federal.net_tax</C> derivation (lines 9 to 24) and the
        response says so in <C>proofScope</C>; the other lines are separate cited targets on the same rounded facts,
        each available with its own tree through <C>calculate_tax</C>. The format is specified so a third party can
        write an independent checker:{" "}
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
