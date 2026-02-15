import path from "node:path";

export interface Config {
  openaiApiKey: string;
  openaiModel: string;
  outputDir: string;
  dbPath: string;
}

export function loadConfig(): Config {
  const openaiApiKey = process.env.OPENAI_API_KEY;
  if (!openaiApiKey) {
    console.error("Error: OPENAI_API_KEY is not set. Copy .env.example to .env and add your key.");
    process.exit(1);
  }

  return {
    openaiApiKey,
    openaiModel: process.env.OPENAI_MODEL || "gpt-4o",
    outputDir: path.resolve(process.env.OUTPUT_DIR || "reports"),
    dbPath: path.resolve(process.env.DB_PATH || ".data/vet.db"),
  };
}
