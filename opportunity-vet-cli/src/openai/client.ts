import OpenAI from "openai";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { loadConfig } from "../config.js";
import { withRetry } from "../utils/retry.js";
import { safeJsonParse } from "../utils/json-parse.js";
import type { ScoutResult } from "./schemas/scout.zod.js";
import { ScoutResultSchema } from "./schemas/scout.zod.js";
import type { AnalystResult } from "./schemas/analyst.zod.js";
import { AnalystResultSchema } from "./schemas/analyst.zod.js";
import type { SkepticResult } from "./schemas/skeptic.zod.js";
import { SkepticResultSchema } from "./schemas/skeptic.zod.js";
import type { IdeatorResult } from "./schemas/ideator.zod.js";
import { IdeatorResultSchema } from "./schemas/ideator.zod.js";
import type { SalvageResult } from "./schemas/salvage.zod.js";
import { SalvageResultSchema } from "./schemas/salvage.zod.js";
import type { ZodSchema } from "zod";
import type { DecisionPacket } from "./schemas/packet.zod.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Resolve project root: works from both src/ (dev) and dist/ (prod)
const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

let _client: OpenAI | null = null;
let _totalTokens = 0;

function getClient(): OpenAI {
  if (_client) return _client;
  const config = loadConfig();
  _client = new OpenAI({ apiKey: config.openaiApiKey });
  return _client;
}

function loadPrompt(name: string): string {
  // Try src/ first (dev with tsx), then dist/ (compiled)
  const srcPath = path.join(PROJECT_ROOT, "src", "openai", "prompts", `${name}.md`);
  if (fs.existsSync(srcPath)) {
    return fs.readFileSync(srcPath, "utf-8");
  }
  // Fallback to relative from __dirname (in case structure differs)
  const relativePath = path.join(__dirname, "prompts", `${name}.md`);
  return fs.readFileSync(relativePath, "utf-8");
}

export function getTotalTokens(): number {
  return _totalTokens;
}

export function resetTokenCount(): void {
  _totalTokens = 0;
}

interface CallOptions {
  systemPrompt: string;
  userPrompt: string;
  useWebSearch?: boolean;
}

/**
 * Core call to OpenAI Responses API.
 * Returns the raw text output.
 */
async function callOpenAI(options: CallOptions): Promise<string> {
  const config = loadConfig();
  const client = getClient();

  const tools: OpenAI.Responses.Tool[] = options.useWebSearch
    ? [{ type: "web_search_preview" }]
    : [];

  const result = await withRetry(async () => {
    const response = await client.responses.create({
      model: config.openaiModel,
      instructions: options.systemPrompt,
      input: options.userPrompt,
      tools,
    });

    // Accumulate token usage
    if (response.usage) {
      _totalTokens += (response.usage.input_tokens ?? 0) + (response.usage.output_tokens ?? 0);
    }

    // Extract text from output items
    const textParts: string[] = [];
    for (const item of response.output) {
      if (item.type === "message") {
        for (const content of item.content) {
          if (content.type === "output_text") {
            textParts.push(content.text);
          }
        }
      }
    }

    return textParts.join("\n");
  });

  return result;
}

/**
 * Call OpenAI and validate the JSON response against a Zod schema.
 * Retries up to 2 times on validation failure with error feedback.
 */
async function callAndValidate<T>(
  systemPrompt: string,
  userPrompt: string,
  schema: ZodSchema<T>,
  useWebSearch: boolean = false,
  maxValidationRetries: number = 2
): Promise<T> {
  let lastError: string | null = null;

  for (let attempt = 0; attempt <= maxValidationRetries; attempt++) {
    const prompt =
      attempt === 0
        ? userPrompt
        : `${userPrompt}\n\nYour previous response had a validation error: ${lastError}\nPlease fix the output and return valid JSON.`;

    const raw = await callOpenAI({
      systemPrompt,
      userPrompt: prompt,
      useWebSearch,
    });

    try {
      const parsed = safeJsonParse(raw);
      return schema.parse(parsed);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt === maxValidationRetries) {
        throw new Error(
          `Failed to get valid response after ${maxValidationRetries + 1} attempts. Last error: ${lastError}`
        );
      }
    }
  }

  // Unreachable, but TypeScript needs it
  throw new Error("Validation failed");
}

export interface ScoutInput {
  idea: string;
  niche?: string;
  customer?: string;
  constraints?: string;
  queries: string[];
}

