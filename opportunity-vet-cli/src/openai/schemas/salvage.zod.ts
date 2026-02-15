import { z } from "zod";

export const ConstraintMappingSchema = z.object({
  noGoReason: z.string(),
  howPivotAddresses: z.string(),
});

export const ValidationTestSchema = z.object({
  test: z.string(),
  metric: z.string(),
  passThreshold: z.string(),
});

export const RubricAdjustmentsSchema = z.object({
  painIntensity: z.number().int().min(-5).max(5),
  frequency: z.number().int().min(-5).max(5),
  buyerClarity: z.number().int().min(-5).max(5),
  budgetSignal: z.number().int().min(-5).max(5),
  switchingCost: z.number().int().min(-5).max(5),
  competition: z.number().int().min(-5).max(5),
  distributionFeasibility: z.number().int().min(-5).max(5),
});

export const PivotSchema = z.object({
  oneLiner: z.string(),
  sourceIdeaName: z.string(),
  notBuilding: z.string(),
  constraintMapping: z.array(ConstraintMappingSchema).min(1),
  validationTests: z.array(ValidationTestSchema).min(1),
  rubricAdjustments: RubricAdjustmentsSchema,
  estimatedTotal: z.number().int().min(0).max(40),
  estimatedDecision: z.enum(["GO", "NO_GO", "UNCLEAR"]),
});

export const SalvageResultSchema = z.object({
  sourceAnalysis: z.string(),
  pivots: z.array(PivotSchema).min(3).max(5),
  recommendation: z.object({
    pivotIndex: z.number().int().min(0),
    rationale: z.string(),
    immediateNextStep: z.string(),
  }),
});

export type ConstraintMapping = z.infer<typeof ConstraintMappingSchema>;
export type ValidationTest = z.infer<typeof ValidationTestSchema>;
export type RubricAdjustments = z.infer<typeof RubricAdjustmentsSchema>;
export type Pivot = z.infer<typeof PivotSchema>;
export type SalvageResult = z.infer<typeof SalvageResultSchema>;
