import { z } from "zod";

export const WedgeOptionSchema = z.object({
  wedge: z.string(),
  whyWorks: z.string(),
  mvp: z.string(),
});

export const RubricDraftSchema = z.object({
  painIntensity: z.number().int().min(0).max(5),
  frequency: z.number().int().min(0).max(5),
  buyerClarity: z.number().int().min(0).max(5),
  budgetSignal: z.number().int().min(0).max(5),
  switchingCost: z.number().int().min(0).max(5),
  competition: z.number().int().min(0).max(5),
  distributionFeasibility: z.number().int().min(0).max(5),
  reasons: z.array(z.string()),
});

export const AnalystResultSchema = z.object({
  painThemes: z.array(z.string()),
  whoPays: z.string().optional(),
  whyNow: z.string().optional(),
  wedgeOptions: z.array(WedgeOptionSchema),
  rubricDraft: RubricDraftSchema,
  premortem: z.array(z.string()),
  nextTests: z.array(z.string()),
});

export type WedgeOption = z.output<typeof WedgeOptionSchema>;
export type RubricDraft = z.output<typeof RubricDraftSchema>;
export type AnalystResult = z.output<typeof AnalystResultSchema>;
