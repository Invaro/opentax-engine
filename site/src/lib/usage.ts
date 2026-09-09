import { list, put } from "@vercel/blob";
import { emailHash, sha256, type Account } from "@/lib/accounts";
import { rateLimit } from "@/lib/rate-limit";

/**
 * Usage records. Never the tool arguments — only the envelope: surface,
 * method, tool name, client, account, a hash of the client's return id, and
 * a timestamp. Two destinations:
 *   mcp-usage/<date>/<ts>-<rand>.json                     every call (budgeted; anonymous floods degrade to log-only)
 *   usage/<sha256(email)>/<date>/<ts>-<tool>-<ret>.json   keyed tool calls, read back by the console from the pathname alone
 */

export type UsageRecord = {
  evt: "mcp" | "rest";
  method: string;
  tool: string;
  client: string;
  clientVersion: string;
  account: string;
  org: string;
  plan: string;
  ret: string; // sha256(X-OpenTax-Return-Id) prefix, or ""
  at: string;
};

export const RETURN_ID_HEADER = "x-opentax-return-id";

export function returnIdHash(req: Request): string {
  const id = req.headers.get(RETURN_ID_HEADER)?.trim();
  return id ? sha256(id).slice(0, 16) : "";
}

export async function writeUsage(record: UsageRecord, ip: string): Promise<void> {
  console.log(JSON.stringify(record));
  const day = record.at.slice(0, 10);
  const ts = Date.now();
  const body = JSON.stringify(record);
  const opts = { access: "private" as const, contentType: "application/json" };
  const writes: Promise<unknown>[] = [];
  const withinBudget = rateLimit(`mcpblob:ip:${ip}`, 30, 3600 * 1000) && rateLimit("mcpblob:all", 240, 3600 * 1000);
  if (withinBudget && (record.method === "initialize" || record.method === "tools/call")) {
    writes.push(put(`mcp-usage/${day}/${ts}-${Math.random().toString(36).slice(2, 8)}.json`, body, opts));
  }
  if (record.account && record.method === "tools/call" && rateLimit(`usage:${record.account}`, 6000, 3600 * 1000)) {
    const tool = record.tool.replace(/[^a-z0-9_]/gi, "").slice(0, 40) || "unknown";
    writes.push(put(`usage/${emailHash(record.account)}/${day}/${ts}-${tool}-${record.ret || "0"}.json`, body, opts));
  }
  await Promise.all(writes.map((w) => w.catch(() => {})));
}

export function accountFields(account?: Account): Pick<UsageRecord, "account" | "org" | "plan"> {
  return { account: account?.account ?? "", org: account?.org ?? "", plan: account?.plan ?? "" };
}

export type UsageSummary = {
  days: number;
  calls: number;
  computedReturns: number;
  byTool: Array<{ tool: string; calls: number }>;
  byDay: Array<{ day: string; calls: number }>;
  truncated: boolean;
};

/** Aggregate an account's keyed calls over the last `days` days from the blob pathnames alone. */
export async function readUsage(email: string, days = 30): Promise<UsageSummary> {
  const prefix = `usage/${emailHash(email)}/`;
  const since = Date.now() - days * 86_400_000;
  const byTool = new Map<string, number>();
  const byDay = new Map<string, number>();
  const returns = new Set<string>();
  let calls = 0;
  let truncated = false;
  let cursor: string | undefined;
  let pages = 0;
  do {
    const page = await list({ prefix, limit: 1000, cursor });
    for (const b of page.blobs) {
      const rest = b.pathname.slice(prefix.length); // <day>/<ts>-<tool>-<ret>.json
      const day = rest.slice(0, 10);
      const m = /^\d{4}-\d{2}-\d{2}\/(\d+)-([a-z0-9_]+)-([0-9a-f]+|0)\.json$/i.exec(rest);
      const at = m ? Number(m[1]) : new Date(b.uploadedAt).getTime();
      if (at < since) continue;
      calls += 1;
      byDay.set(day, (byDay.get(day) ?? 0) + 1);
      if (m) {
        byTool.set(m[2], (byTool.get(m[2]) ?? 0) + 1);
        if (m[3] !== "0") returns.add(m[3]);
      }
    }
    cursor = page.hasMore ? page.cursor : undefined;
    pages += 1;
    if (pages >= 10 && cursor) {
      truncated = true;
      break;
    }
  } while (cursor);
  return {
    days,
    calls,
    computedReturns: returns.size,
    byTool: [...byTool.entries()].map(([tool, n]) => ({ tool, calls: n })).sort((a, b) => b.calls - a.calls),
    byDay: [...byDay.entries()].map(([day, n]) => ({ day, calls: n })).sort((a, b) => (a.day < b.day ? -1 : 1)),
    truncated,
  };
}
