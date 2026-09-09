import Link from "next/link";
import { CodeBlock, InlineCode as C } from "@/components/docs/code-block";
import { CodeTabs } from "@/components/docs/code-tabs";
import { CORPUS_VERSION, MCP_URL, REST_BASE, SITE, TOOLS, curlFor, jsFor, mcpFor, pyFor } from "@/lib/docs";

const FIRST_CALL_ARGS = {
  filing: { filingStatus: "mfj" },
  income: { wages: 120000 },
  credits: { qualifyingChildren: 2 },
  asOf: "2025-12-31",
};

export default function DocsOverview() {
  return (
    <>
      <div className="kicker">hosted api · corpus {CORPUS_VERSION}</div>
      <h1>
        One request, <em className="not-italic text-muted-foreground">one cited answer.</em>
      </h1>
      <p className="lede">
        The engine runs as a stateless HTTP service. Send the facts, get back the number, every assumption it
        made, the statute behind each rule, and on request the proof tree you can verify offline. Nothing you send is stored.
      </p>

      <div className="border border-border grid sm:grid-cols-3 text-xs">
        {[
          { k: "REST", v: `${REST_BASE}/{tool}`, d: "POST the arguments, read the JSON" },
          { k: "MCP", v: MCP_URL, d: "the same tools for agents and IDEs" },
          { k: "OpenAPI", v: `${SITE}/v1/openapi.json`, d: "generated from the running server" },
        ].map((r, i) => (
          <div key={r.k} className={`p-4 ${i > 0 ? "border-t sm:border-t-0 sm:border-l border-border" : ""}`}>
            <div className="font-mono text-[10px] text-muted-foreground mb-1">{r.k}</div>
            <div className="font-mono text-[11px] break-all">{r.v}</div>
            <div className="text-muted-foreground mt-1">{r.d}</div>
          </div>
        ))}
      </div>

      <h2 id="quickstart">Three steps</h2>
      <h3>1. Get a key</h3>
      <p>
        Sign in at <Link href="/console">the console</Link> with your email. A six-digit code arrives, you enter
        it, and your key is on the screen. The evaluation plan is free and has no expiry.
      </p>
      <p>
        Calls without a key work too, at the anonymous rate budget (600 requests an hour). A key raises that to
        6,000 and attributes usage to your account so you can see it.
      </p>

      <h3>2. Make the first call</h3>
      <p>
        A married couple, two children, $120,000 of wages, tax year 2025. Note <C>asOf</C>: it is the law-in-force
        date and it is required. The engine refuses to guess which year you mean.
      </p>
      <CodeTabs
        tabs={[
          { label: "curl", code: curlFor("calculate_tax", FIRST_CALL_ARGS), lang: "bash" },
          { label: "javascript", code: jsFor("calculate_tax", FIRST_CALL_ARGS), lang: "node 18+" },
          { label: "python", code: pyFor("calculate_tax", FIRST_CALL_ARGS), lang: "requests" },
          { label: "mcp", code: mcpFor("calculate_tax", FIRST_CALL_ARGS), lang: "json-rpc" },
        ]}
      />

      <h3>3. Read the answer</h3>
      <CodeBlock
        lang="response"
        code={`{
  "ok": true,
  "target": "us.federal.net_tax",
  "asOf": "2025-12-31",
  "answer": "$5,746.00",
  "valueCents": "574600",
  "meaning": "net federal income tax",
  "assumptions": [
    { "factId": "taxableInterest", "value": { "type": "money", "value": "0" },
      "source": "default", "rationale": "Assumed no taxable interest absent contrary input" },
    …
  ],
  "corpusMerkleRoot": "sha256:5f34e0bc…",
  "proof": { … }
}`}
      />
      <p>
        <strong>answer</strong> is formatted for people, <strong>valueCents</strong> is the integer your code
        should use. A negative value is a refund. <strong>assumptions</strong> lists every fact the engine filled
        in with a default, each with a reason. Treat that list as the questions you still have to ask the
        taxpayer. <strong>proof</strong> is the full derivation, and <strong>corpusMerkleRoot</strong> is the hash
        of the exact rule corpus that produced it.
      </p>

      <h2 id="shape">Conventions</h2>
      <ul>
        <li>
          <strong>Money is dollars</strong> in requests: <C>50000</C> or <C>&quot;1234.56&quot;</C>. Responses give cents
          as a string and a formatted dollar amount.
        </li>
        <li>
          <strong>asOf</strong> picks the tax year: <C>2025-12-31</C> for TY2025, <C>2026-12-31</C> for TY2026.
        </li>
        <li>
          <strong>Schemas are strict.</strong> An unknown key is a 400, not a silent ignore. The exact input schema
          for every tool is on its page and in the OpenAPI document.
        </li>
        <li>
          <strong>Facts are grouped</strong> on the individual tools: <C>filing</C>, <C>income</C>, <C>credits</C>,
          <C>itemized</C>, <C>retirement</C> and so on. Fill the groups that apply.
        </li>
        <li>
          <strong>Nothing is stored.</strong> The facts are computed in memory and the answer returned. The usage
          record holds the tool name, the account, a hash of your return id, and a timestamp. Never the
          arguments.
        </li>
      </ul>

      <h2 id="refusals">Refusals</h2>
      <p>
        When the corpus cannot answer, the engine says so instead of estimating. The HTTP status is still 200 with{" "}
        <C>ok: false</C>, because the request was well-formed and the engine did its job. The interesting part is{" "}
        <C>error.code</C>:
      </p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>code</th>
              <th>meaning</th>
              <th>what to do</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>NEEDS_FACTS</td>
              <td>a required input is missing; <C>error.data.missing</C> lists each fact id, type and description</td>
              <td>collect those facts and call again</td>
            </tr>
            <tr>
              <td>NO_APPLICABLE_RULE</td>
              <td>no rule version is valid on <C>asOf</C>, typically a 2026 state amount the Department has not published</td>
              <td>check the <Link href="/docs/coverage">coverage matrix</Link> for the publication that unblocks it</td>
            </tr>
            <tr>
              <td>UNHANDLED_ENUM_CASE</td>
              <td>a filing status or classification combination the corpus does not encode</td>
              <td>treat as out of scope</td>
            </tr>
            <tr>
              <td>ERROR</td>
              <td>a rule-level refusal with a message, e.g. a situation the rule declares out of scope, or a missing <C>asOf</C></td>
              <td>read the message</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>Transport-level problems use HTTP status codes:</p>
      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th>status</th>
              <th>code</th>
              <th>meaning</th>
            </tr>
          </thead>
          <tbody>
            <tr><td>400</td><td>INVALID_ARGUMENTS</td><td>the server&apos;s own validation message, e.g. an unrecognized key or a wrong type</td></tr>
            <tr><td>400</td><td>BAD_JSON</td><td>the body is not a JSON object</td></tr>
            <tr><td>401</td><td>UNKNOWN_API_KEY</td><td>the bearer key does not exist or was rotated</td></tr>
            <tr><td>404</td><td>UNKNOWN_TOOL</td><td>no such tool; the response lists the valid names</td></tr>
            <tr><td>413</td><td>BODY_TOO_LARGE</td><td>over 512 KB</td></tr>
            <tr><td>429</td><td>RATE_LIMITED</td><td>the hourly budget is spent; <C>Retry-After</C> is set</td></tr>
          </tbody>
        </table>
      </div>

      <h2 id="return-id">Tagging a return</h2>
      <p>
        Send <C>X-OpenTax-Return-Id</C> with any identifier you choose for the taxpayer-year the call belongs to. It
        is stored as a hash and shown in the console as &quot;computed returns&quot;. One taxpayer, one tax year,
        any number of federal and state calls and recalculations, counts as one. This is the unit usage pricing
        will use later. There is no charge on the evaluation plan.
      </p>
      <CodeBlock
        lang="bash"
        code={`curl -s ${REST_BASE}/compute_return \\
  -H "Authorization: Bearer $OPENTAX_KEY" \\
  -H "X-OpenTax-Return-Id: client-4821-ty2025" \\
  -H "Content-Type: application/json" \\
  -d @return.json`}
      />

      <h2 id="versioning">Versioning</h2>
      <p>
        Every response carries <C>corpusMerkleRoot</C>, the content hash of the rule corpus that produced it. Rules
        are never edited in place. A change in the law adds a new version with its own validity window, so an old
        proof still verifies against the old corpus. A breaking change to a tool&apos;s inputs ships as a new tool
        name, never as a silently changed schema. The current corpus is <C>{CORPUS_VERSION}</C>.
      </p>

      <h2 id="tools">The {TOOLS.length} tools</h2>
      <p>
        Eight compute, two verify, five discover. Start with{" "}
        <Link href="/docs/tools/calculate_tax">calculate_tax</Link> for any federal figure,{" "}
        <Link href="/docs/tools/compute_return">compute_return</Link> for the Form 1040 line set from documents, and{" "}
        <Link href="/docs/tools/compute_state_return">compute_state_return</Link> for a state return. The{" "}
        <Link href="/docs/tools">full list</Link> has the rest.
      </p>
    </>
  );
}
