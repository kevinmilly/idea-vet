import crypto from "node:crypto";
import path from "node:path";
import fs from "fs-extra";
import { loadConfig } from "../config.js";
import { runIdeator, runSalvage, type SalvageIdeaPacket } from "../openai/client.js";
import { runPipelineCore, type PipelineOptions } from "./run.js";
import { generateReport, generateBrainstormReport } from "./report.js";
import { insertRun } from "../db/index.js";
import { applyKillRules } from "./scoring.js";
import type { DecisionPacket } from "../openai/schemas/packet.zod.js";
import type { Idea } from "../openai/schemas/ideator.zod.js";
import type { SalvageResult } from "../openai/schemas/salvage.zod.js";
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

        const txtPath = path.join(config.outputDir, `${packet.runId}.txt`);

        const report = generateReport(packet);
        fs.writeFileSync(txtPath, report, "utf-8");

        insertRun(packet, txtPath, txtPath, groupId);
        reportPaths.push(txtPath);
      } else {
        reportPaths.push("");
      }
    }

    // --- Step 2.5: Pivot Salvage (only if all ideas are NO_GO) ---
    let salvageResult: SalvageResult | undefined;

    if (packets.every(p => p.rubric.decision === "NO_GO")) {
      try {
        startStep("All ideas got NO_GO — running Pivot Salvage...");

        const salvageIdeas: SalvageIdeaPacket[] = packets.map((packet, i) => ({
          ideaName: ideatorResult.ideas[i].name,
          ideaDescription: ideatorResult.ideas[i].description,
          rubricScores: packet.rubric,
          noGoReasons: packet.rubric.reasons,
          wedgeOptions: packet.analysis.wedgeOptions,
          premortem: packet.analysis.premortem,
          competitors: packet.competitors.map(c => c.name),
        }));

        salvageResult = await runSalvage({
          painPoint: options.painPoint,
          ideas: salvageIdeas,
        });

        // Re-validate each pivot's estimated scores against kill rules (code enforces, not AI)
        for (const pivot of salvageResult.pivots) {
          const sourcePacket = packets.find((_, i) =>
            ideatorResult.ideas[i].name === pivot.sourceIdeaName
          );
          if (!sourcePacket) continue;

          const estimatedScores = {
            painIntensity: clamp(sourcePacket.rubric.painIntensity + pivot.rubricAdjustments.painIntensity, 0, 5),
            frequency: clamp(sourcePacket.rubric.frequency + pivot.rubricAdjustments.frequency, 0, 5),
            buyerClarity: clamp(sourcePacket.rubric.buyerClarity + pivot.rubricAdjustments.buyerClarity, 0, 5),
            budgetSignal: clamp(sourcePacket.rubric.budgetSignal + pivot.rubricAdjustments.budgetSignal, 0, 5),
            switchingCost: clamp(sourcePacket.rubric.switchingCost + pivot.rubricAdjustments.switchingCost, 0, 5),
            competition: clamp(sourcePacket.rubric.competition + pivot.rubricAdjustments.competition, 0, 5),
            distributionFeasibility: clamp(sourcePacket.rubric.distributionFeasibility + pivot.rubricAdjustments.distributionFeasibility, 0, 5),
            evidenceStrength: sourcePacket.rubric.evidenceStrength, // frozen
          };

          const total = Object.values(estimatedScores).reduce((a, b) => a + b, 0);
          pivot.estimatedTotal = total;

          // Re-apply kill rules to get the real decision
          const killResult = applyKillRules(
            estimatedScores,
            sourcePacket.analysis.wedgeOptions,
            sourcePacket.evidence.length,
            pivot.estimatedDecision
          );
          pivot.estimatedDecision = killResult.decision;
        }

        succeedStep(`Salvage generated ${salvageResult.pivots.length} pivots`);
      } catch (error) {
        // Salvage failure is non-fatal — report still generates without salvage section
        failStep("Pivot Salvage failed (non-fatal, continuing)");
        if (options.verbose) {
          console.error("  Salvage error:", error instanceof Error ? error.message : error);
        }
      }
    }

    // --- Step 3: Generate comparison report ---
    const comparisonReport = generateBrainstormReport(
      options.painPoint,
      ideatorResult.ideas,
      packets,
      reportPaths,
      salvageResult
    );

    if (options.save) {
      const compPath = path.join(config.outputDir, `${groupId}-brainstorm.txt`);
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

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Math.round(value)));
}
