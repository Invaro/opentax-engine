import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock, InlineCode as C } from "@/components/docs/code-block";
import { CORPUS_VERSION, MERKLE_ROOT } from "@/lib/docs";

export const metadata: Metadata = { title: "Validation" };

export default function ValidationPage() {
  return (
    <>
      <div className="kicker">accuracy · reproducible from a clone</div>
      <h1>
        What stands behind <em className="not-italic text-muted-foreground">the numbers.</em>
      </h1>
      <p className="lede">
        Read this before relying on the engine for anything filed. Every claim below names the test set it is a
        claim about, and every test set is in the public repository.
      </p>

      <h2>Exact versions</h2>
      <div className="table-wrap">
        <table className="data">
          <tbody>
            <tr>
              <td>rule corpus</td>
              <td>
                <C>{CORPUS_VERSION}</C>; <C>corpus.lock.json</C> pins every rule&apos;s content hash
              </td>
            </tr>
            <tr>
              <td>corpus Merkle root</td>
              <td className="font-mono text-[10.5px] break-all">{MERKLE_ROOT}</td>
            </tr>
            <tr>
              <td>proof schema</td>
              <td>v2</td>
            </tr>
            <tr>
              <td>arithmetic</td>
              <td>integer cents throughout; there is no floating point anywhere in a computation</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>
        The hosted endpoint reports the root of whatever corpus it is serving on every response, so you can
        confirm the deployed corpus matches the one you tested.
      </p>

      <h2>Test commands and golden fixtures</h2>
      <CodeBlock
        lang="bash"
        code={`git clone https://github.com/Invaro/opentax-engine && cd opentax-engine
pnpm install && pnpm build
pnpm test                                                   # 30 files, 2,059 tests
pnpm -F @invaro/opentax-corpus-us-federal report:coverage   # the coverage dashboard
node packages/corpus-us-federal/scripts/coverage-matrix.mjs # the machine-readable matrix`}
      />
      <ul>
        <li>
          <strong>1,581 golden fixtures.</strong> Each is a hand-computed expected value for one rule at one date,
          written from the statute or the printed form before the rule was trusted, with the arithmetic in its
          description.
        </li>
        <li>
          <strong>Printed-table parity.</strong> The engine must reproduce every cell of the agency&apos;s own tax table
          at both ends of every row: Delaware (1,162 rows), Hawaii (2,000 × 3), Kansas (2,000 × 2), Oklahoma (2,000
          × 2 plus the 2020 EIC table), Rhode Island (2,000), West Virginia (1,702), Nebraska (777 × 4), North
          Dakota (4,780 cells), Vermont (3,000 cells), Maine, Arkansas (every whole dollar to $100,000 plus five
          low-income tables), Connecticut, New Mexico, and a 333-row sample of the 2025 IRS Tax Table. Each suite
          states the rounding convention it proved and every exception the printed table carries.
        </li>
        <li>
          <strong>Composer tests</strong> with hand-computed line sets for every composed state; contract tests that
          every input fact has a CLI flag and a schema entry; a staleness test that the declared TY2026 gaps match
          the rule windows exactly.
        </li>
      </ul>

      <h2>Differential test against PolicyEngine US</h2>
      <p>
        Federal individual, TY2025, 572 scenarios across wages, filing status, children, age, interest, capital
        gains, tips, overtime, self-employment and QBI, student loan interest, and Schedule A.
      </p>
      <div className="border border-border grid sm:grid-cols-4 text-xs">
        {[
          { v: "533", k: "exact to the cent" },
          { v: "6", k: "within 2¢ (float rounding on their side)" },
          { v: "33", k: "explained, with primary-source authority" },
          { v: "0", k: "unexplained" },
        ].map((r, i) => (
          <div key={r.k} className={`p-4 ${i > 0 ? "border-t sm:border-t-0 sm:border-l border-border" : ""}`}>
            <div className="font-serif text-2xl">{r.v}</div>
            <div className="text-muted-foreground">{r.k}</div>
          </div>
        ))}
      </div>
      <p className="mt-3">
        The 33 are triaged in <C>harness/known-differences.json</C>: the CTC phase-out threshold for a qualifying
        surviving spouse, the § 224 tips deduction (modeled there as an uncapped exclusion), the whole-$1,000
        phase-out step in §§ 224 and 225. Scope of the claim: federal individual, TY2025 only. There is no
        PolicyEngine comparison for TY2026, for states, or for business entities.
      </p>

      <h2>What &quot;0% error margin&quot; means, precisely</h2>
      <p>It is a statement about specific test sets, not a warranty about every return:</p>
      <ol>
        <li>Zero unexplained disagreements over $1 against PolicyEngine US on the 572 federal TY2025 scenarios.</li>
        <li>100% of the 1,581 hand-computed golden fixtures reproduce.</li>
        <li>100% of every printed tax-table cell in the parity suites reproduce, at both ends of every row.</li>
      </ol>
      <p>
        It does <strong>not</strong> mean agreement with a filed-return population, coverage of part-year or
        nonresident returns, coverage of business return line sets, or TY2026 state figures the Departments have
        not published. Those refuse.
      </p>

      <h2>TaxCalcBench</h2>
      <p>
        On <a href="https://github.com/column-tax/tax-calc-bench">TaxCalcBench</a> TY25, 50 complete returns
        scored line by line, the engine run deterministically against this corpus with no model in the loop
        produces 47 of 50 strictly correct returns and 95.94% of scored lines. The three misses are two
        benchmark-side figures and one document-classification ambiguity. A Claude Sonnet agent using the
        engine over MCP scores 48 of 50, the figure on the landing page.
      </p>

      <h2>Known mismatches and exclusions</h2>
      <ul>
        <li>
          <C>harness/known-differences.json</C>: every divergence from PolicyEngine, with authority.
        </li>
        <li>
          <C>packages/corpus-us-federal/src/staleness.ts</C>: every rule with no TY2026 version yet, per state, with
          the publication that unblocks it; enforced by test.
        </li>
        <li>
          The <Link href="/docs/coverage#approximations">disclosed approximations</Link> on the coverage page.
        </li>
        <li>
          Where an agency&apos;s whole-dollar table and its own formula differ by $1, the rule documents which it
          encodes. Source conflicts are encoded as the form prints them and disclosed in the rule.
        </li>
        <li>
          Refusals, never approximated: CAMT, retained trust capital gains, kiddie preferential income, a fourth
          simultaneous AOTC student, § 199A with the § 68 haircut, part-year and nonresident state returns, state
          business returns, Forms 990 and 1065.
        </li>
      </ul>
    </>
  );
}
