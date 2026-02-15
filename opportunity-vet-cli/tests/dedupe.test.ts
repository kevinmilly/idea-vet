import { describe, it, expect } from "vitest";
import { dedupeEvidence, getCredibility } from "../src/pipeline/dedupe.js";
import type { EvidenceItem } from "../src/openai/schemas/scout.zod.js";

describe("dedupeEvidence", () => {
  it("removes duplicate URLs", () => {
    const evidence: EvidenceItem[] = [
      { url: "https://example.com/page", sourceType: "review", quote: "Quote A", theme: "pain", sentiment: "negative", credibility: 3, complaints: [], gaps: [] },
      { url: "https://example.com/page", sourceType: "review", quote: "Quote B", theme: "pain", sentiment: "negative", credibility: 4, complaints: [], gaps: [] },
    ];
    const result = dedupeEvidence(evidence);
    expect(result.evidence).toHaveLength(1);
    expect(result.removedCount).toBe(1);
  });

  it("removes duplicate quotes across different URLs", () => {
    const evidence: EvidenceItem[] = [
      { url: "https://a.com/page", sourceType: "review", quote: "Same quote", theme: "pain", sentiment: "negative", credibility: 3, complaints: [], gaps: [] },
      { url: "https://b.com/page", sourceType: "review", quote: "Same quote", theme: "pain", sentiment: "negative", credibility: 3, complaints: [], gaps: [] },
    ];
    const result = dedupeEvidence(evidence);
    expect(result.evidence).toHaveLength(1);
  });

  it("normalizes URLs (trailing slash, case)", () => {
    const evidence: EvidenceItem[] = [
      { url: "https://Example.com/Page/", sourceType: "review", quote: "Quote A", theme: "pain", sentiment: "negative", credibility: 3, complaints: [], gaps: [] },
      { url: "https://example.com/page", sourceType: "review", quote: "Quote B", theme: "pain", sentiment: "negative", credibility: 3, complaints: [], gaps: [] },
    ];
    const result = dedupeEvidence(evidence);
    expect(result.evidence).toHaveLength(1);
  });

  it("counts unique domains", () => {
    const evidence: EvidenceItem[] = [
      { url: "https://a.com/1", sourceType: "review", quote: "Q1", theme: "pain", sentiment: "negative", credibility: 3, complaints: [], gaps: [] },
      { url: "https://b.com/1", sourceType: "review", quote: "Q2", theme: "pain", sentiment: "negative", credibility: 3, complaints: [], gaps: [] },
      { url: "https://c.com/1", sourceType: "review", quote: "Q3", theme: "pain", sentiment: "negative", credibility: 3, complaints: [], gaps: [] },
    ];
    const result = dedupeEvidence(evidence);
    expect(result.uniqueDomains).toBe(3);
  });

  it("keeps all unique items", () => {
    const evidence: EvidenceItem[] = [
      { url: "https://a.com/1", sourceType: "review", quote: "Q1", theme: "pain", sentiment: "negative", credibility: 3, complaints: [], gaps: [] },
      { url: "https://b.com/1", sourceType: "review", quote: "Q2", theme: "pain", sentiment: "positive", credibility: 4, complaints: [], gaps: [] },
    ];
    const result = dedupeEvidence(evidence);
    expect(result.evidence).toHaveLength(2);
    expect(result.removedCount).toBe(0);
  });
});

describe("getCredibility", () => {
  it("returns 5 for G2", () => {
    expect(getCredibility("https://www.g2.com/products/test")).toBe(5);
  });

  it("returns 4 for Reddit", () => {
    expect(getCredibility("https://www.reddit.com/r/test")).toBe(4);
  });

  it("returns 4 for old.reddit.com", () => {
    expect(getCredibility("https://old.reddit.com/r/test")).toBe(4);
  });

  it("returns 2 for unknown domain", () => {
    expect(getCredibility("https://random-blog.io/article")).toBe(2);
  });

  it("returns 1 for listicle URL", () => {
    expect(getCredibility("https://somesite.com/best-crm-tools")).toBe(1);
  });

  it("returns 1 for top-10 URL", () => {
    expect(getCredibility("https://somesite.com/top-10-tools")).toBe(1);
  });
});
