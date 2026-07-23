/**
 * Pretty proof-tree rendering: every line of the answer traces to a rule
 * with its citation, a given fact, or a recorded assumption.
 */

import pc from "picocolors";
import type { DerivationNode, ProofArtifact } from "@invaro/opentax-core";
import { formatAnswer, formatValue } from "./format.js";

export function renderProof(proof: ProofArtifact, opts?: { allAssumptions?: boolean }): string {
  const lines: string[] = [];
  const seen = new Set<string>();

  lines.push(
    `${pc.bold(proof.target)}  ${pc.bold(pc.green(formatAnswer(proof.root.value)))}`,
  );
  lines.push(pc.dim(`as of ${proof.asOf}`));
  renderChildrenOf(proof.root, "", lines, seen, true);

  if (proof.assumptions.length > 0) {
    lines.push("");
    // fold the boring defaults ($0 / false): honest without the wall.
    // "interesting" = a default the engine relied on that is NOT nothing —
    // those can change the answer if wrong, so they stay visible.
    const boring = (v: { type: string; value: string | boolean }) =>
      (v.type === "money" && v.value === "0") ||
      (v.type === "int" && v.value === "0") ||
      (v.type === "bool" && v.value === false);
    const interesting = proof.assumptions.filter((a) => !boring(a.value));
    const folded = proof.assumptions.length - interesting.length;
    const showAll = opts?.allAssumptions || interesting.length === proof.assumptions.length;
    const shown = showAll ? proof.assumptions : interesting;
    if (!showAll && interesting.length === 0) {
      lines.push(
        pc.yellow(`Assumptions (${proof.assumptions.length}): `) +
          pc.dim(
            "every default was $0/none — pass the real facts if your situation differs (--assumptions lists them)",
          ),
      );
    } else {
      lines.push(pc.yellow(`Assumptions (${proof.assumptions.length}):`));
      for (const a of shown) {
        lines.push(
          `  ${pc.yellow("•")} ${a.factId} = ${formatValue(a.value)} ${pc.dim(`— ${a.rationale}`)}`,
        );
      }
      if (!showAll && folded > 0) {
        lines.push(
          pc.dim(
            `  … and ${folded} more defaults, all $0/none (--assumptions lists them)`,
          ),
        );
      }
    }
  }

  lines.push("");
  lines.push(
    pc.dim(
      `corpus ${proof.corpus.name}@${proof.corpus.version}  ${proof.corpus.merkleRoot.slice(0, 23)}…`,
    ),
  );
  lines.push(pc.dim(`artifact ${proof.artifactHash.slice(0, 23)}…`));
  return lines.join("\n");
}

function renderChildrenOf(
  node: DerivationNode,
  prefix: string,
  lines: string[],
  seen: Set<string>,
  isRoot = false,
): void {
  if (node.kind === "rule" && node.title) {
    const cite = node.citation ? `  [${node.citation.source}]` : "";
    lines.push(`${prefix}${isRoot ? "" : ""}${pc.dim(`· ${node.title}${cite}`)}`);
  }
  const kids = node.children ?? [];
  kids.forEach((child, i) => {
    renderNode(child, prefix, i === kids.length - 1, lines, seen);
  });
}

function renderNode(
  node: DerivationNode,
  prefix: string,
  isLast: boolean,
  lines: string[],
  seen: Set<string>,
): void {
  const connector = isLast ? "└─ " : "├─ ";
  const childPrefix = prefix + (isLast ? "   " : "│  ");

  if (node.kind === "fact") {
    lines.push(
      `${prefix}${connector}${pc.cyan("fact")} ${node.factId} = ${formatValue(node.value)}`,
    );
    return;
  }
  if (node.kind === "assumption") {
    lines.push(
      `${prefix}${connector}${pc.yellow("assumed")} ${node.factId} = ${formatValue(node.value)} ${pc.dim("(default)")}`,
    );
    return;
  }

  const already = node.ruleId && seen.has(node.ruleId);
  const overrideTag = node.resolvedFrom
    ? pc.magenta(` ⤷ overrides ${node.resolvedFrom}`)
    : "";
  lines.push(
    `${prefix}${connector}${node.ruleId}  ${pc.green(formatValue(node.value))}${overrideTag}${already ? pc.dim("  (derived above)") : ""}`,
  );
  if (already) return;
  if (node.ruleId) seen.add(node.ruleId);
  renderChildrenOf(node, childPrefix, lines, seen);
}
