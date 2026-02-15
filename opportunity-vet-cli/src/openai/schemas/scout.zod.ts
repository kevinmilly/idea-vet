import { z } from "zod";

export const EvidenceItemSchema = z.object({
  url: z.string(),
  title: z.string().optional(),
  sourceType: z.string(),
  quote: z.string(),
  theme: z.string(),
  sentiment: z.enum(["positive", "negative", "neutral", "mixed"]),
  credibility: z.number().int().min(1).max(5),
});

export const CompetitorItemSchema = z.object({
  name: z.string(),
  url: z.string().optional(),
  positioning: z.string(),
  pricingSignals: z.string().optional(),
  complaints: z.array(z.string()),
  gaps: z.array(z.string()),
});

export const ScoutResultSchema = z.object({
  queries: z.array(z.string()),
  evidence: z.array(EvidenceItemSchema),
  competitors: z.array(CompetitorItemSchema),
});

export type EvidenceItem = z.output<typeof EvidenceItemSchema>;
export type CompetitorItem = z.output<typeof CompetitorItemSchema>;
export type ScoutResult = z.output<typeof ScoutResultSchema>;
