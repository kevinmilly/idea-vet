Convert the research results above into the following JSON structure. Output JSON only — no markdown fences, no explanatory text before or after.

Do not invent facts. Every quote must come from the search results. Every URL must be real. If you cannot find enough information, include what you have and note the gap.

Required JSON schema (ScoutResult):

{
  "queries": ["list of search queries that were used"],
  "evidence": [
    {
      "url": "https://...",
      "title": "Page title (optional)",
      "sourceType": "review|forum|article|social|documentation|other",
      "quote": "Short excerpt from the page — must be a real snippet, not invented",
      "theme": "pain|praise|feature-request|complaint|workaround|pricing|other",
      "sentiment": "positive|negative|neutral|mixed",
      "credibility": 1-5
    }
  ],
  "competitors": [
    {
      "name": "Competitor Name",
      "url": "https://... (optional)",
      "positioning": "How they position themselves",
      "pricingSignals": "Any pricing info found (optional)",
      "complaints": ["User complaints about this competitor"],
      "gaps": ["Features or needs they don't address"]
    }
  ]
}

Requirements:
- Include as many evidence items as possible (target: 10+)
- Include as many competitors as possible (target: 5+)
- Quotes must be short excerpts from actual search snippets — do not fabricate
- Every evidence item must have a URL
- Vary sourceType — don't rely on a single type
- credibility: 5=highly reputable (G2, Gartner), 4=community (Reddit, HN), 3=news/blogs, 2=unknown, 1=SEO spam/listicle
