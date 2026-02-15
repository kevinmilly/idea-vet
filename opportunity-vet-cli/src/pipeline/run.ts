import crypto from "node:crypto";
import path from "node:path";
import fs from "fs-extra";
import { loadConfig } from "../config.js";
import { generateQueries } from "./scout.js";
import { dedupeEvidence } from "./dedupe.js";
import { computeEvidenceStrength, computeTotal, applyKillRules } from "./scoring.js";
import { generateReport } from "./report.js";
import { runScout, runAnalyst, runSkeptic, runReferee, getTotalTokens, resetTokenCount } from "../openai/client.js";
import { insertRun } from "../db/index.js";
import { DecisionPacketSchema, type DecisionPacket } from "../openai/schemas/packet.zod.js";
import type { EvidenceItem, CompetitorItem } from "../openai/schemas/scout.zod.js";
import type { AnalystResult } from "../openai/schemas/analyst.zod.js";
import type { SkepticResult } from "../openai/schemas/skeptic.zod.js";
import { startStep, succeedStep, failStep } from "../utils/spinner.js";

export interface PipelineOptions {
  idea: string;
  niche?: string;
  customer?: string;
  constraints?: string;
  depth: number;
  save: boolean;
  verbose: boolean;
}

interface IterationLog {
  iteration: number;
  steps: Array<{
    step: string;
    [key: string]: unknown;
  }>;
}

