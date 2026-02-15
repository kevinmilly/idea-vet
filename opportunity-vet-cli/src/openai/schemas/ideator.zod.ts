import { z } from "zod";

export const IdeaSchema = z.object({
  name: z.string(),
  description: z.string(),
  targetCustomer: z.string(),
  revenueModel: z.string(),
  whyLowTime: z.string(),
});

export const IdeatorResultSchema = z.object({
  ideas: z.array(IdeaSchema).length(3),
});

export type Idea = z.infer<typeof IdeaSchema>;
export type IdeatorResult = z.infer<typeof IdeatorResultSchema>;
