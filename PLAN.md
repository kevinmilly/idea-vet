# CLI Opportunity Vetting Agent — Revised Build Spec

## Objective

Create a **CLI tool** that takes an idea/pain point and outputs a **Decision Packet**:

* Evidence digest (quotes + URLs)
* Competitor list + gaps
* Gap hypotheses + wedge options
* Rubric scoring + GO / NO_GO / UNCLEAR
* Premortem + next validation tests
* Saved run history (SQLite + files)

## Constraints

* Use **OpenAI Responses API** with **web_search** tool
* Output must be **structured JSON** + **Markdown report**
* CLI only — no UI, servers, or Firebase
* Max 2 critique loops (to avoid infinite self-chatter)
* Enforce "kill rules" in code (not just prompt)

---

## Tech Stack

* **TypeScript (Node 20+)**
* **tsx** for development, **tsc** for production build
* Packages:
  * `commander` — CLI parsing
  * `zod` — schema validation
  * `better-sqlite3` — SQLite
  * `dotenv` — env config
  * `fs-extra` — file operations
  * `openai` — official SDK
  * `ora` — progress spinners
  * `vitest` — testing

---

## Repository Layout

```
opportunity-vet-cli/
  src/
    cli.ts                    # Entry point + commander setup
    config.ts                 # Env loading + defaults
    utils/
      retry.ts                # Exponential backoff wrapper
      spinner.ts              # Progress indicator helpers
      json-parse.ts           # Safe JSON extraction (strip fences, etc.)
    db/
      index.ts                # DB init + query functions
      schema.sql              # Table definitions
      migrate.ts              # Run migrations on startup
    openai/
      client.ts               # OpenAI wrapper (Responses API)
      prompts/
        scout.md
        analyst.md
        skeptic.md
        referee.md
      schemas/
        scout.zod.ts
        analyst.zod.ts
        skeptic.zod.ts
        packet.zod.ts
    pipeline/
      run.ts                  # Orchestrator
      scout.ts                # Query generation + Scout call
      analyst.ts              # Analyst call
      skeptic.ts              # Skeptic (red team) call
      referee.ts              # Referee + final assembly
      scoring.ts              # Evidence strength + rubric computation
      dedupe.ts               # Deduplication + credibility
      report.ts               # Markdown generation
  reports/                    # Generated output (gitignored)
  .data/                      # SQLite DB (gitignored)
  .env.example
  .gitignore
  package.json
  tsconfig.json
  README.md
```

---

## CLI Commands

### 1) Run vetting

```
vet run --idea "..." [--niche "..."] [--customer "..."] [--constraints "..."] [--depth 1|2] [--save false] [--verbose]
```

Defaults:
* `depth=2` — depth=1 means one pass (Scout→Analyst→Skeptic→Referee), depth=2 means one additional refinement loop if Skeptic finds gaps
* `save=true` — when false, output goes to stdout only (no files, no SQLite)
* `verbose=false` — when true, stream intermediate step output

Output (when save=true):
* `reports/<runId>.json` — full DecisionPacket
* `reports/<runId>.md` — human-readable report
* `reports/<runId>.log.json` — debug log (queries, iterations, overrides, token usage)

### 2) View history

```
vet history [--limit 20]
```

Shows runId, createdAt, idea, decision, totalScore.

### 3) Show a run

```
vet show <runId>
```

Prints the markdown report to stdout.

### Acceptance criteria

* `vet run` works with only `--idea`
* Produces JSON + MD every time (when save=true)
* History persists across runs
* Progress spinner shows current step during execution

---

## Environment Variables

`.env.example`:

```
OPENAI_API_KEY=
OPENAI_MODEL=gpt-4o
OUTPUT_DIR=reports
DB_PATH=.data/vet.db
```

---

## Build Configuration

### tsconfig.json
* target: ES2022
* module: NodeNext
* moduleResolution: NodeNext
* outDir: dist
* strict: true

### package.json
* `bin` field: `{ "vet": "./dist/cli.js" }`
* scripts:
  * `dev`: `tsx src/cli.ts`
  * `build`: `tsc`
  * `test`: `vitest run`

