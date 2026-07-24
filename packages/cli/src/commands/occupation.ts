/**
 * `opentax occupation <job title>` — is this a § 224 tipped occupation?
 * Same determination as the MCP is_tipped_occupation tool: matches against
 * the Treasury occupation list, never guesses from vibes about the job.
 */

import pc from "picocolors";
import { matchOccupation, TIPPED_OCCUPATIONS } from "@invaro/opentax-corpus-us-federal";
import { EXIT, print } from "../render/output.js";

export function runOccupation(words: string[], flags: { json?: boolean }): number {
  const input = words.join(" ");
  const result = matchOccupation(input);

  if ("slug" in result) {
    const listed = result.slug !== "other";
    const entry = TIPPED_OCCUPATIONS.find((o) => o.slug === result.slug);
    if (flags.json) {
      print({
        ok: true,
        input,
        tipped: listed,
        occupation: listed ? result.slug : null,
        label: entry?.name ?? null,
      });
      return EXIT.OK;
    }
    console.log();
    if (listed) {
      console.log(
        `${pc.green("tipped occupation")} — "${input}" matches ${pc.bold(entry?.name ?? result.slug)} (§ 224 deduction eligible; pass --occupation ${result.slug})`,
      );
    } else {
      console.log(
        `${pc.yellow("not a listed occupation")} — "${input}" is not on the Treasury § 224 tipped-occupation list; tips are still income but the deduction does not apply`,
      );
    }
    console.log();
    return EXIT.OK;
  }

  if (flags.json) {
    print({ ok: false, input, ambiguous: true, candidates: result.candidates });
    return EXIT.NEEDS_FACTS;
  }
  console.log();
  console.log(`${pc.yellow("ambiguous")} — "${input}" could be any of:`);
  for (const c of result.candidates) console.log(`  ${c}`);
  console.log();
  return EXIT.NEEDS_FACTS;
}
