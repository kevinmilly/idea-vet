import { z } from "zod";

export const SkepticResultSchema = z.object({
  counterarguments: z.array(z.string()),
  alreadySolvedNotes: z.array(z.string()),
  missedCompetitors: z.array(z.string()),
  missingEvidenceQueries: z.array(z.string()),
  decisionSuggestion: z.object({
    decision: z.enum(["GO", "NO_GO", "UNCLEAR"]),
    reasons: z.array(z.string()),
  }),
});

export type SkepticResult = z.output<typeof SkepticResultSchema>;
