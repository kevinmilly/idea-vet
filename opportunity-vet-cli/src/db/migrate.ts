import Database from "better-sqlite3";

const CURRENT_VERSION = 1;

const SCHEMA_V1 = `
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
`;

export function migrate(db: Database.Database): void {
  const currentVersion = getVersion(db);

  if (currentVersion >= CURRENT_VERSION) {
    return;
  }

  if (currentVersion < 1) {
    db.exec(SCHEMA_V1);
    setVersion(db, 1);
  }
}

function getVersion(db: Database.Database): number {
  try {
    const row = db.prepare("SELECT version FROM schema_version LIMIT 1").get() as
      | { version: number }
      | undefined;
    return row?.version ?? 0;
  } catch {
    return 0;
  }
}

function setVersion(db: Database.Database, version: number): void {
  db.exec("DELETE FROM schema_version");
  db.prepare("INSERT INTO schema_version (version) VALUES (?)").run(version);
}
