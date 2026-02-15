import fs from "fs-extra";
import path from "node:path";
import { generateReport } from "../pipeline/report.js";

export async function convertJsonAndMdToTxt(inputDir: string): Promise<void> {
  if (!fs.existsSync(inputDir)) {
    console.error(`Directory not found: ${inputDir}`);
    return;
  }

  const files = fs.readdirSync(inputDir);
  let convertedCount = 0;

  // Convert .json files
  const jsonFiles = files.filter((f) => f.endsWith(".json") && !f.endsWith(".log.json"));
  for (const jsonFile of jsonFiles) {
    const jsonPath = path.join(inputDir, jsonFile);
    const baseName = jsonFile.replace(".json", "");
    const txtPath = path.join(inputDir, `${baseName}.txt`);

    try {
      const data = fs.readJsonSync(jsonPath);
      const report = generateReport(data);
      fs.writeFileSync(txtPath, report, "utf-8");
      console.log(`✓ Converted: ${jsonFile} → ${baseName}.txt`);
      convertedCount++;
    } catch (err) {
      console.error(`✗ Failed to convert ${jsonFile}:`, err instanceof Error ? err.message : err);
    }
  }

  // Convert .md files (rename to .txt)
  const mdFiles = files.filter((f) => f.endsWith(".md"));
  for (const mdFile of mdFiles) {
    const mdPath = path.join(inputDir, mdFile);
    const baseName = mdFile.replace(".md", "");
    const txtPath = path.join(inputDir, `${baseName}.txt`);

    try {
      fs.copyFileSync(mdPath, txtPath);
      console.log(`✓ Converted: ${mdFile} → ${baseName}.txt`);
      convertedCount++;
    } catch (err) {
      console.error(`✗ Failed to convert ${mdFile}:`, err instanceof Error ? err.message : err);
    }
  }

  console.log(`\nTotal files converted: ${convertedCount}`);
}
