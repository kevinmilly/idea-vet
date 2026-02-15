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
import type { ZodSchema } from "zod";

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
