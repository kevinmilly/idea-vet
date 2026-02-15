import { z } from "zod";
import { EvidenceItemSchema, CompetitorItemSchema } from "./scout.zod.js";
import { WedgeOptionSchema } from "./analyst.zod.js";

export const RubricSchema = z.object({
  painIntensity: z.number().int().min(0).max(5),
  frequency: z.number().int().min(0).max(5),
  buyerClarity: z.number().int().min(0).max(5),
  budgetSignal: z.number().int().min(0).max(5),
  switchingCost: z.number().int().min(0).max(5),
  competition: z.number().int().min(0).max(5),
  distributionFeasibility: z.number().int().min(0).max(5),
  evidenceStrength: z.number().int().min(0).max(5),
  total: z.number().int().min(0).max(40),
  decision: z.enum(["GO", "NO_GO", "UNCLEAR"]),
  reasons: z.array(z.string()),
});

export const DecisionPacketSchema = z.object({
  runId: z.string(),
  createdAt: z.string(),
  input: z.object({
    idea: z.string(),
    niche: z.string().optional(),
    customer: z.string().optional(),
    constraints: z.string().optional(),
  }),
  evidence: z.array(EvidenceItemSchema),
  competitors: z.array(CompetitorItemSchema),
  analysis: z.object({
    painThemes: z.array(z.string()),
    whoPays: z.string().optional(),
    whyNow: z.string().optional(),
    wedgeOptions: z.array(WedgeOptionSchema),
    premortem: z.array(z.string()),
    nextTests: z.array(z.string()),
  }),
  rubric: RubricSchema,
  warnings: z.array(z.string()),
  meta: z.object({
    queries: z.array(z.string()),
    model: z.string(),
    iterations: z.number().int(),
    tokenUsage: z.number().int(),
    estimatedCost: z.number(),
  }),
});

export type Rubric = z.infer<typeof RubricSchema>;
export type DecisionPacket = z.infer<typeof DecisionPacketSchema>;
