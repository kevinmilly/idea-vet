/**
 * Safely extract and parse JSON from an LLM response.
 * Handles markdown code fences, leading/trailing text, etc.
 */
export function safeJsonParse<T = unknown>(raw: string): T {
  // Try direct parse first
  try {
    return JSON.parse(raw);
  } catch {
    // Continue to cleanup
  }

  // Strip markdown code fences: ```json ... ``` or ``` ... ```
  let cleaned = raw;
  const fenceMatch = cleaned.match(/```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/);
  if (fenceMatch) {
    cleaned = fenceMatch[1];
    try {
      return JSON.parse(cleaned);
    } catch {
      // Continue
    }
  }

  // Try to find JSON object or array boundaries
  const jsonStart = raw.search(/[\[{]/);
  const jsonEndBrace = raw.lastIndexOf("}");
  const jsonEndBracket = raw.lastIndexOf("]");
  const jsonEnd = Math.max(jsonEndBrace, jsonEndBracket);

  if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
    cleaned = raw.slice(jsonStart, jsonEnd + 1);
    try {
      return JSON.parse(cleaned);
    } catch {
      // Fall through
    }
  }

  throw new Error(`Failed to parse JSON from response:\n${raw.slice(0, 500)}`);
}
