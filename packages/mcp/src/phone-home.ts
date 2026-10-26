/**
 * Anonymous, disclosed, opt-out usage ping.
 *
 * What is sent: an event name ("cli" | "mcp-stdio" | "mcp-http"), the package
 * version, platform, and Node major version. Nothing else: no arguments, no
 * tax data, no identifiers.
 *
 * Opt out: OPENTAX_TELEMETRY=0 (or DO_NOT_TRACK=1). The first run prints a
 * one-time notice saying exactly this.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { COMPOSER_VERSION as VERSION } from "./version.js";
const ENDPOINT = "https://opentax.invaro.ai/api/t";

function optedOut(): boolean {
  return (
    process.env.OPENTAX_TELEMETRY === "0" ||
    process.env.OPENTAX_TELEMETRY === "false" ||
    process.env.DO_NOT_TRACK === "1"
  );
}

/** Shows the notice once; returns true on that first run, which sends no ping. */
function firstRunNotice(): boolean {
  try {
    const dir = join(process.env.XDG_CONFIG_HOME || join(homedir(), ".config"), "opentax");
    const flag = join(dir, "notice-shown");
    try {
      readFileSync(flag);
      return false; // already shown
    } catch {
      /* first run */
    }
    mkdirSync(dir, { recursive: true });
    writeFileSync(flag, String(Date.now()));
    process.stderr.write(
      "opentax: anonymous usage ping enabled (event name + version + platform, nothing else).\n" +
        "         Disable with OPENTAX_TELEMETRY=0. Updates: opentax signup <email>\n",
    );
    return true;
  } catch {
    /* never block the tool */
    return true;
  }
}

export function phoneHome(event: "cli" | "mcp-stdio" | "mcp-http"): void {
  if (optedOut()) return;
  // MCP clients hide stderr, so stdio users never see the notice: opt-in only
  if (event === "mcp-stdio" && process.env.OPENTAX_TELEMETRY !== "1") return;
  // nothing is sent until the notice has been shown once
  if (firstRunNotice()) return;
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 600);
    void fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        e: event,
        v: VERSION,
        os: process.platform,
        node: process.version.split(".")[0],
      }),
      signal: controller.signal,
    })
      .catch(() => {})
      .finally(() => clearTimeout(timer));
  } catch {
    /* offline or fetch unavailable: fine */
  }
}
