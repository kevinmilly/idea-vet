import crypto from "node:crypto";
import path from "node:path";
import fs from "fs-extra";
import { loadConfig } from "../config.js";
import { runIdeator } from "../openai/client.js";
import { runPipelineCore, type PipelineOptions } from "./run.js";
import { generateReport, generateBrainstormReport } from "./report.js";
import { insertRun } from "../db/index.js";
import type { DecisionPacket } from "../openai/schemas/packet.zod.js";
import type { Idea } from "../openai/schemas/ideator.zod.js";
import { startStep, succeedStep, failStep } from "../utils/spinner.js";

export interface BrainstormOptions {
  painPoint: string;
  niche?: string;
  customer?: string;
  depth: number;
  save: boolean;
  verbose: boolean;
}

export async function runBrainstorm(options: BrainstormOptions): Promise<void> {
  const config = loadConfig();
  const groupId = crypto.randomUUID().slice(0, 12);

  try {
    // --- Step 1: Generate 3 ideas from the pain point ---
    startStep("Generating business ideas from pain point (Ideator)...");
    const ideatorResult = await runIdeator({
      painPoint: options.painPoint,
      niche: options.niche,
      customer: options.customer,
    });
    succeedStep(`Ideator generated ${ideatorResult.ideas.length} ideas`);

    console.log("\nGenerated ideas:");
    for (let i = 0; i < ideatorResult.ideas.length; i++) {
      const idea = ideatorResult.ideas[i];
      console.log(`  ${i + 1}. ${idea.name} — ${idea.description}`);
    }
    console.log("");

    // --- Step 2: Vet each idea through the full pipeline ---
    const packets: DecisionPacket[] = [];
    const reportPaths: string[] = [];

    for (let i = 0; i < ideatorResult.ideas.length; i++) {
      const idea = ideatorResult.ideas[i];
      console.log(`\n--- Vetting idea ${i + 1}/${ideatorResult.ideas.length}: ${idea.name} ---\n`);

      const pipelineOptions: PipelineOptions = {
        idea: `${idea.name}: ${idea.description}`,
        niche: options.niche,
        customer: idea.targetCustomer,
        constraints: `Revenue model: ${idea.revenueModel}. Must be operable in ≤10 hrs/week: ${idea.whyLowTime}`,
        depth: options.depth,
        save: false, // We handle saving ourselves
        verbose: options.verbose,
        groupId,
      };

      const packet = await runPipelineCore(pipelineOptions);
      packets.push(packet);

      // Save individual results if requested
      if (options.save) {
        fs.ensureDirSync(config.outputDir);

        const jsonPath = path.join(config.outputDir, `${packet.runId}.json`);
        const mdPath = path.join(config.outputDir, `${packet.runId}.md`);
        const logPath = path.join(config.outputDir, `${packet.runId}.log.json`);

        fs.writeJsonSync(jsonPath, packet, { spaces: 2 });

        const report = generateReport(packet);
        fs.writeFileSync(mdPath, report, "utf-8");

        const debugLog = (packet as any).__debugLog;
        if (debugLog) {
          fs.writeJsonSync(logPath, debugLog, { spaces: 2 });
        }

        insertRun(packet, jsonPath, mdPath, groupId);
        reportPaths.push(mdPath);
      } else {
        reportPaths.push("");
      }
    }

    // --- Step 3: Generate comparison report ---
    const comparisonReport = generateBrainstormReport(
      options.painPoint,
      ideatorResult.ideas,
      packets,
      reportPaths
    );

    if (options.save) {
      const compPath = path.join(config.outputDir, `${groupId}-brainstorm.md`);
      fs.writeFileSync(compPath, comparisonReport, "utf-8");
      console.log(`\n${"=".repeat(60)}`);
      console.log(`Brainstorm comparison: ${compPath}`);
      console.log(`Individual reports saved for ${packets.length} ideas (group: ${groupId})`);
    } else {
      console.log(`\n${"=".repeat(60)}`);
      console.log(comparisonReport);
    }
  } catch (error) {
    failStep("Brainstorm failed");
    console.error("\nError:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