### .gitignore
* `node_modules/`
* `.data/`
* `reports/`
* `.env`
* `dist/`

---

## SQLite Schema

Create `.data/` folder automatically on first run. Run migrations on startup with a simple version check.

`src/db/schema.sql`:

```sql
CREATE TABLE IF NOT EXISTS runs (
  runId TEXT PRIMARY KEY,
  createdAt TEXT NOT NULL,
  idea TEXT NOT NULL,
  niche TEXT,
  decision TEXT NOT NULL,
  totalScore INTEGER NOT NULL,
  jsonPath TEXT,
  mdPath TEXT,
  tokenUsage INTEGER,
  estimatedCost REAL
);

CREATE TABLE IF NOT EXISTS evidence (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  runId TEXT NOT NULL REFERENCES runs(runId),
  url TEXT,
  quote TEXT,
  theme TEXT,
  sourceType TEXT,
  sentiment TEXT,
  credibility INTEGER
);

CREATE TABLE IF NOT EXISTS competitors (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  runId TEXT NOT NULL REFERENCES runs(runId),
  name TEXT NOT NULL,
  url TEXT,
  positioning TEXT,
  pricingSignals TEXT
);
```

Migration strategy: version table with integer version. For v1, just create tables. Future schema changes add migration functions keyed by version number.

---

## Core Output: DecisionPacket Schema (Zod)

`packet.zod.ts` defines the full DecisionPacket:

Fields:
* `runId`, `createdAt`
* `input`: { idea, niche?, customer?, constraints? }
* `evidence[]`: { url, title?, sourceType, quote, theme, sentiment, credibility(1–5) }
* `competitors[]`: { name, url?, positioning, pricingSignals?, complaints[], gaps[] }
* `analysis`: { painThemes[], whoPays?, whyNow?, wedgeOptions[{ wedge, whyWorks, mvp }], premortem[], nextTests[] }
* `rubric`: { painIntensity, frequency, buyerClarity, budgetSignal, switchingCost, competition, distributionFeasibility, evidenceStrength — each 0–5 } + total + decision + reasons[]
* `meta`: { queries[], model, iterations, tokenUsage, estimatedCost }

### Validation rules (Zod + code):

**Hard requirements:**
* `decision` must be one of: GO, NO_GO, UNCLEAR
* All rubric scores 0–5
* `total` computed in code (not trusted from LLM)

**Soft thresholds with graceful degradation:**
* If `evidence.length < 10` after all iterations: set `evidenceGap: true` flag, reduce `evidenceStrength` by 1, add warning to reasons[]
* If `competitors.length < 5` after all iterations: proceed with what we have, add warning
* If `uniqueDomains < 3`: reduce `evidenceStrength` by 1, add warning
* These warnings do NOT block packet generation — they degrade the score instead

---

## Rubric + Kill Rules (ENFORCED IN CODE)

Scores (0–5):
* painIntensity
* frequency
* buyerClarity
* budgetSignal
* switchingCost (inverted: low switching cost for users = high score)
* competition (inverted: low competition = high score)
* distributionFeasibility
* evidenceStrength (computed by code, not LLM — see scoring section)

### Kill rules (always override LLM decision):

1. If `evidenceStrength <= 1` → decision = NO_GO
2. If `distributionFeasibility <= 1` → decision = NO_GO
3. If `competition <= 1 AND wedgeOptions.length === 0` → decision = NO_GO
4. If `buyerClarity <= 1 AND evidence.length < 10` → decision = UNCLEAR

When overriding: set `decision`, prepend "Overridden by kill rule: ..." to reasons[].

### Score computation:
* `total = sum of all 8 scores` (computed in code, max 40)
* If LLM returns a different total, **replace it**

---

## Pipeline Overview

`pipeline/run.ts` orchestrator. Max iterations = `depth` parameter (default 2).

```
Iteration 1:
  Step A: Scout (generate queries → call OpenAI w/ web_search → ScoutResult)
  Step B: Dedupe + Evidence Quality Filter (code-only)
  Step C: Analyst (evidence + competitors → AnalystResult)
  Step D: Skeptic (red team → SkepticResult)
  Step E: Referee (assemble → DecisionPacketDraft)

If depth >= 2 AND Skeptic provided missingEvidenceQueries:
  Iteration 2:
    Step A: Scout (Skeptic's queries only)
    Step B: Dedupe (merge with existing evidence)
    Step C: Analyst (full evidence set)
    Step E: Referee (final assembly — skip Skeptic on last pass)
```

