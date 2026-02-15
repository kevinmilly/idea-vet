import type { EvidenceItem } from "../openai/schemas/scout.zod.js";

/**
 * Domain credibility tiers.
 * 5 = highly reputable review/research
 * 4 = trusted community/forum
 * 3 = news/blogs
 * 2 = unknown (default)
 * 1 = SEO spam / listicle
 */
const CREDIBILITY_TIERS: Record<string, number> = {
  // Tier 5 — Review/research platforms
  "g2.com": 5,
  "capterra.com": 5,
  "trustpilot.com": 5,
  "gartner.com": 5,
  "forrester.com": 5,
  "trustradius.com": 5,
  "getapp.com": 5,

  // Tier 4 — Community/forums
  "reddit.com": 4,
  "news.ycombinator.com": 4,
  "stackoverflow.com": 4,
  "producthunt.com": 4,
  "indiehackers.com": 4,
  "quora.com": 4,
  "slashdot.org": 4,

  // Tier 3 — News/tech blogs
  "techcrunch.com": 3,
  "theverge.com": 3,
  "arstechnica.com": 3,
  "wired.com": 3,
  "zdnet.com": 3,
  "venturebeat.com": 3,
  "bloomberg.com": 3,
  "forbes.com": 3,
  "hbr.org": 3,
};

const LISTICLE_PATTERNS = [
  /\/best[-_].*[-_]tools/i,
  /\/top[-_]?\d+/i,
  /\/\d+[-_]best/i,
  /best[-_].*[-_]software/i,
];

export function getCredibility(url: string): number {
  try {
    const hostname = new URL(url).hostname.replace(/^www\./, "");

    // Check exact domain match
    if (CREDIBILITY_TIERS[hostname]) {
      return CREDIBILITY_TIERS[hostname];
    }

    // Check parent domain (e.g., old.reddit.com → reddit.com)
    const parts = hostname.split(".");
    if (parts.length > 2) {
      const parent = parts.slice(-2).join(".");
      if (CREDIBILITY_TIERS[parent]) {
        return CREDIBILITY_TIERS[parent];
      }
    }

    // Check for listicle patterns (low credibility)
    for (const pattern of LISTICLE_PATTERNS) {
      if (pattern.test(url)) {
        return 1;
      }
    }

    // Default
    return 2;
  } catch {
    return 2;
  }
}

function normalizeUrl(url: string): string {
  try {
    const u = new URL(url);
    return `${u.protocol}//${u.hostname}${u.pathname}`.replace(/\/+$/, "").toLowerCase();
  } catch {
    return url.toLowerCase().replace(/\/+$/, "");
  }
}

function normalizeQuote(quote: string): string {
  return quote.toLowerCase().replace(/\s+/g, " ").trim();
}

export function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export interface DedupeResult {
  evidence: EvidenceItem[];
  uniqueDomains: number;
  removedCount: number;
}

export function dedupeEvidence(evidence: EvidenceItem[]): DedupeResult {
  const seen = new Map<string, EvidenceItem>();
  const seenQuotes = new Set<string>();
  let removedCount = 0;

  for (const item of evidence) {
    const normUrl = normalizeUrl(item.url);
    const normQuote = normalizeQuote(item.quote);

    // Skip if exact same quote already seen
    if (seenQuotes.has(normQuote)) {
      removedCount++;
      continue;
    }

    // If same URL, keep the one with higher credibility or longer quote
    if (seen.has(normUrl)) {
      const existing = seen.get(normUrl)!;
      if (item.credibility > existing.credibility || item.quote.length > existing.quote.length) {
        seen.set(normUrl, item);
      }
      removedCount++;
      continue;
    }

    seen.set(normUrl, item);
    seenQuotes.add(normQuote);
  }

  const deduped = Array.from(seen.values());

  // Apply code-computed credibility based on domain
  const withCredibility = deduped.map((item) => ({
    ...item,
    credibility: getCredibility(item.url),
  }));

  const domains = new Set(withCredibility.map((e) => getDomain(e.url)));

  return {
    evidence: withCredibility,
    uniqueDomains: domains.size,
    removedCount,
  };
}
