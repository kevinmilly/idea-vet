import { describe, it, expect } from "vitest";
import { generateQueries } from "../src/pipeline/scout.js";

describe("generateQueries", () => {
  it("generates base queries with just idea", () => {
    const queries = generateQueries({ idea: "invoice software" });
    expect(queries.length).toBeGreaterThanOrEqual(8);
    expect(queries.some((q) => q.includes("invoice software"))).toBe(true);
    expect(queries.some((q) => q.includes("complaints"))).toBe(true);
    expect(queries.some((q) => q.includes("reddit.com"))).toBe(true);
  });

  it("adds niche queries when niche provided", () => {
    const queries = generateQueries({ idea: "invoice software", niche: "construction" });
    const nicheQueries = queries.filter((q) => q.includes("construction"));
    expect(nicheQueries.length).toBeGreaterThanOrEqual(3);
  });

  it("does NOT add niche queries without niche", () => {
    const queries = generateQueries({ idea: "invoice software" });
    const nicheQueries = queries.filter((q) => q.includes("workflow") || q.includes("manual process"));
    // "workflow" and "manual process" are only in niche queries
    expect(nicheQueries).toHaveLength(0);
  });

  it("adds customer queries when customer provided", () => {
    const queries = generateQueries({ idea: "CRM", customer: "freelancers" });
    const customerQueries = queries.filter((q) => q.includes("freelancers"));
    expect(customerQueries.length).toBeGreaterThanOrEqual(2);
  });
});
