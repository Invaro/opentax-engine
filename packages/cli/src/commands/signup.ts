/** `opentax signup <email>` — get product updates (double opt-in via email). */

import pc from "picocolors";
import { EXIT, print } from "../render/output.js";

export async function runSignup(email: string, flags: { json?: boolean }): Promise<number> {
  try {
    const res = await fetch("https://opentax.invaro.ai/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, source: "cli" }),
    });
    const body = (await res.json()) as { ok?: boolean; error?: string };
    if (flags.json) {
      print({ ok: Boolean(body.ok), ...(body.error ? { error: body.error } : {}) });
      return body.ok ? EXIT.OK : EXIT.ERROR;
    }
    if (body.ok) {
      console.log(pc.bold("Check your inbox — one click on the confirmation link and you're in."));
      return EXIT.OK;
    }
    console.error(pc.red(`signup failed: ${body.error ?? "unknown error"}`));
    return EXIT.ERROR;
  } catch {
    if (flags.json) print({ ok: false, error: "network" });
    else console.error(pc.red("could not reach opentax.invaro.ai — check your connection"));
    return EXIT.ERROR;
  }
}
