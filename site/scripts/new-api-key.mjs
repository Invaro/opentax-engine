#!/usr/bin/env node
/**
 * Mint an evaluation API key and print the OPENTAX_API_KEYS entry to paste into the
 * deployment environment (Vercel → Settings → Environment Variables). The key is
 * shown ONCE here and is never written to the repo.
 *
 *   node site/scripts/new-api-key.mjs partner@example.com "Partner Inc" evaluation
 */
import { randomBytes } from "node:crypto";
const [account, org = "", plan = "evaluation"] = process.argv.slice(2);
if (!account) { console.error("usage: new-api-key.mjs <account-email> [org] [plan]"); process.exit(1); }
const key = "otx_" + randomBytes(24).toString("base64url");
const entry = { [key]: { account, org, plan, issued: new Date().toISOString().slice(0, 10) } };
console.log(`API key (send to the partner over a private channel, once):\n\n  ${key}\n`);
console.log(`Merge this into the OPENTAX_API_KEYS JSON in the deployment environment:\n\n${JSON.stringify(entry, null, 2)}\n`);
console.log(`Test:\n  curl -s https://opentax.invaro.ai/mcp -H 'Authorization: Bearer ${key}' -H 'Content-Type: application/json' -H 'Accept: application/json, text/event-stream' -d '{"jsonrpc":"2.0","id":1,"method":"tools/list"}' | head -c 300`);
