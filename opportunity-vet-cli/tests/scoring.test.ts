import { describe, it, expect } from "vitest";
import { computeEvidenceStrength, computeTotal, applyKillRules } from "../src/pipeline/scoring.js";
import type { EvidenceItem } from "../src/openai/schemas/scout.zod.js";

function makeEvidence(count: number, domain = "example.com"): EvidenceItem[] {
  return Array.from({ length: count }, (_, i) => ({
    url: `https://${domain}/page-${i}`,
    sourceType: "review",
    quote: `Quote ${i}`,
    theme: "pain",
    sentiment: "negative" as const,
    credibility: 3,
    complaints: [],
    gaps: [],
  }));
}

describe("computeEvidenceStrength", () => {
  it("returns 0 for empty evidence", () => {
    expect(computeEvidenceStrength([])).toBe(0);
  });

  it("penalizes evidence count below 10", () => {
    const evidence = makeEvidence(5);
    const score = computeEvidenceStrength(evidence);
    expect(score).toBeLessThanOrEqual(3);
  });

  it("gives higher score for diverse domains", () => {
    const diverse = [
      ...makeEvidence(3, "g2.com"),
      ...makeEvidence(3, "reddit.com"),
      ...makeEvidence(3, "capterra.com"),
      ...makeEvidence(3, "techcrunch.com"),
      ...makeEvidence(3, "indiehackers.com"),
    ];
    const single = makeEvidence(15, "example.com");
    expect(computeEvidenceStrength(diverse)).toBeGreaterThan(computeEvidenceStrength(single));
  });

  it("clamps between 0 and 5", () => {
    const score = computeEvidenceStrength(makeEvidence(100, "g2.com"));
    expect(score).toBeGreaterThanOrEqual(0);
    expect(score).toBeLessThanOrEqual(5);
  });
});

describe("computeTotal", () => {
  it("sums all scores", () => {
    const scores = {
      painIntensity: 3,
      frequency: 4,
      buyerClarity: 2,
      budgetSignal: 3,
      switchingCost: 4,
      competition: 3,
      distributionFeasibility: 3,
    };
    expect(computeTotal(scores, 3)).toBe(25);
  });

  it("handles all zeros", () => {
    const scores = {
      painIntensity: 0,
      frequency: 0,
      buyerClarity: 0,
      budgetSignal: 0,
      switchingCost: 0,
      competition: 0,
      distributionFeasibility: 0,
    };
    expect(computeTotal(scores, 0)).toBe(0);
  });

  it("handles all fives", () => {
    const scores = {
      painIntensity: 5,
      frequency: 5,
      buyerClarity: 5,
      budgetSignal: 5,
      switchingCost: 5,
      competition: 5,
      distributionFeasibility: 5,
    };
    expect(computeTotal(scores, 5)).toBe(40);
  });
});

describe("applyKillRules", () => {
  const baseRubric = {
    painIntensity: 3,
    frequency: 3,
    buyerClarity: 3,
    budgetSignal: 3,
    switchingCost: 3,
    competition: 3,
    distributionFeasibility: 3,
    evidenceStrength: 3,
  };

  it("forces NO_GO when evidenceStrength <= 1", () => {
    const rubric = { ...baseRubric, evidenceStrength: 1 };
    const result = applyKillRules(rubric, [{ wedge: "W", whyWorks: "Y", mvp: "M" }], 10, "GO");
    expect(result.decision).toBe("NO_GO");
    expect(result.overridden).toBe(true);
  });

  it("forces NO_GO when evidenceStrength is 0", () => {
    const rubric = { ...baseRubric, evidenceStrength: 0 };
    const result = applyKillRules(rubric, [], 5, "GO");
    expect(result.decision).toBe("NO_GO");
    expect(result.overridden).toBe(true);
  });

  it("forces NO_GO when distributionFeasibility <= 1", () => {
    const rubric = { ...baseRubric, distributionFeasibility: 1 };
    const result = applyKillRules(rubric, [], 10, "GO");
    expect(result.decision).toBe("NO_GO");
    expect(result.overridden).toBe(true);
  });

  it("forces NO_GO when competition <= 1 and no wedges", () => {
    const rubric = { ...baseRubric, competition: 1 };
    const result = applyKillRules(rubric, [], 10, "GO");
    expect(result.decision).toBe("NO_GO");
    expect(result.overridden).toBe(true);
  });

  it("does NOT force NO_GO when competition <= 1 but wedges exist", () => {
    const rubric = { ...baseRubric, competition: 1 };
    const result = applyKillRules(rubric, [{ wedge: "W", whyWorks: "Y", mvp: "M" }], 10, "GO");
    expect(result.decision).toBe("GO");
    expect(result.overridden).toBe(false);
  });

  it("forces UNCLEAR when buyerClarity <= 1 and evidence < 10", () => {
    const rubric = { ...baseRubric, buyerClarity: 1 };
    const result = applyKillRules(rubric, [], 7, "GO");
    expect(result.decision).toBe("UNCLEAR");
    expect(result.overridden).toBe(true);
  });

  it("does not override when no kill rules triggered", () => {
    const result = applyKillRules(baseRubric, [], 10, "GO");
    expect(result.decision).toBe("GO");
    expect(result.overridden).toBe(false);
  });
});
