#!/usr/bin/env node
/**
 * opentax — verifiable US tax computation with machine-checkable proofs.
 */

import { Command, Option } from "commander";
import { runCheck } from "./commands/check.js";
import {
  runCorpusExport,
  runCorpusHash,
  runCorpusList,
} from "./commands/corpus.js";
import { runEval } from "./commands/eval.js";
import { runExplain } from "./commands/explain.js";
import { runFacts } from "./commands/facts.js";
import { runLookup } from "./commands/lookup.js";
import { runOccupation } from "./commands/occupation.js";
import { runSearch } from "./commands/search.js";
import {
  runCliffs,
  runCompare,
  runInvert,
  runMarginal,
  runSweep,
} from "./commands/solve.js";
import { runSignup } from "./commands/signup.js";
import { runState } from "./commands/state.js";
import { runVerify } from "./commands/verify.js";
import { FACT_FLAGS } from "./flags.js";

/**
 * Register every fact flag; only the everyday ones appear in --help.
 * The full grouped catalog lives behind `opentax flags` — a curated
 * first screen beats a 200-line wall.
 */
const COMMON_KEYS = new Set([
  "status", "wages", "kids", "age65", "interest", "gains", "seProfit",
  "salt", "mortgageInterest", "charity", "medical", "tips", "overtime",
  "socialSecurity", "pensions", "withheld",
]);
function registerFactFlags(cmd: Command): void {
  for (const f of FACT_FLAGS) {
    const opt = new Option(f.option, f.help);
    if (!COMMON_KEYS.has(f.key)) opt.hideHelp();
    cmd.addOption(opt);
  }
  cmd.addHelpText(
    "after",
    `\nThese are the everyday flags; ${FACT_FLAGS.length - COMMON_KEYS.size}+ more cover business owners, corporations, investors, education, and retirement — run \`opentax flags\` for the grouped catalog, or \`opentax facts\` for every input with its default.`,
  );
}

const program = new Command();

program
  .name("opentax")
  .description(
    `Verifiable US tax engine: every answer ships with a machine-checkable derivation citing its statutory sources.

Every command accepts --json (single JSON object on stdout, ok: true|false).
Exit codes: 0 ok · 2 needs more facts (retry with them) · 3 not covered by the corpus (don't retry) · 1 other error.`,
  )
  .version("0.1.0");

const evalCmd = program
  .command("eval")
  .description("compute a tax answer and print its proof tree")
  .option("--facts <file>", "JSON facts file (inline flags below override it)");
registerFactFlags(evalCmd);
evalCmd
  .option("--as-of <date>", "evaluate rules as of this ISO date (default: today)")
  .option("--target <ruleId>", "rule to derive (default: income tax after credits)")
  .option("--proof <file>", "write the proof artifact JSON to this file")
  .option("--brief", "plain-English summary only (skip the proof tree)")
  .option("--assumptions", "list every default the engine relied on (folded by default)")
  .option("--json", "print the proof artifact JSON instead of the tree")
  .action((flags) => {
    process.exitCode = runEval(flags);
  });

const checkCmd = program
  .command("check")
  .description(
    "verify a claimed tax amount (e.g. an AI agent's answer) against the law — exit 0 verified, 1 refuted",
  )
  .option("--facts <file>", "JSON facts file (inline flags below override it)");
registerFactFlags(checkCmd);
checkCmd
  .requiredOption("--expect <dollars>", "the claimed amount to verify (negative = refund)")
  .option("--tolerance <dollars>", "allowed absolute difference", "1")
  .option("--as-of <date>", "evaluate rules as of this ISO date (default: today)")
  .option("--target <ruleId>", "rule to check (default: net tax; balance due if --withheld)")
  .option("--proof <file>", "write the proof artifact JSON to this file")
  .option("--json", "machine-readable verdict")
  .action((flags) => {
    process.exitCode = runCheck(flags);
  });

program
  .command("facts")
  .description("list every input fact the corpus understands")
  .option("--json", "machine-readable output")
  .action((flags) => {
    process.exitCode = runFacts({ json: flags.json });
  });

program
  .command("flags")
  .description("the full grouped catalog of situation flags for eval/check/sweep/…")
  .action(() => {
    const order = [
      "Filing & family:", "Income:", "Deductions & savings:",
      "Education credits:", "Business owner:", "Investor (AMT / QSBS):",
      "Corporate & entity (Form 1120):", "Payments & estimated tax:", "Expert:",
    ];
    console.log();
    for (const group of order) {
      const flags = FACT_FLAGS.filter((f) => f.group === group);
      if (!flags.length) continue;
      console.log(`\x1b[1m${group}\x1b[0m`);
      const width = Math.max(...flags.map((f) => f.option.length)) + 2;
      for (const f of flags) console.log(`  ${f.option.padEnd(width)}${f.help}`);
      console.log();
    }
    console.log("All of these work on eval, check, sweep, marginal, cliffs, and compare.");
  });

program
  .command("lookup")
  .description(
    'find the dollar amounts and citations behind a question, e.g. `opentax lookup standard deduction`',
  )
  .argument("<query...>", "plain-English search terms")
  .option("--as-of <date>", "law in force on this ISO date (default: today)")
  .option("--expect <dollars>", "fact-check a claimed amount: exits 0 verified, 1 refuted, 3 unknown")
  .option("--filing-status <status>", "single | mfj | mfs | hoh | qss (narrows --expect to one status)")
  .option("--json", "machine-readable output")
  .action((queryWords: string[], flags) => {
    process.exitCode = runLookup(queryWords, {
      asOf: flags.asOf,
      json: flags.json,
      expect: flags.expect,
      filingStatus: flags.filingStatus,
    });
  });

