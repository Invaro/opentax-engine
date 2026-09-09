import type { Metadata } from "next";
import Link from "next/link";
import { CodeBlock, InlineCode as C } from "@/components/docs/code-block";
import { MCP_URL } from "@/lib/docs";

export const metadata: Metadata = { title: "MCP transport" };

export default function McpPage() {
  return (
    <>
      <div className="kicker">transport</div>
      <h1>
        The same engine, <em className="not-italic text-muted-foreground">over MCP.</em>
      </h1>
      <p className="lede">
        Agents, IDEs and chat clients speak the Model Context Protocol. The REST layer and the MCP endpoint run
        the identical server in the same process, so a tool behaves the same whichever door you use.
      </p>

      <h2>Endpoint</h2>
      <CodeBlock code={MCP_URL} label="streamable http · stateless" />
      <p>
        JSON-RPC 2.0 over Streamable HTTP, no sessions. Every POST is self-contained. Add it as a custom connector
        in Claude, ChatGPT, Cursor, or from the terminal:
      </p>
      <CodeBlock lang="bash" code={`claude mcp add --transport http opentax ${MCP_URL}`} />

      <h2>Authentication</h2>
      <p>
        Optional. Send <C>Authorization: Bearer otx_…</C> to attribute calls to your account and raise the rate
        budget. Connectors that cannot set headers work anonymously.
      </p>

      <h2>Calling a tool by hand</h2>
      <CodeBlock
        lang="bash"
        code={`curl -s ${MCP_URL} \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json, text/event-stream" \\
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}'`}
      />
      <p>
        A <C>tools/call</C> result is <C>result.content[0].text</C>, a JSON string with the same shape the REST layer
        returns as its body. An <C>isError: true</C> result with an <C>MCP error -32602</C> message is a schema
        rejection; over REST that is a 400.
      </p>
      <p>
        Prefer REST from a backend. Use MCP when the caller is a model: the tool descriptions carry the
        instructions a model needs (never estimate, report the engine&apos;s number, disclose assumptions), and the{" "}
        <Link href="/">landing page</Link> has one-click installs for the common clients.
      </p>
    </>
  );
}
