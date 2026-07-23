#!/usr/bin/env node
/**
 * The unified `opentax` binary — one package, every door:
 *
 *   opentax                MCP stdio server when spawned by an MCP client
 *                          (piped stdio); CLI help in an interactive terminal
 *   opentax mcp            MCP stdio server, explicitly
 *   opentax mcp-http       Streamable HTTP server (PORT env, default 3411)
 *   opentax eval …         the full CLI (eval, check, verify, lookup, state,
 *                          sweep, marginal, cliffs, compare, facts, corpus, …)
 *
 * `claude mcp add opentax -- npx -y @invaro/opentax` therefore starts the
 * server (no args, piped stdio), while humans typing `opentax` get help.
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { runCli } from "@invaro/opentax-cli";
import { phoneHome } from "./phone-home.js";
import { createServer } from "./server.js";

const arg = process.argv[2];

if (arg === "mcp" || (arg === undefined && !process.stdin.isTTY)) {
  phoneHome("mcp-stdio");
  const server = createServer();
  await server.connect(new StdioServerTransport());
} else if (arg === "mcp-http") {
  phoneHome("mcp-http");
  await import("./http.js");
} else if (arg === undefined) {
  runCli([process.argv[0], process.argv[1], "--help"]);
} else {
  phoneHome("cli");
  runCli();
}
