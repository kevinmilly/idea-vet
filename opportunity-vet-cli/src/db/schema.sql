CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);

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
