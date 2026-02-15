import Database from "better-sqlite3";
import fs from "fs-extra";
import path from "node:path";
import { loadConfig } from "../config.js";
import { migrate } from "./migrate.js";
import type { DecisionPacket } from "../openai/schemas/packet.zod.js";

let _db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (_db) return _db;

  const config = loadConfig();
  const dbDir = path.dirname(config.dbPath);
  fs.ensureDirSync(dbDir);

  _db = new Database(config.dbPath);
  _db.pragma("journal_mode = WAL");
  migrate(_db);
  return _db;
}

export function insertRun(packet: DecisionPacket, jsonPath: string, mdPath: string, groupId?: string): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO runs (runId, createdAt, idea, niche, decision, totalScore, jsonPath, mdPath, tokenUsage, estimatedCost, groupId)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    packet.runId,
    packet.createdAt,
    packet.input.idea,
    packet.input.niche ?? null,
    packet.rubric.decision,
    packet.rubric.total,
    jsonPath,
    mdPath,
    packet.meta.tokenUsage,
    packet.meta.estimatedCost,
    groupId ?? null
  );

  const insertEvidence = db.prepare(`
    INSERT INTO evidence (runId, url, quote, theme, sourceType, sentiment, credibility)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const e of packet.evidence) {
    insertEvidence.run(packet.runId, e.url, e.quote, e.theme, e.sourceType, e.sentiment, e.credibility);
  }

  const insertCompetitor = db.prepare(`
    INSERT INTO competitors (runId, name, url, positioning, pricingSignals)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const c of packet.competitors) {
    insertCompetitor.run(packet.runId, c.name, c.url ?? null, c.positioning, c.pricingSignals ?? null);
  }
}

export interface RunSummary {
  runId: string;
  createdAt: string;
  idea: string;
  decision: string;
  totalScore: number;
  groupId?: string;
}

export function showHistory(limit: number): RunSummary[] {
  const db = getDb();
  return db
    .prepare("SELECT runId, createdAt, idea, decision, totalScore, groupId FROM runs ORDER BY createdAt DESC LIMIT ?")
    .all(limit) as RunSummary[];
}

export interface RunRecord {
  runId: string;
  jsonPath: string | null;
  mdPath: string | null;
}

export function showRun(runId: string): RunRecord | undefined {
  const db = getDb();
  // Support prefix match for convenience
  const row = db
    .prepare("SELECT runId, jsonPath, mdPath FROM runs WHERE runId = ? OR runId LIKE ?")
    .get(runId, `${runId}%`) as RunRecord | undefined;
  return row;
}

export function showGroup(groupId: string): RunSummary[] {
  const db = getDb();
  return db
    .prepare("SELECT runId, createdAt, idea, decision, totalScore, groupId FROM runs WHERE groupId = ? ORDER BY createdAt ASC")
    .all(groupId) as RunSummary[];
}
