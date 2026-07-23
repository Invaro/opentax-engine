/**
 * Entry for the self-contained hosted bundle (site /mcp route, edge-less
 * Node runtimes). Exports the server factory plus the SDK's Web-Standard
 * Streamable HTTP transport so the host app needs zero MCP dependencies.
 */
export { createServer } from "./server.js";
export { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
