#!/usr/bin/env node

import { Command } from "commander";
import dotenv from "dotenv";

dotenv.config();

const program = new Command();

program
  .name("vet")
  .description("CLI tool for vetting business opportunities using AI-powered research")
  .version("1.0.0");

program
  .command("run")
  .description("Run opportunity vetting on an idea")
  .requiredOption("--idea <string>", "The idea or pain point to vet")
  .option("--niche <string>", "Target niche or industry")
  .option("--customer <string>", "Target customer persona")
  .option("--constraints <string>", "Additional constraints or context")
  .option("--depth <number>", "Max critique iterations (1 or 2)", "2")
  .option("--save <boolean>", "Save results to files and DB", "true")
  .option("--verbose", "Show intermediate step output", false)
  .action(async (options) => {
    const { runPipeline } = await import("./pipeline/run.js");
    await runPipeline({
      idea: options.idea,
      niche: options.niche,
      customer: options.customer,
      constraints: options.constraints,
      depth: parseInt(options.depth, 10),
      save: options.save !== "false",
      verbose: options.verbose,
    });
  });

program
  .command("history")
  .description("View past vetting runs")
  .option("--limit <number>", "Number of runs to show", "20")
  .action(async (options) => {
    const { showHistory } = await import("./db/index.js");
    const limit = parseInt(options.limit, 10);
    const runs = showHistory(limit);
    if (runs.length === 0) {
      console.log("No runs found.");
      return;
    }
    console.log(
      "\n" +
        ["Run ID", "Date", "Idea", "Decision", "Score"]
          .map((h) => h.padEnd(20))
          .join("") +
        "\n" +
        "-".repeat(100)
    );
    for (const run of runs) {
      console.log(
        [
          run.runId.slice(0, 16),
          run.createdAt.slice(0, 16),
          run.idea.slice(0, 18),
          run.decision,
          String(run.totalScore),
        ]
          .map((v) => v.padEnd(20))
          .join("")
      );
    }
    console.log();
  });

program
  .command("brainstorm")
  .description("Generate and vet 3 business ideas from a pain point")
  .requiredOption("--pain <string>", "The pain point to brainstorm solutions for")
  .option("--niche <string>", "Target niche or industry")
  .option("--customer <string>", "Target customer persona")
  .option("--depth <number>", "Max critique iterations (1 or 2)", "1")
  .option("--save <boolean>", "Save results to files and DB", "true")
  .option("--verbose", "Show intermediate step output", false)
  .action(async (options) => {
    const { runBrainstorm } = await import("./pipeline/brainstorm.js");
    await runBrainstorm({
      painPoint: options.pain,
      niche: options.niche,
      customer: options.customer,
      depth: parseInt(options.depth, 10),
      save: options.save !== "false",
      verbose: options.verbose,
    });
  });

program
  .command("show <runId>")
  .description("Show a specific vetting run")
  .action(async (runId: string) => {
    const { showRun } = await import("./db/index.js");
    const fs = await import("fs-extra");
    const run = showRun(runId);
    if (!run) {
      console.error(`Run "${runId}" not found.`);
      process.exit(1);
    }
    if (run.mdPath && fs.existsSync(run.mdPath)) {
      const content = fs.readFileSync(run.mdPath, "utf-8");
      console.log(content);
    } else {
      console.log(`Run found but no markdown report at: ${run.mdPath}`);
      console.log(`JSON path: ${run.jsonPath}`);
    }
  });

program.parse();