### Step A — Scout

* Input: idea, niche, customer, constraints + query bundle
* Calls OpenAI Responses API with `web_search` tool enabled
* Two-phase approach:
  1. Call with web_search enabled, allow natural language response with search results
  2. Call again with search context to produce structured `ScoutResult` JSON
* Validates output via Zod (ScoutResultSchema)
* On Zod validation failure: retry up to 2 times with error feedback in prompt

### Step B — Dedupe + Evidence Quality Filter (Code only)

* Deduplicate by: exact URL match, then exact quote match (after lowercase + whitespace normalization)
* Compute domain diversity (unique hostnames from URLs)
* Apply credibility scoring using domain lookup table
* If evidence < 10 after dedupe AND within iteration budget: flag for Scout requery

### Step C — Analyst

* Input: validated evidence[], competitors[], original input
* Calls OpenAI to produce AnalystResult
* Validates via Zod

### Step D — Skeptic (Red Team)

* Input: evidence[], competitors[], AnalystResult, original input
* Tries to kill the opportunity
* Outputs SkepticResult with counterarguments and missingEvidenceQueries[]
* Only runs on non-final iterations (skip on last pass)

### Step E — Referee

* Input: all prior results
* LLM merges into DecisionPacketDraft
* Code then:
  1. Recomputes evidenceStrength from actual evidence metrics
  2. Recomputes total from individual scores
  3. Applies kill rules (override decision if needed)
  4. Applies soft threshold warnings
  5. Validates final packet against Zod schema

---

## OpenAI Integration

`src/openai/client.ts`:

### Wrapper functions:
* `callOpenAI(prompt, options)` — base function with:
  * Retry logic: 3 attempts with exponential backoff (1s, 3s, 9s)
  * Handles 429 rate limits, 500 server errors, timeout (60s)
  * Strips markdown code fences from response before JSON.parse
  * Logs token usage from response
* `runScout(input, queries): ScoutResult`
* `runAnalyst(input, scout): AnalystResult`
* `runSkeptic(input, scout, analyst): SkepticResult`
* `runReferee(input, scout, analyst, skeptic, metrics): DecisionPacketDraft`

### Two-phase Scout approach:
Phase 1: Call with `tools: [{ type: "web_search" }]` — model searches and returns natural text with citations
Phase 2: Call without tools, passing Phase 1 output as context — model structures into ScoutResult JSON

This avoids the unreliable interaction between tool use and structured JSON output.

### Response validation:
* Parse JSON from response (handle markdown fences, leading text)
* Validate with Zod
* On failure: retry with validation error appended to prompt (max 2 retries)

### Token tracking:
* Accumulate `usage.input_tokens` + `usage.output_tokens` from each response
* Store in meta.tokenUsage
* Estimate cost using model pricing (logged but not displayed prominently)

---

## Query Bundle Generator

`pipeline/scout.ts`:

### Base queries (always generated):
```
"${idea} complaints"
"${idea} frustrating OR annoying OR broken"
"${idea} alternatives comparison"
"${idea} reviews"
"${idea} pricing"
"site:reddit.com ${idea}"
"site:reddit.com ${idea} complaints OR wish OR hate"
"${idea} G2 OR Capterra reviews"
```

### Niche-specific queries (when niche provided):
```
"${niche} ${idea} workflow"
"${niche} ${idea} software tools"
"${niche} ${idea} spreadsheet OR manual process"
"${niche} ${idea} problems"
```

### Customer-specific queries (when customer provided):
```
"${customer} ${idea} pain points"
"${customer} tools for ${idea}"
```

Target: 8–12 queries per Scout run.

### Iteration 2 queries:
Use Skeptic's `missingEvidenceQueries[]` directly (already targeted).

---

## Evidence Credibility Scoring

`pipeline/dedupe.ts`:

### Domain credibility lookup table:

