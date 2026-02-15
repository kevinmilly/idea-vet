import { describe, it, expect } from "vitest";
import { safeJsonParse } from "../src/utils/json-parse.js";

describe("safeJsonParse", () => {
  it("parses plain JSON", () => {
    const result = safeJsonParse('{"key": "value"}');
    expect(result).toEqual({ key: "value" });
  });

  it("strips markdown json fences", () => {
    const raw = '```json\n{"key": "value"}\n```';
    const result = safeJsonParse(raw);
    expect(result).toEqual({ key: "value" });
  });

  it("strips plain markdown fences", () => {
    const raw = '```\n{"key": "value"}\n```';
    const result = safeJsonParse(raw);
    expect(result).toEqual({ key: "value" });
  });

  it("extracts JSON from surrounding text", () => {
    const raw = 'Here is the result:\n{"key": "value"}\nDone!';
    const result = safeJsonParse(raw);
    expect(result).toEqual({ key: "value" });
  });

  it("handles arrays", () => {
    const raw = '[1, 2, 3]';
    const result = safeJsonParse(raw);
    expect(result).toEqual([1, 2, 3]);
  });

  it("throws on completely invalid input", () => {
    expect(() => safeJsonParse("not json at all")).toThrow();
  });
});