export async function runPipeline(options: PipelineOptions): Promise<void> {
  const config = loadConfig();
  const runId = crypto.randomUUID().slice(0, 12);
  const createdAt = new Date().toISOString();
  const depth = Math.min(Math.max(options.depth, 1), 2);

  resetTokenCount();

  const debugLog: {
    runId: string;
    startedAt: string;
    completedAt?: string;
    inputs: PipelineOptions;
    iterations: IterationLog[];
    validationFailures: string[];
    killRuleOverrides: string[];
    totalTokens: number;
    estimatedCost: number;
  } = {
    runId,
    startedAt: createdAt,
    inputs: options,
    iterations: [],
    validationFailures: [],
    killRuleOverrides: [],
    totalTokens: 0,
    estimatedCost: 0,
  };

  let allEvidence: EvidenceItem[] = [];
  let allCompetitors: CompetitorItem[] = [];
  let allQueries: string[] = [];
  let latestAnalysis: AnalystResult | null = null;
  let latestSkeptic: SkepticResult | null = null;

  try {
    for (let iteration = 1; iteration <= depth; iteration++) {
      const iterLog: IterationLog = { iteration, steps: [] };

      // --- SCOUT ---
      const queries =
        iteration === 1
          ? generateQueries(options)
          : latestSkeptic?.missingEvidenceQueries ?? [];

      if (queries.length === 0 && iteration > 1) {
        if (options.verbose) console.log(`\nIteration ${iteration}: No additional queries from Skeptic. Skipping.`);
        break;
      }

      allQueries.push(...queries);

      startStep(`Searching for evidence (Scout, iteration ${iteration})...`);
      const tokensBefore = getTotalTokens();
      const scoutResult = await runScout({
        idea: options.idea,
        niche: options.niche,
        customer: options.customer,
        constraints: options.constraints,
        queries,
      });
      succeedStep(`Scout found ${scoutResult.evidence.length} evidence items, ${scoutResult.competitors.length} competitors`);

      iterLog.steps.push({
        step: "scout",
        queries,
        evidenceCount: scoutResult.evidence.length,
        competitorCount: scoutResult.competitors.length,
        tokensUsed: getTotalTokens() - tokensBefore,
      });

      if (options.verbose) {
        console.log(`  Evidence: ${scoutResult.evidence.length} items`);
        console.log(`  Competitors: ${scoutResult.competitors.length} items`);
      }

      // Merge evidence and competitors
      allEvidence.push(...scoutResult.evidence);
      allCompetitors.push(...scoutResult.competitors);

      // --- DEDUPE ---
      startStep(`Deduplicating evidence...`);
      const dedupeResult = dedupeEvidence(allEvidence);
      allEvidence = dedupeResult.evidence;
      succeedStep(`Deduplication: ${allEvidence.length} items, ${dedupeResult.uniqueDomains} domains (removed ${dedupeResult.removedCount})`);

      iterLog.steps.push({
        step: "dedupe",
        before: allEvidence.length + dedupeResult.removedCount,
        after: allEvidence.length,
        uniqueDomains: dedupeResult.uniqueDomains,
      });

      // Dedupe competitors by name
      const compMap = new Map<string, CompetitorItem>();
      for (const c of allCompetitors) {
        const key = c.name.toLowerCase().trim();
        if (!compMap.has(key)) compMap.set(key, c);
      }
      allCompetitors = Array.from(compMap.values());

      // --- ANALYST ---
      startStep(`Analyzing opportunity (Analyst)...`);
      const analystTokensBefore = getTotalTokens();
      latestAnalysis = await runAnalyst({
        idea: options.idea,
        niche: options.niche,
        customer: options.customer,
        constraints: options.constraints,
        evidence: allEvidence,
        competitors: allCompetitors,
      });
      succeedStep(`Analyst: ${latestAnalysis.painThemes.length} pain themes, ${latestAnalysis.wedgeOptions.length} wedge options`);

      iterLog.steps.push({
        step: "analyst",
        painThemes: latestAnalysis.painThemes.length,
        wedgeOptions: latestAnalysis.wedgeOptions.length,
        tokensUsed: getTotalTokens() - analystTokensBefore,
      });

      // --- SKEPTIC (only on non-final iteration, or if depth=1 then also run) ---
      if (iteration < depth || depth === 1) {
        startStep(`Red-teaming the opportunity (Skeptic)...`);
        const skepticTokensBefore = getTotalTokens();
        latestSkeptic = await runSkeptic({
          idea: options.idea,
          niche: options.niche,
          evidence: allEvidence,
          competitors: allCompetitors,
          analysis: latestAnalysis,
        });
        succeedStep(`Skeptic: ${latestSkeptic.counterarguments.length} counterarguments, ${latestSkeptic.missingEvidenceQueries.length} follow-up queries`);

        iterLog.steps.push({
          step: "skeptic",
          counterarguments: latestSkeptic.counterarguments.length,
          missingQueries: latestSkeptic.missingEvidenceQueries,
          tokensUsed: getTotalTokens() - skepticTokensBefore,
        });
      }

      debugLog.iterations.push(iterLog);
    }

    // --- REFEREE ---
    startStep(`Assembling Decision Packet (Referee)...`);
    const evidenceStrength = computeEvidenceStrength(allEvidence);

    const refereeTokensBefore = getTotalTokens();
    const refereeDraft = await runReferee({
      idea: options.idea,
      niche: options.niche,
      customer: options.customer,
      constraints: options.constraints,
      evidence: allEvidence,
      competitors: allCompetitors,
      analysis: latestAnalysis!,
      skeptic: latestSkeptic!,
      evidenceStrength,
    });

    // Assemble final packet from referee draft + code-enforced values
    const draftRubric = (refereeDraft.rubric as Record<string, unknown>) ?? {};
    const draftAnalysis = (refereeDraft.analysis as Record<string, unknown>) ?? {};

    const rubricScores = {
      painIntensity: clampScore(draftRubric.painIntensity),
      frequency: clampScore(draftRubric.frequency),
      buyerClarity: clampScore(draftRubric.buyerClarity),
      budgetSignal: clampScore(draftRubric.budgetSignal),
      switchingCost: clampScore(draftRubric.switchingCost),
      competition: clampScore(draftRubric.competition),
      distributionFeasibility: clampScore(draftRubric.distributionFeasibility),
      evidenceStrength, // code-computed, always override
    };

    const total = computeTotal(rubricScores, evidenceStrength);
    const draftDecision = String(draftRubric.decision ?? "UNCLEAR") as "GO" | "NO_GO" | "UNCLEAR";
    const draftReasons = Array.isArray(draftRubric.reasons) ? draftRubric.reasons.map(String) : [];

    // Apply kill rules
    const killResult = applyKillRules(
      rubricScores,
      latestAnalysis!.wedgeOptions,
      allEvidence.length,
      draftDecision
    );

    const warnings: string[] = [];
    if (allEvidence.length < 10) {
      warnings.push(`Evidence count (${allEvidence.length}) below target of 10.`);
    }
    if (allCompetitors.length < 5) {
      warnings.push(`Competitor count (${allCompetitors.length}) below target of 5.`);
    }
    const domains = new Set(allEvidence.map((e) => { try { return new URL(e.url).hostname; } catch { return e.url; } }));
    if (domains.size < 3) {
      warnings.push(`Domain diversity (${domains.size}) below minimum of 3.`);
    }

    const finalReasons = killResult.overridden
      ? [...killResult.overrideReasons, ...draftReasons]
      : draftReasons;

    if (killResult.overridden) {
      debugLog.killRuleOverrides.push(...killResult.overrideReasons);
    }

    const totalTokens = getTotalTokens();
    // Rough cost estimate: ~$0.005 per 1K tokens for gpt-4o input, ~$0.015 per 1K output
    // Simplified average: ~$0.01 per 1K tokens
    const estimatedCost = parseFloat((totalTokens / 1000 * 0.01).toFixed(4));

    const packet: DecisionPacket = {
      runId,
      createdAt,
      input: {
        idea: options.idea,
        niche: options.niche,
        customer: options.customer,
        constraints: options.constraints,
      },
      evidence: allEvidence,
      competitors: allCompetitors,
      analysis: {
        painThemes: toStringArray(draftAnalysis.painThemes) ?? latestAnalysis!.painThemes,
        whoPays: String(draftAnalysis.whoPays ?? latestAnalysis!.whoPays ?? ""),
        whyNow: String(draftAnalysis.whyNow ?? latestAnalysis!.whyNow ?? ""),
        wedgeOptions: (Array.isArray(draftAnalysis.wedgeOptions) ? draftAnalysis.wedgeOptions : latestAnalysis!.wedgeOptions) as DecisionPacket["analysis"]["wedgeOptions"],
        premortem: toStringArray(draftAnalysis.premortem) ?? latestAnalysis!.premortem,
        nextTests: toStringArray(draftAnalysis.nextTests) ?? latestAnalysis!.nextTests,
      },
      rubric: {
        ...rubricScores,
        total,
        decision: killResult.decision,
        reasons: finalReasons,
      },
      warnings,
      meta: {
        queries: allQueries,
        model: config.openaiModel,
        iterations: debugLog.iterations.length,
        tokenUsage: totalTokens,
        estimatedCost,
      },
    };

    // Validate final packet
    const validated = DecisionPacketSchema.parse(packet);

    succeedStep(`Decision: ${validated.rubric.decision} (Score: ${validated.rubric.total}/40)`);

    // --- OUTPUT ---
    if (options.save) {
      fs.ensureDirSync(config.outputDir);

      const jsonPath = path.join(config.outputDir, `${runId}.json`);
      const mdPath = path.join(config.outputDir, `${runId}.md`);
      const logPath = path.join(config.outputDir, `${runId}.log.json`);

      fs.writeJsonSync(jsonPath, validated, { spaces: 2 });

      const report = generateReport(validated);
      fs.writeFileSync(mdPath, report, "utf-8");

      debugLog.completedAt = new Date().toISOString();
      debugLog.totalTokens = totalTokens;
      debugLog.estimatedCost = estimatedCost;
      fs.writeJsonSync(logPath, debugLog, { spaces: 2 });

      // Save to DB
      insertRun(validated, jsonPath, mdPath);

      console.log(`\nReport saved: ${mdPath}`);
      console.log(`JSON saved:   ${jsonPath}`);
      console.log(`Debug log:    ${logPath}`);
    } else {
      console.log("\n" + generateReport(validated));
    }

    console.log(`\nTokens used: ${totalTokens.toLocaleString()} (~$${estimatedCost})`);
  } catch (error) {
    failStep("Pipeline failed");
    console.error("\nError:", error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

function clampScore(value: unknown): number {
  const n = typeof value === "number" ? value : 0;
  return Math.max(0, Math.min(5, Math.round(n)));
}

function toStringArray(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.map(String);
  }
  return undefined;
}