program
  .command("search")
  .description('full-text search over the encoded law, e.g. `opentax search kiddie tax` — zero hits means "outside the corpus"')
  .argument("<query...>", "plain-English search terms")
  .option("--as-of <date>", "law in force on this ISO date (default: today)")
  .option("--limit <n>", "max results (default 8)")
  .option("--json", "machine-readable output")
  .action((queryWords: string[], flags) => {
    process.exitCode = runSearch(queryWords, { asOf: flags.asOf, limit: flags.limit, json: flags.json });
  });

program
  .command("occupation")
  .description("is this a § 224 tipped occupation? matches the Treasury list, never guesses")
  .argument("<title...>", "job title, e.g. `opentax occupation bartender`")
  .option("--json", "machine-readable output")
  .action((words: string[], flags) => {
    process.exitCode = runOccupation(words, { json: flags.json });
  });

program
  .command("state")
  .description("compose a state return (IL-1040, VA 760, CA 540, NY IT-201, PA-40, NJ-1040, OH IT 1040, NC D-400, GA 500, MD 502) from a composer-facts JSON file")
  .requiredOption("--facts <file>", "composer facts JSON (same shape as the MCP compute_state_return tool)")
  .option("--as-of <date>", "law in force on this ISO date (default: today)")
  .option("--json", "machine-readable output")
  .action((flags) => {
    process.exitCode = runState({ facts: flags.facts, asOf: flags.asOf, json: flags.json });
  });

program
  .command("signup")
  .description("get OpenTax updates by email (new features and other things worth knowing)")
  .argument("<email>", "your email address")
  .option("--json", "machine-readable output")
  .action(async (email: string, flags) => {
    process.exitCode = await runSignup(email, { json: flags.json });
  });

program
  .command("verify")
  .description("re-execute a proof artifact and confirm or refute it")
  .argument("<proof>", "proof artifact JSON file")
  .option("--json", "machine-readable output")
  .action((proofPath: string, flags) => {
    process.exitCode = runVerify(proofPath, { json: flags.json });
  });

program
  .command("explain")
  .description("show a rule: citation, effective window, parameters, dependencies")
  .argument("<ruleId>", "rule id, e.g. us.federal.standard_deduction")
  .option("--as-of <date>", "only the version valid on this date")
  .option("--json", "machine-readable output")
  .action((ruleId: string, flags) => {
    process.exitCode = runExplain(ruleId, { asOf: flags.asOf, json: flags.json });
  });

/** Register the shared facts/vary/as-of/target/json options on a solver command. */
function solverCommand(name: string, description: string) {
  const cmd = program.command(name).description(description);
  cmd.option("--facts <file>", "JSON facts file (inline flags below override it)");
  registerFactFlags(cmd);
  cmd
    .option("--vary <factId>", "fact to vary", "wages")
    .option("--as-of <date>", "evaluate rules as of this ISO date (default: today)")
    .option("--target <ruleId>", "rule to derive (default: net tax)")
    .option("--json", "machine-readable output");
  return cmd;
}

solverCommand("sweep", "evaluate the target across a range of one input")
  .requiredOption("--from <dollars>", "range start")
  .requiredOption("--to <dollars>", "range end")
  .option("--step <dollars>", "step size", "1000")
  .option("--csv", "CSV output")
  .action((flags) => {
    process.exitCode = runSweep(flags);
  });

solverCommand("marginal", "effective marginal rate at a point")
  .requiredOption("--at <dollars>", "input value to differentiate at")
  .option("--delta <dollars>", "finite-difference increment", "100")
  .action((flags) => {
    process.exitCode = runMarginal(flags);
  });

solverCommand(
  "cliffs",
  "find exact dollars where one more cent of input costs more than a cent (marginal > 100%)",
)
  .requiredOption("--from <dollars>", "range start")
  .requiredOption("--to <dollars>", "range end")
  .option("--step <dollars>", "coarse scan step", "1000")
  .action((flags) => {
    process.exitCode = runCliffs(flags);
  });

solverCommand("invert", "smallest input where the target first reaches a goal (e.g. wages that produce a given tax)")
  .requiredOption("--goal <dollars>", "target value to reach")
  .requiredOption("--lo <dollars>", "search range start")
  .requiredOption("--hi <dollars>", "search range end")
  .action((flags) => {
    process.exitCode = runInvert(flags);
  });

solverCommand("compare", "compare the answer across an enum fact's values")
  .action((flags) => {
    process.exitCode = runCompare({ ...flags, vary: flags.vary === "wages" ? "filingStatus" : flags.vary });
  });

const corpusCmd = program
  .command("corpus")
  .description("inspect the installed rule corpus");
corpusCmd
  .command("hash")
  .description("print the corpus Merkle root")
  .option("--json", "machine-readable output")
  .action((flags) => {
    process.exitCode = runCorpusHash({ json: flags.json });
  });
corpusCmd
  .command("export")
  .description("full corpus as JSON, for independent verifiers (see kernel/)")
  .action(() => {
    process.exitCode = runCorpusExport();
  });
corpusCmd
  .command("list")
  .description("list rules with validity windows and citations")
  .option("--as-of <date>", "only rules valid on this date")
  .option("--json", "machine-readable output")
  .action((flags) => {
    process.exitCode = runCorpusList({ asOf: flags.asOf, json: flags.json });
  });

/** Parse and run. argv defaults to process.argv; pass a custom vector to embed. */
export function runCli(argv?: string[]): void {
  program.parse(argv);
}
