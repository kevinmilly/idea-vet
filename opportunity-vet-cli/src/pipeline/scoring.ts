import type { EvidenceItem } from "../openai/schemas/scout.zod.js";
import type { Rubric } from "../openai/schemas/packet.zod.js";
import type { WedgeOption } from "../openai/schemas/analyst.zod.js";
import { getDomain } from "./dedupe.js";

const HIGH_CREDIBILITY_DOMAINS = new Set([
  "g2.com", "capterra.com", "trustpilot.com", "gartner.com",
  "forrester.com", "trustradius.com", "getapp.com",
  "reddit.com", "news.ycombinator.com", "stackoverflow.com",
  "producthunt.com", "indiehackers.com",
]);

export function computeEvidenceStrength(evidence: EvidenceItem[]): number {
  const count = evidence.length;
  const domains = new Set(evidence.map((e) => getDomain(e.url)));
  const uniqueDomains = domains.size;

  const reviewSources = evidence.filter((e) => {
    const domain = getDomain(e.url);
    return HIGH_CREDIBILITY_DOMAINS.has(domain);
  });

  const lowCredCount = evidence.filter((e) => e.credibility <= 1).length;
  const lowCredRatio = count > 0 ? lowCredCount / count : 0;

  // Base score from evidence count
  let score = Math.min(5, Math.floor(count / 6));

  // Bonuses
  if (uniqueDomains >= 5) score += 1;
  if (reviewSources.length >= 2) score += 1;

  // Penalties
  if (lowCredRatio > 0.4) score -= 1;
  if (count < 10) score -= 1;

  // Clamp
  return Math.max(0, Math.min(5, score));
}

export interface RubricScores {
  painIntensity: number;
  frequency: number;
  buyerClarity: number;
  budgetSignal: number;
  switchingCost: number;
  competition: number;
  distributionFeasibility: number;
}

export function computeTotal(scores: RubricScores, evidenceStrength: number): number {
  return (
    scores.painIntensity +
    scores.frequency +
    scores.buyerClarity +
    scores.budgetSignal +
    scores.switchingCost +
    scores.competition +
    scores.distributionFeasibility +
    evidenceStrength
  );
}

export interface KillRuleResult {
  decision: "GO" | "NO_GO" | "UNCLEAR";
  overridden: boolean;
  overrideReasons: string[];
}

export function applyKillRules(
  rubric: Omit<Rubric, "total" | "decision" | "reasons">,
  wedgeOptions: WedgeOption[],
  evidenceCount: number,
  originalDecision: "GO" | "NO_GO" | "UNCLEAR"
): KillRuleResult {
  const reasons: string[] = [];

  // Kill rule 1: evidenceStrength <= 1 → NO_GO
  if (rubric.evidenceStrength <= 1) {
    reasons.push("Kill rule: evidenceStrength <= 1 — insufficient evidence to proceed.");
  }

  // Kill rule 2: distributionFeasibility <= 1 → NO_GO
  if (rubric.distributionFeasibility <= 1) {
    reasons.push("Kill rule: distributionFeasibility <= 1 — no clear way to reach buyers.");
  }

  // Kill rule 3: competition <= 1 AND no wedge options → NO_GO
  if (rubric.competition <= 1 && wedgeOptions.length === 0) {
    reasons.push("Kill rule: competition <= 1 with no wedge options — market is saturated with no differentiation path.");
  }

  // Kill rule 4: buyerClarity <= 1 AND evidence < 10 → UNCLEAR
  const unclearRule = rubric.buyerClarity <= 1 && evidenceCount < 10;

  if (reasons.length > 0) {
    return {
      decision: "NO_GO",
      overridden: originalDecision !== "NO_GO",
      overrideReasons: reasons,
    };
  }

  if (unclearRule) {
    const unclearReason = "Kill rule: buyerClarity <= 1 with insufficient evidence — cannot determine buyer.";
    return {
      decision: "UNCLEAR",
      overridden: originalDecision !== "UNCLEAR" && originalDecision !== "NO_GO",
      overrideReasons: [unclearReason],
    };
  }

  return {
    decision: originalDecision,
    overridden: false,
    overrideReasons: [],
  };
}