/**
 * Two-phase Scout:
 * Phase 1: Search with web_search (natural language response)
 * Phase 2: Structure results into ScoutResult JSON
 */
export async function runScout(input: ScoutInput): Promise<ScoutResult> {
  const scoutPrompt = loadPrompt("scout");

  const queryList = input.queries.map((q, i) => `${i + 1}. ${q}`).join("\n");
  const userPrompt = `Idea: ${input.idea}
${input.niche ? `Niche: ${input.niche}` : ""}
${input.customer ? `Customer: ${input.customer}` : ""}
${input.constraints ? `Constraints: ${input.constraints}` : ""}

Search queries to use:
${queryList}

Research this idea thoroughly using the search queries above. Find evidence of the pain point, existing competitors, and market signals.`;

  // Phase 1: Search with web_search enabled (natural language)
  const phase1System = `You are a market research scout. Search the web using the provided queries and gather evidence about this business idea. Include specific quotes, URLs, competitor names, pricing signals, and user complaints. Be thorough and factual.`;

  const searchResults = await callOpenAI({
    systemPrompt: phase1System,
    userPrompt,
    useWebSearch: true,
  });

  // Phase 2: Structure into ScoutResult JSON
  const phase2Prompt = `Here are the raw research results for the idea "${input.idea}":

${searchResults}

${scoutPrompt}`;

  return callAndValidate(
    "You are a data structuring assistant. Convert the research results into the exact JSON schema specified. Do not invent any information not present in the research results.",
    phase2Prompt,
    ScoutResultSchema
  );
}

export interface AnalystInput {
  idea: string;
  niche?: string;
  customer?: string;
  constraints?: string;
  evidence: ScoutResult["evidence"];
  competitors: ScoutResult["competitors"];
}

export async function runAnalyst(input: AnalystInput): Promise<AnalystResult> {
  const analystPrompt = loadPrompt("analyst");

  const userPrompt = `Idea: ${input.idea}
${input.niche ? `Niche: ${input.niche}` : ""}
${input.customer ? `Customer: ${input.customer}` : ""}
${input.constraints ? `Constraints: ${input.constraints}` : ""}

Evidence (${input.evidence.length} items):
${JSON.stringify(input.evidence, null, 2)}

Competitors (${input.competitors.length} items):
${JSON.stringify(input.competitors, null, 2)}

${analystPrompt}`;

  return callAndValidate(
    "You are a business opportunity analyst. Analyze the evidence and competitors to assess this opportunity. Be rigorous and evidence-based.",
    userPrompt,
    AnalystResultSchema
  );
}

export interface SkepticInput {
  idea: string;
  niche?: string;
  evidence: ScoutResult["evidence"];
  competitors: ScoutResult["competitors"];
  analysis: AnalystResult;
}

export async function runSkeptic(input: SkepticInput): Promise<SkepticResult> {
  const skepticPrompt = loadPrompt("skeptic");

  const userPrompt = `Idea: ${input.idea}
${input.niche ? `Niche: ${input.niche}` : ""}

Evidence (${input.evidence.length} items):
${JSON.stringify(input.evidence, null, 2)}

Competitors (${input.competitors.length} items):
${JSON.stringify(input.competitors, null, 2)}

Analyst assessment:
${JSON.stringify(input.analysis, null, 2)}

${skepticPrompt}`;

  return callAndValidate(
    "You are a ruthless red-team skeptic. Your job is to find every reason this opportunity will fail. Poke holes in the evidence, find missed competitors, and challenge assumptions.",
    userPrompt,
    SkepticResultSchema
  );
}

export interface RefereeInput {
  idea: string;
  niche?: string;
  customer?: string;
  constraints?: string;
  evidence: ScoutResult["evidence"];
  competitors: ScoutResult["competitors"];
  analysis: AnalystResult;
  skeptic: SkepticResult;
  evidenceStrength: number;
}

