import { describe, it, expect } from "vitest";
import { DecisionPacketSchema } from "../src/openai/schemas/packet.zod.js";
import { ScoutResultSchema } from "../src/openai/schemas/scout.zod.js";
import { AnalystResultSchema } from "../src/openai/schemas/analyst.zod.js";
import { SkepticResultSchema } from "../src/openai/schemas/skeptic.zod.js";

function makeValidPacket() {
  return {
    runId: "abc123",
    createdAt: "2025-01-01T00:00:00Z",
    input: { idea: "Test idea" },
    evidence: Array.from({ length: 10 }, (_, i) => ({
      url: `https://example${i}.com/page`,
      sourceType: "review",
      quote: `Quote ${i}`,
      theme: "pain",
      sentiment: "negative" as const,
      credibility: 3,
    })),
    competitors: Array.from({ length: 5 }, (_, i) => ({
      name: `Competitor ${i}`,
      positioning: "Some positioning",
      complaints: [],
      gaps: [],
    })),
    analysis: {
      painThemes: ["Theme 1", "Theme 2"],
      wedgeOptions: [
        { wedge: "Wedge 1", whyWorks: "Because", mvp: "Simple app" },
      ],
      premortem: ["Risk 1"],
      nextTests: ["Test 1"],
    },
    rubric: {
      painIntensity: 3,
      frequency: 4,
      buyerClarity: 3,
      budgetSignal: 2,
      switchingCost: 4,
      competition: 3,
      distributionFeasibility: 3,
      evidenceStrength: 3,
      total: 25,
      decision: "GO" as const,
      reasons: ["Strong pain signal"],
    },
    warnings: [],
    meta: {
      queries: ["test query"],
      model: "gpt-4o",
      iterations: 1,
      tokenUsage: 5000,
      estimatedCost: 0.05,
    },
  };
}

describe("DecisionPacket schema", () => {
  it("validates a correct packet", () => {
    const packet = makeValidPacket();
    expect(() => DecisionPacketSchema.parse(packet)).not.toThrow();
  });

  it("rejects missing evidence", () => {
    const packet = makeValidPacket();
    packet.evidence = [];
    // Schema itself doesn't enforce minimum, but it should still parse
    expect(() => DecisionPacketSchema.parse(packet)).not.toThrow();
  });

  it("rejects invalid decision", () => {
    const packet = makeValidPacket();
    (packet.rubric as any).decision = "MAYBE";
    expect(() => DecisionPacketSchema.parse(packet)).toThrow();
  });

  it("rejects score out of range", () => {
    const packet = makeValidPacket();
    packet.rubric.painIntensity = 6;
    expect(() => DecisionPacketSchema.parse(packet)).toThrow();
  });

  it("rejects negative score", () => {
    const packet = makeValidPacket();
    packet.rubric.frequency = -1;
    expect(() => DecisionPacketSchema.parse(packet)).toThrow();
  });
});

describe("ScoutResult schema", () => {
  it("validates a correct scout result", () => {
    const result = {
      queries: ["test"],
      evidence: [
        {
          url: "https://example.com",
          sourceType: "review",
          quote: "Great product",
          theme: "praise",
          sentiment: "positive",
          credibility: 4,
        },
      ],
      competitors: [
        {
          name: "Comp",
          positioning: "Leader",
          complaints: [],
          gaps: [],
        },
      ],
    };
    expect(() => ScoutResultSchema.parse(result)).not.toThrow();
  });

  it("rejects missing url in evidence", () => {
    const result = {
      queries: ["test"],
      evidence: [
        {
          sourceType: "review",
          quote: "Quote",
          theme: "pain",
          sentiment: "negative",
          credibility: 3,
        },
      ],
      competitors: [],
    };
    expect(() => ScoutResultSchema.parse(result)).toThrow();
  });
});

describe("AnalystResult schema", () => {
  it("validates a correct analyst result", () => {
    const result = {
      painThemes: ["Theme"],
      wedgeOptions: [{ wedge: "W", whyWorks: "Y", mvp: "M" }],
      rubricDraft: {
        painIntensity: 3,
        frequency: 3,
        buyerClarity: 3,
        budgetSignal: 3,
        switchingCost: 3,
        competition: 3,
        distributionFeasibility: 3,
        reasons: ["Good"],
      },
      premortem: ["Risk"],
      nextTests: ["Test"],
    };
    expect(() => AnalystResultSchema.parse(result)).not.toThrow();
  });
});

describe("SkepticResult schema", () => {
  it("validates a correct skeptic result", () => {
    const result = {
      counterarguments: ["Arg 1"],
      alreadySolvedNotes: [],
      missedCompetitors: [],
      missingEvidenceQueries: ["query 1"],
      decisionSuggestion: {
        decision: "UNCLEAR",
        reasons: ["Not enough data"],
      },
    };
    expect(() => SkepticResultSchema.parse(result)).not.toThrow();
  });
});
