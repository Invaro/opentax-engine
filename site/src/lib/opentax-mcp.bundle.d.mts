/** Hand-written surface types for the self-contained MCP bundle. */
export declare function createServer(account?: {
  email: string;
  plan: "firm" | "free";
  firm: string | null;
  role: "owner" | "member" | null;
}): {
  connect(transport: unknown): Promise<void>;
  close(): Promise<void>;
};
export declare class WebStandardStreamableHTTPServerTransport {
  constructor(options: {
    sessionIdGenerator: (() => string) | undefined;
    enableJsonResponse?: boolean;
  });
  handleRequest(req: Request): Promise<Response>;
  close(): Promise<void>;
}