export async function runReferee(input: RefereeInput): Promise<Record<string, unknown>> {
  const refereePrompt = loadPrompt("referee");

  const userPrompt = `Idea: ${input.idea}
${input.niche ? `Niche: ${input.niche}` : ""}
${input.customer ? `Customer: ${input.customer}` : ""}
${input.constraints ? `Constraints: ${input.constraints}` : ""}

Evidence (${input.evidence.length} items):
${JSON.stringify(input.evidence, null, 2)}

Competitors (${input.competitors.length} items):
${JSON.stringify(input.competitors, null, 2)}

Analyst assessment:
${JSON.stringify(input.analysis, null, 2)}

Skeptic assessment:
${JSON.stringify(input.skeptic, null, 2)}

Code-computed evidence strength: ${input.evidenceStrength}/5

${refereePrompt}`;

  // Referee returns a raw object — the pipeline will assemble and enforce the final DecisionPacket
  const raw = await callOpenAI({
    systemPrompt: "You are a fair referee synthesizing all perspectives into a final decision packet. Use the code-computed evidence strength score, not your own.",
    userPrompt,
  });

  return safeJsonParse<Record<string, unknown>>(raw);
}

export interface IdeatorInput {
  painPoint: string;
  niche?: string;
  customer?: string;
}

export async function runIdeator(input: IdeatorInput): Promise<IdeatorResult> {
  const ideatorPrompt = loadPrompt("ideator");

  const userPrompt = `Pain point: ${input.painPoint}
${input.niche ? `Niche: ${input.niche}` : ""}
${input.customer ? `Customer: ${input.customer}` : ""}

First, research this pain point to understand its scope, who experiences it, and what solutions (if any) already exist. Then generate 3 distinct business ideas that address it.

${ideatorPrompt}`;

  // Phase 1: Research the pain point with web search
  const researchResults = await callOpenAI({
    systemPrompt: "You are a market researcher. Search the web to understand this pain point: who experiences it, how severe it is, what solutions exist, and what gaps remain. Be thorough and factual.",
    userPrompt: `Research this pain point thoroughly: "${input.painPoint}"${input.niche ? ` in the ${input.niche} space` : ""}${input.customer ? ` experienced by ${input.customer}` : ""}`,
    useWebSearch: true,
  });

  // Phase 2: Generate ideas based on research
  const phase2Prompt = `Here is research on the pain point "${input.painPoint}":

${researchResults}

Based on this research, generate 3 distinct business ideas that solve this pain point. Each must be operable in ≤10 hours/week.

${ideatorPrompt}`;

  return callAndValidate(
    "You are a business idea generator. Create exactly 3 distinct, viable business ideas based on the research provided. Output valid JSON only.",
    phase2Prompt,
    IdeatorResultSchema
  );
}

export interface SalvageIdeaPacket {
  ideaName: string;
  ideaDescription: string;
  rubricScores: DecisionPacket["rubric"];
  noGoReasons: string[];
  wedgeOptions: DecisionPacket["analysis"]["wedgeOptions"];
  premortem: string[];
  competitors: string[];
}

export interface SalvageInput {
  painPoint: string;
  ideas: SalvageIdeaPacket[];
}

export async function runSalvage(input: SalvageInput): Promise<SalvageResult> {
  const salvagePrompt = loadPrompt("salvage");

  const ideaSummaries = input.ideas.map((idea, i) => {
    const dims = [
      `painIntensity: ${idea.rubricScores.painIntensity}/5`,
      `frequency: ${idea.rubricScores.frequency}/5`,
      `buyerClarity: ${idea.rubricScores.buyerClarity}/5`,
      `budgetSignal: ${idea.rubricScores.budgetSignal}/5`,
      `switchingCost: ${idea.rubricScores.switchingCost}/5`,
      `competition: ${idea.rubricScores.competition}/5`,
      `distributionFeasibility: ${idea.rubricScores.distributionFeasibility}/5`,
      `evidenceStrength: ${idea.rubricScores.evidenceStrength}/5`,
    ].join(", ");

    return `--- Idea ${i + 1}: ${idea.ideaName} ---
Description: ${idea.ideaDescription}
Scores: ${dims} | Total: ${idea.rubricScores.total}/40
Decision: ${idea.rubricScores.decision}
NO_GO Reasons: ${idea.noGoReasons.join("; ")}
Top Wedges: ${idea.wedgeOptions.map(w => w.wedge).join("; ") || "none"}
Key Risks: ${idea.premortem.slice(0, 3).join("; ")}
Competitors: ${idea.competitors.slice(0, 5).join("; ")}`;
  }).join("\n\n");

  const userPrompt = `Pain point: ${input.painPoint}

All 3 ideas received NO_GO. Here are their full assessments:

${ideaSummaries}

${salvagePrompt}`;

  return callAndValidate(
    "You are a pivot strategist. All ideas failed vetting. Find the most salvageable elements and generate concrete pivots. Output valid JSON only.",
    userPrompt,
    SalvageResultSchema
  );
}
