# Opportunity Vet CLI

AI-powered CLI tool that vets business ideas by researching evidence, analyzing competitors, scoring opportunities, and producing a Go/No-Go decision packet.

## Quickstart

### 1. Prerequisites

- **Node.js 20+** — [download here](https://nodejs.org)
- **OpenAI API key** with billing enabled — [get one here](https://platform.openai.com/api-keys)

### 2. Install

```bash
cd opportunity-vet-cli
npm install
```

### 3. Configure

```bash
cp .env.example .env
```

Edit `.env` and add your OpenAI API key:

```
OPENAI_API_KEY=sk-your-key-here
OPENAI_MODEL=gpt-4o
```

### 4. Run

```bash
# Using tsx (development)
npx tsx src/cli.ts run --idea "AI-powered invoice management for freelancers"

# With optional parameters
npx tsx src/cli.ts run \
  --idea "AI-powered invoice management" \
  --niche "freelancers" \
  --customer "solo freelancers" \
  --depth 2 \
  --verbose
```

### 5. Build & install globally (optional)

```bash
npm run build
npm link
vet run --idea "your idea here"
```

## Commands

### `vet run` — Vet an idea

```
vet run --idea "..." [options]
```

| Option | Default | Description |
|---|---|---|
| `--idea` | (required) | The idea or pain point to research |
| `--niche` | — | Target niche or industry |
| `--customer` | — | Target customer persona |
| `--constraints` | — | Additional context or constraints |
| `--depth` | 2 | Max research iterations (1 or 2) |
| `--save` | true | Save results to files and SQLite |
| `--verbose` | false | Show intermediate step output |

**Output:**
- `reports/<runId>.json` — Full structured decision packet
- `reports/<runId>.md` — Human-readable markdown report
- `reports/<runId>.log.json` — Debug log with token usage

### `vet history` — View past runs

```
vet history [--limit 20]
```

### `vet show` — View a specific run

```
vet show <runId>
```

## How it works

The tool runs a multi-agent pipeline:

1. **Scout** — Generates search queries and uses OpenAI's web search to find evidence of the pain point, competitors, and market signals
2. **Dedupe** — Deduplicates evidence by URL and quote, applies credibility scoring by domain
3. **Analyst** — Analyzes evidence to identify pain themes, buyer personas, wedge strategies, and draft rubric scores
4. **Skeptic** — Red-teams the opportunity, finds counterarguments, missed competitors, and evidence gaps
5. **Referee** — Synthesizes all perspectives into a final Decision Packet with rubric scores

If depth=2 and the Skeptic identifies evidence gaps, the pipeline runs a second iteration with targeted queries.

### Kill rules (enforced in code)

These override the AI's decision regardless of what it returns:

- `evidenceStrength <= 1` → **NO_GO**
- `distributionFeasibility <= 1` → **NO_GO**
- `competition <= 1` with no wedge options → **NO_GO**
- `buyerClarity <= 1` with fewer than 10 evidence items → **UNCLEAR**

### Rubric (0-5 each, max 40)

| Dimension | What it measures |
|---|---|
| Pain Intensity | How severe is the problem? |
| Frequency | How often do users encounter it? |
| Buyer Clarity | How clear is who would pay? |
| Budget Signal | Evidence of willingness to pay |
| Switching Cost | Ease of switching (high = easy) |
| Competition | Market openness (high = less competition) |
| Distribution Feasibility | How reachable are buyers? |
| Evidence Strength | Quality/quantity of evidence (code-computed) |

## Cost

Each run makes 4-8 OpenAI API calls with web search. Estimated cost per run: **$0.05–0.30** depending on depth and model.

## Testing

```bash
npm test
```

## Project structure

```
src/
  cli.ts              — CLI entry point (commander)
  config.ts           — Environment config
  utils/              — Retry, JSON parsing, spinners
  db/                 — SQLite schema and queries
  openai/
    client.ts         — OpenAI API wrapper
    prompts/          — Agent prompt templates (.md)
    schemas/          — Zod validation schemas
  pipeline/
    run.ts            — Pipeline orchestrator
    scout.ts          — Query generation
    dedupe.ts         — Deduplication + credibility
    scoring.ts        — Evidence strength + kill rules
    report.ts         — Markdown report generator
```
