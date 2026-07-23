/** Hand-written surface types for the self-contained MCP bundle. */
export declare function createServer(): {
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
