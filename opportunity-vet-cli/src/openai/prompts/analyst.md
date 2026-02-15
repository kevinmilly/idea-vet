Analyze the evidence and competitors above to assess this business opportunity. Output JSON only — no markdown fences, no explanatory text before or after.

Do not invent facts. Every claim must be tied to evidence themes from the research. If insufficient evidence exists for a conclusion, say so explicitly.

Required JSON schema (AnalystResult):

{
  "painThemes": ["Theme 1: description", "Theme 2: description"],
  "whoPays": "Description of the likely buyer persona and why they would pay",
  "whyNow": "Why this opportunity exists now — what changed recently?",
  "wedgeOptions": [
    {
      "wedge": "Name of the wedge strategy",
      "whyWorks": "Why this wedge would work based on the evidence",
      "mvp": "What a minimal viable product for this wedge would look like"
    }
  ],
  "rubricDraft": {
    "painIntensity": 0-5,
    "frequency": 0-5,
    "buyerClarity": 0-5,
    "budgetSignal": 0-5,
    "switchingCost": 0-5,
    "competition": 0-5,
    "distributionFeasibility": 0-5,
    "reasons": ["Reason for each score — one per score, in order"]
  },
  "premortem": ["Risk 1", "Risk 2"],
  "nextTests": ["Test 1", "Test 2"]
}

Requirements:
- painThemes: Identify 3+ distinct pain themes from the evidence
- wedgeOptions: Provide at least 3 wedge strategies with concrete MVPs
- rubricDraft scores (0-5 each):
  - painIntensity: How severe is the pain? (5 = hair-on-fire problem)
  - frequency: How often do users encounter this pain? (5 = daily)
  - buyerClarity: How clear is who would pay? (5 = obvious buyer with budget)
  - budgetSignal: Is there evidence people spend money here? (5 = clear willingness to pay)
  - switchingCost: How easy to switch from current solution? (5 = very easy to switch, low lock-in)
  - competition: How competitive is the space? (5 = low competition, open field)
  - distributionFeasibility: How easy to reach buyers? (5 = clear distribution channels)
- reasons: One reason per score, in order, explaining why you gave that score
- premortem: At least 3 ways this could fail
- nextTests: At least 5 concrete validation experiments (e.g., "Post in r/X asking about Y", "Interview 5 Z personas")