```typescript
const CREDIBILITY_TIERS: Record<string, number> = {
  // Tier 5 — High trust review/research
  "g2.com": 5,
  "capterra.com": 5,
  "trustpilot.com": 5,
  "gartner.com": 5,
  "forrester.com": 5,

  // Tier 4 — Community/forum
  "reddit.com": 4,
  "news.ycombinator.com": 4,
  "stackoverflow.com": 4,
  "producthunt.com": 4,
  "indiehackers.com": 4,

  // Tier 3 — News/blogs (decent)
  "techcrunch.com": 3,
  "theverge.com": 3,
  "arstechnica.com": 3,

  // Tier 2 — Generic/unknown
  // (default for unlisted domains)

  // Tier 1 — Low trust
  // SEO listicles detected by URL patterns like "/best-*-tools"
};

function getCredibility(url: string): number {
  // 1. Check exact domain match
  // 2. Check URL pattern for listicle signals ("/best-", "/top-10-")
  // 3. Default to 2
}
```

### Deduplication algorithm:
1. Group by normalized URL (lowercase, strip trailing slash, strip query params)
2. Within same URL: keep the quote with highest credibility or longest text
3. Across URLs: check for exact normalized quote matches, keep first seen

---

## Evidence Strength Computation

`pipeline/scoring.ts`:

```
evidenceStrength = min(5, floor(evidenceCount / 6))
if uniqueDomains >= 5: +1
if includes >= 2 sources from tier 4-5 domains: +1
if > 40% of evidence has credibility <= 1: -1
if evidenceCount < 10: -1 (soft threshold penalty)
clamp to 0..5
```

This score is **computed by code** and replaces whatever the LLM returns.

---

## Prompts

Stored as `src/openai/prompts/*.md`, loaded at runtime via `fs.readFileSync`.

### Common prompt rules (included in all):
* "Return valid JSON only. No markdown fences, no explanatory text."
* "Do not invent facts. Every claim must reference evidence from the search results."
* "If you cannot find sufficient information, say so explicitly."

### scout.md
Output: ScoutResult { queries[], evidence[], competitors[] }
* Scout constraints: quotes must be short excerpts from search snippets, every evidence item must include a URL

### analyst.md
Output: AnalystResult { painThemes[], whoPays?, whyNow?, wedgeOptions[], rubricDraft, premortem[], nextTests[] }
* Must produce >= 3 wedge options and >= 5 next validation tests

### skeptic.md
Output: SkepticResult { counterarguments[], alreadySolvedNotes[], missedCompetitors[], missingEvidenceQueries[], decisionSuggestion }
* Must try to kill the opportunity — reward finding flaws
* missingEvidenceQueries should be highly specific search queries

### referee.md
Output: DecisionPacket (draft — code will override scores/decision as needed)
* Merge all prior results into coherent packet
* Referee knows its scores may be overridden by code

---

## Report Generation (Markdown)

`pipeline/report.ts` generates `reports/<runId>.md`:

### Sections:
1. **Header** — idea, niche, date, decision (GO/NO_GO/UNCLEAR), total score
2. **Rubric Table** — 8 scores with short reason per score
3. **Kill Rule Overrides** — if any were triggered, list them prominently
4. **Key Evidence** — grouped by theme, each with bullet quote + URL (max 20 items)
5. **Competitors** — table with name, positioning, gaps, pricing signals
6. **Wedge Options** — 3 options with why-it-works + MVP description
7. **Premortem** — bullet list of what could go wrong
8. **Next Validation Tests** — numbered action items
9. **Warnings** — evidence gaps, low domain diversity, etc.

All URLs rendered as markdown links.

---

## Debug Log

`reports/<runId>.log.json`:

```json
{
  "runId": "...",
  "startedAt": "...",
  "completedAt": "...",
  "inputs": { "idea": "...", "niche": "...", ... },
  "iterations": [
    {
      "iteration": 1,
      "steps": [
        { "step": "scout", "queries": [...], "evidenceCount": 14, "tokensUsed": 2340 },
        { "step": "dedupe", "before": 14, "after": 11, "uniqueDomains": 6 },
        { "step": "analyst", "tokensUsed": 1800 },
        { "step": "skeptic", "missingQueries": [...], "tokensUsed": 1200 },
        { "step": "referee", "tokensUsed": 2100 }
      ]
    }
  ],
  "validationFailures": [],
  "killRuleOverrides": [],
  "totalTokens": 7440,
  "estimatedCost": 0.12
}
```

