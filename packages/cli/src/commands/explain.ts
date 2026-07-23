import pc from "picocolors";
import { walkExpr } from "@invaro/opentax-core";
import type { Expr, Rule } from "@invaro/opentax-core";
import { getCorpus } from "@invaro/opentax-corpus-us-federal";
import { formatMoney } from "../render/format.js";
import { EXIT, print } from "../render/output.js";

export function runExplain(
  ruleId: string,
  flags: { asOf?: string; json?: boolean },
): number {
  const corpus = getCorpus();
  const versions = corpus.byId.get(ruleId);
  if (!versions) {
    const near = [...corpus.byId.keys()].filter((id) => id.includes(ruleId));
    if (flags.json) {
      print({
        ok: false,
        error: {
          code: "UNKNOWN_RULE",
          message: `unknown rule "${ruleId}"`,
          data: { ruleId, suggestions: near.slice(0, 5) },
          hint: "Run `opentax corpus list --json` for every rule id.",
        },
      });
      return EXIT.ERROR;
    }
    console.error(pc.red(`unknown rule "${ruleId}"`));
    if (near.length) {
      console.error(pc.dim(`did you mean: ${near.slice(0, 5).join(", ")}`));
    }
    return EXIT.ERROR;
  }

  const shown = flags.asOf
    ? versions.filter(
        (r) =>
          r.effectiveFrom <= flags.asOf! &&
          (r.effectiveTo === undefined || flags.asOf! < r.effectiveTo),
      )
    : versions;

  if (flags.json) {
    print({
      ok: true,
      versions: shown.map((rule) => ({
        ...rule,
        hash: corpus.ruleHashes.get(`${rule.id}@${rule.version}`),
        dependencies: dependencies(rule),
      })),
    });
    return EXIT.OK;
  }

  for (const rule of shown) {
    console.log();
    console.log(`${pc.bold(rule.id)} ${pc.dim(`v${rule.version}`)}`);
    console.log(`  ${rule.title}`);
    console.log(
      `  ${pc.dim("citation")}   ${rule.citation.source} ${rule.citation.section}`,
    );
    if (rule.citation.url) console.log(`  ${pc.dim("url")}        ${rule.citation.url}`);
    if (rule.citation.excerpt) {
      console.log(`  ${pc.dim("excerpt")}    ${pc.italic(`"${rule.citation.excerpt}"`)}`);
    }
    console.log(
      `  ${pc.dim("effective")}  [${rule.effectiveFrom}, ${rule.effectiveTo ?? "open"})`,
    );
    console.log(
      `  ${pc.dim("hash")}       ${corpus.ruleHashes.get(`${rule.id}@${rule.version}`)}`,
    );
    if (rule.overrides) {
      console.log(
        `  ${pc.dim("overrides")}  ${rule.overrides.ruleId} ${pc.dim(`(priority ${rule.overrides.priority})`)}`,
      );
    }
    if (rule.parameters) {
      console.log(`  ${pc.dim("parameters")}`);
      for (const [name, p] of Object.entries(rule.parameters)) {
        const shownValue =
          p.type === "money" ? formatMoney(String(p.value)) : String(p.value);
        console.log(`    ${name} = ${shownValue}`);
      }
    }
    const { ruleRefs, factRefs } = dependencies(rule);
    if (ruleRefs.length) {
      console.log(`  ${pc.dim("depends on")} ${ruleRefs.join(", ")}`);
    }
    if (factRefs.length) {
      console.log(`  ${pc.dim("facts used")} ${factRefs.join(", ")}`);
    }
  }
  console.log();
  return EXIT.OK;
}

function dependencies(rule: Rule): { ruleRefs: string[]; factRefs: string[] } {
  const ruleRefs = new Set<string>();
  const factRefs = new Set<string>();
  const roots: Expr[] = [rule.formula];
  if (rule.applicability) roots.push(rule.applicability);
  for (const root of roots) {
    walkExpr(root, (e) => {
      if (e.kind === "rule") ruleRefs.add(e.ruleId);
      if (e.kind === "fact") factRefs.add(e.factId);
    });
  }
  return { ruleRefs: [...ruleRefs].sort(), factRefs: [...factRefs].sort() };
}
