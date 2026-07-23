/**
 * Plain-English summary: the 1040 story in eight lines, derived from the
 * proof itself (never computed separately — every number below IS a node
 * of the verified derivation).
 */

import pc from "picocolors";
import type { DerivationNode, ProofArtifact } from "@invaro/opentax-core";
import { formatMoney } from "./format.js";

function findNode(root: DerivationNode, ruleId: string): DerivationNode | null {
  if (root.ruleId === ruleId || root.resolvedFrom === ruleId) return root;
  for (const child of root.children ?? []) {
    const hit = findNode(child, ruleId);
    if (hit) return hit;
  }
  return null;
}

function centsOf(root: DerivationNode, ruleId: string): bigint | null {
  const node = findNode(root, ruleId);
  if (!node || node.value.type !== "money") return null;
  return BigInt(node.value.value as string);
}

const STATUS_LABEL: Record<string, string> = {
  single: "Single",
  mfj: "Married filing jointly",
  mfs: "Married filing separately",
  hoh: "Head of household",
  qss: "Qualifying surviving spouse",
};

/** Returns the summary block, or null if the target isn't the net-tax chain. */
export function renderSummary(proof: ProofArtifact): string | null {
  const withholdingMode = proof.target === "us.federal.balance_due";
  if (proof.target !== "us.federal.net_tax" && !withholdingMode) return null;
  const root = proof.root;

  const agi = centsOf(root, "us.federal.agi");
  const stdDed = centsOf(root, "us.federal.standard_deduction");
  const senior = centsOf(root, "us.federal.senior_deduction") ?? 0n;
  const tips = centsOf(root, "us.federal.tips_deduction") ?? 0n;
  const overtime = centsOf(root, "us.federal.overtime_deduction") ?? 0n;
  const carLoan = centsOf(root, "us.federal.car_loan_interest_deduction") ?? 0n;
  const charity =
    centsOf(root, "us.federal.charitable_deduction_nonitemizer") ?? 0n;
  const qbi = centsOf(root, "us.federal.qbi_deduction") ?? 0n;
  const taxable = centsOf(root, "us.federal.taxable_income");
  const before = centsOf(root, "us.federal.income_tax_before_credits");
  const amt = centsOf(root, "us.federal.amt") ?? 0n;
  const ctc = centsOf(root, "us.federal.ctc") ?? 0n;
  const education = centsOf(root, "us.federal.education.nonrefundable") ?? 0n;
  const refundable = centsOf(root, "us.federal.refundable_credits") ?? 0n;
  const otherTaxes = centsOf(root, "us.federal.other_taxes") ?? 0n;
  const net = withholdingMode
    ? (centsOf(root, "us.federal.net_tax") ?? 0n)
    : BigInt(root.value.value as string);
  if (agi === null || stdDed === null || taxable === null || before === null) {
    return null;
  }

  // the § 63 standard-or-itemized election: report whichever bundle the
  // derivation actually chose (the election node is the max of the two)
  const elected = centsOf(root, "us.federal.deduction_election");
  const itemized = centsOf(root, "us.federal.itemized_deductions") ?? 0n;
  const standardSide = stdDed + charity;
  const itemizing = elected !== null && itemized > standardSide;
  const deductions =
    (elected ?? standardSide) + senior + tips + overtime + carLoan + qbi;
  const dedParts = [
    itemizing ? "itemized deductions" : null,
    !itemizing && stdDed > 0n ? "standard deduction" : null,
    senior > 0n ? "senior deduction" : null,
    tips > 0n ? "tips deduction" : null,
    overtime > 0n ? "overtime deduction" : null,
    carLoan > 0n ? "car loan interest" : null,
    !itemizing && charity > 0n ? "charitable deduction" : null,
    qbi > 0n ? "QBI deduction" : null,
  ].filter(Boolean);
  const creditParts = [
    education > 0n ? "education credits" : null,
    ctc > 0n ? "child tax credit" : null,
    refundable > 0n ? "refundable credits" : null,
  ].filter(Boolean);

  const statusNode = findNode(root, "us.federal.income_tax_before_credits");
  const statusTag =
    statusNode?.inputs?.filingStatus?.value !== undefined
      ? STATUS_LABEL[String(statusNode.inputs.filingStatus.value)]
      : null;

  const year = proof.asOf.slice(0, 4);
  const money = (c: bigint) => formatMoney(c).padStart(14);
  const lines: string[] = [];

  lines.push(
    pc.bold(
      `${statusTag ?? "Taxpayer"} · tax year ${year}`,
    ),
  );
  lines.push("");
  lines.push(`  Income               ${money(agi)}`);
  lines.push(
    `  − Deductions         ${money(deductions)}${dedParts.length ? pc.dim(`   (${dedParts.join(" + ")})`) : ""}`,
  );
  lines.push(`  = Taxable income     ${money(taxable)}`);
  lines.push(`  Tax before credits   ${money(before)}`);
  if (amt > 0n) {
    lines.push(`  + Alternative min tax${money(amt)}${pc.dim("   (Form 6251)")}`);
  }
  lines.push(
    `  − Credits            ${money(education + ctc + refundable)}${creditParts.length ? pc.dim(`   (${creditParts.join(" + ")})`) : ""}`,
  );
  if (otherTaxes > 0n) {
    lines.push(
      `  + Other taxes        ${money(otherTaxes)}${pc.dim("   (SE tax / Add'l Medicare / NIIT)")}`,
    );
  }
  const row = (
    label: string,
    amount: bigint,
    paint: (s: string) => string = (s) => s,
  ) => `  ${paint(label.padEnd(21))}${paint(money(amount))}`;

  lines.push(pc.dim("  ─────────────────────────────────────"));
  if (net < 0n) {
    lines.push(row("Your refund", -net, (s) => pc.bold(pc.green(s))));
  } else {
    // effective rate in tenths of a percent, on income
    const rateLabel =
      agi > 0n
        ? pc.dim(`   (${(Number((net * 1000n) / agi) / 10).toFixed(1)}% of income)`)
        : "";
    lines.push(
      row(withholdingMode ? "Tax for the year" : "You owe", net, pc.bold) +
        rateLabel,
    );
  }

  // withholding checkup: liability minus what's already been paid in
  if (withholdingMode) {
    const balance = BigInt(root.value.value as string);
    const withheld = net - balance;
    const aprilOf = String(Number(year) + 1);
    lines.push(row("− Withheld so far", withheld));
    lines.push(pc.dim("  ─────────────────────────────────────"));
    if (balance < 0n) {
      lines.push(
        row("Refund expected", -balance, (s) => pc.bold(pc.green(s))) +
          pc.dim(`   (April ${aprilOf})`),
      );
    } else {
      lines.push(
        row("Balance due", balance, (s) => pc.bold(pc.yellow(s))) +
          pc.dim(`   (April ${aprilOf})`),
      );
    }
  }
  return lines.join("\n");
}
