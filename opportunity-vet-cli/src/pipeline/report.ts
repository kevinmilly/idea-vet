import type { DecisionPacket } from "../openai/schemas/packet.zod.js";
import type { Idea } from "../openai/schemas/ideator.zod.js";

export function generateReport(packet: DecisionPacket): string {
  const { input, rubric, evidence, competitors, analysis, warnings, meta } = packet;
  const lines: string[] = [];

  // Header
  lines.push(`# Opportunity Vet: ${input.idea}`);
  lines.push("");
  lines.push(`**Date:** ${packet.createdAt.slice(0, 10)}`);
  if (input.niche) lines.push(`**Niche:** ${input.niche}`);
  if (input.customer) lines.push(`**Customer:** ${input.customer}`);
  lines.push(`**Decision: ${rubric.decision}** | Score: ${rubric.total}/40`);
  lines.push(`**Model:** ${meta.model} | **Iterations:** ${meta.iterations} | **Tokens:** ${meta.tokenUsage.toLocaleString()}`);
  lines.push("");

  // Kill rule overrides
  const overrides = rubric.reasons.filter((r) => r.startsWith("Kill rule:"));
  if (overrides.length > 0) {
    lines.push("## Kill Rule Overrides");
    lines.push("");
    for (const o of overrides) {
      lines.push(`- ${o}`);
    }
    lines.push("");
  }

  // Warnings
  if (warnings.length > 0) {
    lines.push("## Warnings");
    lines.push("");
    for (const w of warnings) {
      lines.push(`- ${w}`);
    }
    lines.push("");
  }

  // Rubric table
  lines.push("## Rubric Scores");
  lines.push("");
  lines.push("| Dimension | Score |");
  lines.push("|---|---|");
  lines.push(`| Pain Intensity | ${rubric.painIntensity}/5 |`);
  lines.push(`| Frequency | ${rubric.frequency}/5 |`);
  lines.push(`| Buyer Clarity | ${rubric.buyerClarity}/5 |`);
  lines.push(`| Budget Signal | ${rubric.budgetSignal}/5 |`);
  lines.push(`| Switching Cost (ease) | ${rubric.switchingCost}/5 |`);
  lines.push(`| Competition (openness) | ${rubric.competition}/5 |`);
  lines.push(`| Distribution Feasibility | ${rubric.distributionFeasibility}/5 |`);
  lines.push(`| Evidence Strength | ${rubric.evidenceStrength}/5 |`);
  lines.push(`| **Total** | **${rubric.total}/40** |`);
  lines.push("");

  // Decision reasons
  const nonKillReasons = rubric.reasons.filter((r) => !r.startsWith("Kill rule:"));
  if (nonKillReasons.length > 0) {
    lines.push("### Decision Reasons");
    lines.push("");
    for (const r of nonKillReasons) {
      lines.push(`- ${r}`);
    }
    lines.push("");
  }

  // Key evidence
  lines.push("## Key Evidence");
  lines.push("");

  // Group by theme
  const byTheme = new Map<string, typeof evidence>();
  for (const e of evidence) {
    const theme = e.theme || "other";
    if (!byTheme.has(theme)) byTheme.set(theme, []);
    byTheme.get(theme)!.push(e);
  }

  for (const [theme, items] of byTheme) {
    lines.push(`### ${theme}`);
    lines.push("");
    const display = items.slice(0, 10); // Max 10 per theme
    for (const e of display) {
      lines.push(`- "${e.quote}" — [${e.sourceType}](${e.url}) (credibility: ${e.credibility}/5, ${e.sentiment})`);
    }
    lines.push("");
  }

  // Competitors
  lines.push("## Competitors");
  lines.push("");
  lines.push("| Name | Positioning | Pricing | Gaps |");
  lines.push("|---|---|---|---|");
  for (const c of competitors) {
    const gaps = c.gaps.length > 0 ? c.gaps.slice(0, 3).join("; ") : "—";
    const url = c.url ? `[${c.name}](${c.url})` : c.name;
    lines.push(`| ${url} | ${c.positioning} | ${c.pricingSignals ?? "—"} | ${gaps} |`);
  }
  lines.push("");

  // Wedge options
  lines.push("## Wedge Options");
  lines.push("");
  for (let i = 0; i < analysis.wedgeOptions.length; i++) {
    const w = analysis.wedgeOptions[i];
    lines.push(`### ${i + 1}. ${w.wedge}`);
    lines.push("");
    lines.push(`**Why it works:** ${w.whyWorks}`);
    lines.push("");
    lines.push(`**MVP:** ${w.mvp}`);
    lines.push("");
  }

  // Premortem
  lines.push("## Premortem");
  lines.push("");
  for (const p of analysis.premortem) {
    lines.push(`- ${p}`);
  }
  lines.push("");

  // Next tests
  lines.push("## Next Validation Tests");
  lines.push("");
  for (let i = 0; i < analysis.nextTests.length; i++) {
    lines.push(`${i + 1}. ${analysis.nextTests[i]}`);
  }
  lines.push("");

  return lines.join("\n");
}

