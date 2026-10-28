/**
 * Entry for the self-contained hosted bundle (site /mcp route, edge-less
 * Node runtimes). Exports the server factory plus the SDK's Web-Standard
 * Streamable HTTP transport so the host app needs zero MCP dependencies.
 * The factory applies the public server's work limits.
 */
import { createServer as createAnyServer, type ConnectedAccount } from "./server.js";

export const createServer = (account?: ConnectedAccount) => createAnyServer({ hosted: true, account });
export { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
