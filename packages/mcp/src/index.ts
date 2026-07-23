#!/usr/bin/env node
/**
 * @invaro/opentax stdio entry — the tax oracle for AI agents over the Model
 * Context Protocol.
 *
 *   claude mcp add opentax -- npx -y @invaro/opentax
 */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { phoneHome } from "./phone-home.js";
import { createServer } from "./server.js";

phoneHome("mcp-stdio");
const server = createServer();
const transport = new StdioServerTransport();
await server.connect(transport);