export function generateBrainstormReport(
  painPoint: string,
  ideas: Idea[],
  packets: DecisionPacket[],
  reportPaths: string[]
): string {
  const lines: string[] = [];

  lines.push(`# Brainstorm Report: ${painPoint}`);
  lines.push("");
  lines.push(`**Date:** ${new Date().toISOString().slice(0, 10)}`);
  lines.push(`**Ideas vetted:** ${packets.length}`);
  lines.push("");

  // Rank by total score descending
  const ranked = packets
    .map((p, i) => ({ packet: p, idea: ideas[i], index: i }))
    .sort((a, b) => b.packet.rubric.total - a.packet.rubric.total);

  // Summary ranking table
  lines.push("## Ranking");
  lines.push("");
  lines.push("| Rank | Idea | Decision | Score | Top Wedge |");
  lines.push("|------|------|----------|-------|-----------|");
  for (let r = 0; r < ranked.length; r++) {
    const { packet, idea } = ranked[r];
    const topWedge = packet.analysis.wedgeOptions[0]?.wedge ?? "—";
    lines.push(`| ${r + 1} | ${idea.name} | ${packet.rubric.decision} | ${packet.rubric.total}/40 | ${topWedge} |`);
  }
  lines.push("");

  // Side-by-side rubric comparison
  lines.push("## Rubric Comparison");
  lines.push("");
  const header = ["Dimension", ...ranked.map((r) => r.idea.name)];
  lines.push(`| ${header.join(" | ")} |`);
  lines.push(`|${header.map(() => "---").join("|")}|`);

  const dims: { label: string; key: keyof DecisionPacket["rubric"] }[] = [
    { label: "Pain Intensity", key: "painIntensity" },
    { label: "Frequency", key: "frequency" },
    { label: "Buyer Clarity", key: "buyerClarity" },
    { label: "Budget Signal", key: "budgetSignal" },
    { label: "Switching Cost", key: "switchingCost" },
    { label: "Competition", key: "competition" },
    { label: "Distribution", key: "distributionFeasibility" },
    { label: "Evidence", key: "evidenceStrength" },
  ];

  for (const dim of dims) {
    const scores = ranked.map((r) => `${r.packet.rubric[dim.key]}/5`);
    lines.push(`| ${dim.label} | ${scores.join(" | ")} |`);
  }
  const totals = ranked.map((r) => `**${r.packet.rubric.total}/40**`);
  lines.push(`| **Total** | ${totals.join(" | ")} |`);
  lines.push("");

  // Idea details
  lines.push("## Idea Details");
  lines.push("");
  for (let r = 0; r < ranked.length; r++) {
    const { packet, idea, index } = ranked[r];
    lines.push(`### ${r + 1}. ${idea.name}`);
    lines.push("");
    lines.push(`> ${idea.description}`);
    lines.push("");
    lines.push(`- **Target Customer:** ${idea.targetCustomer}`);
    lines.push(`- **Revenue Model:** ${idea.revenueModel}`);
    lines.push(`- **Why ≤10 hrs/week:** ${idea.whyLowTime}`);
    lines.push(`- **Decision:** ${packet.rubric.decision} (${packet.rubric.total}/40)`);
    if (reportPaths[index]) {
      lines.push(`- **Full Report:** [${packet.runId}.md](${reportPaths[index]})`);
    }
    lines.push("");

    // Top wedge
    if (packet.analysis.wedgeOptions.length > 0) {
      const w = packet.analysis.wedgeOptions[0];
      lines.push(`**Top Wedge:** ${w.wedge}`);
      lines.push(`  ${w.whyWorks}`);
      lines.push("");
    }

    // Key risks
    if (packet.analysis.premortem.length > 0) {
      lines.push("**Key Risks:**");
      for (const risk of packet.analysis.premortem.slice(0, 3)) {
        lines.push(`- ${risk}`);
      }
      lines.push("");
    }
  }

  return lines.join("\n");
}