---

## Error Handling

### Retry wrapper (`src/utils/retry.ts`):
* 3 attempts with exponential backoff (1s, 3s, 9s)
* Retries on: 429 (rate limit), 500/502/503 (server error), timeout, network error
* Does NOT retry on: 400 (bad request), 401 (auth), 404

### Zod validation failure:
* On first failure: retry the LLM call with the validation error message appended
* On second failure: retry once more
* On third failure: throw with descriptive error, abort the run

### JSON parsing:
* Strip markdown code fences (```json ... ```)
* Strip leading/trailing non-JSON text
* If still invalid: treat as Zod validation failure (retry path)

### Graceful degradation:
* Evidence < 10 after all iterations → proceed with warning, penalize evidenceStrength
* Competitors < 5 after all iterations → proceed with warning
* Single step failure after retries → abort run with clear error message

---

## Progress Feedback

Using `ora` spinner:

```
⠋ Generating search queries...
⠋ Searching for evidence (Scout, iteration 1)...
⠋ Deduplicating evidence (14 → 11 items, 6 domains)...
⠋ Analyzing opportunity (Analyst)...
⠋ Red-teaming the opportunity (Skeptic)...
⠋ Assembling Decision Packet (Referee)...
⠋ Refining with additional evidence (iteration 2)...
✔ Decision: GO (Score: 28/40)
✔ Report saved: reports/abc123.md
```

With `--verbose`: print intermediate JSON summaries after each step.

---

## Test Plan

Using `vitest`.

### Unit tests:

1. **Zod schemas** — DecisionPacket validates with good data, rejects bad data
2. **Kill rules** — evidenceStrength=0 forces NO_GO, all 4 rules tested
3. **Score computation** — total always equals sum, evidenceStrength computed correctly
4. **Dedupe** — identical URLs collapse, normalized quotes dedupe
5. **Query generator** — base queries always present, niche queries only when niche provided
6. **Credibility scoring** — known domains return expected tier, unknown defaults to 2
7. **JSON parsing** — strips markdown fences, handles leading text
8. **Report generation** — known input produces expected markdown structure

### Integration test (optional, requires API key):
* Run full pipeline with a test idea, verify output validates against schema

---

## Build Order

1. **Scaffold** — repo, package.json (with bin field), tsconfig.json, .gitignore, .env.example
2. **CLI skeleton** — commander setup for `run`, `history`, `show` commands (stubs)
3. **Config** — env loading, defaults, validation
4. **Utils** — retry wrapper, JSON parser, spinner helpers
5. **Zod schemas** — all 4 schemas (scout, analyst, skeptic, packet)
6. **SQLite** — schema, migration, insert/select functions
7. **OpenAI client** — base wrapper with retry, token tracking
8. **Prompts** — all 4 markdown prompt files
9. **Scout** — query generator + OpenAI Scout call (two-phase)
10. **Dedupe + Scoring** — deduplication, credibility lookup, evidenceStrength computation
11. **Analyst** — OpenAI Analyst call
12. **Skeptic** — OpenAI Skeptic call
13. **Referee** — final assembly + kill rule enforcement
14. **Pipeline orchestrator** — wire steps together with iteration logic
15. **Report generator** — markdown output
16. **Wire CLI** — connect commands to pipeline + DB
17. **Tests** — unit tests for all code-only logic
18. **Polish** — error messages, edge cases, README

---

## Definition of Done

* `vet run --idea "X"` produces valid JSON + MD + stores in SQLite
* JSON validates against Zod DecisionPacket schema
* Evidence has URLs + quotes, competitors list exists
* Kill rules always enforced in code (verified by tests)
* `evidenceStrength` and `total` always computed by code
* Graceful degradation when evidence thresholds not met (warnings, not crashes)
* `vet history` and `vet show <runId>` work
* Progress spinner shows current step
* All unit tests pass
* Debug log captured for every run
