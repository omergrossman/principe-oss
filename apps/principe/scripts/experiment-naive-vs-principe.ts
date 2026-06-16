// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Experiment: Principe vs Naive N-Shot Aggregation
//
// Runs three conditions on the same 10 benchmark CISO questions and compares
// each against real-world survey data (Proofpoint, Foundry, Cisco, Glilot).
//
// Conditions:
//   A. True Naive     — identical prompt × N, no personas, no features
//   B. Personas Only  — 100 distinct personas, base system prompt only
//   C. Full Principe  — complete pipeline: router, skill, depth, history,
//                       briefing, and affine calibration correction
//
// No existing files are modified. Output is a self-contained HTML report
// and a raw JSON results file in calibration/reports/.
//
// Usage:
//   DATABASE_URL=... PRINCIPE_ENCRYPTION_KEY=... \
//   pnpm -C apps/principe exec tsx scripts/experiment-naive-vs-principe.ts [--dry-run]
//
// --dry-run  Uses N=3 calls per condition per question (~$0.02) for wiring checks.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { prisma } from "@/lib/db/prisma";
import { materialiseProjectAgents, generateAgentsForProject } from "@/lib/projects/materialise";
import { getAnthropicClientForFirm } from "@/lib/anthropic/client";
import { runPanelAsk } from "@/lib/ciso-panel/ask";
import { calibrate } from "@/lib/ciso-panel/calibration-map";
import type { QuestionType } from "@/lib/ciso-panel/question-router";
import { runNaivePanel } from "./lib/run-naive-panel";
import { runPersonasOnlyPanel } from "./lib/run-personas-only-panel";
import { generateHtmlReport } from "./lib/generate-experiment-report";
import { MODEL, toProPct } from "./lib/concurrent-runner";
import type {
  BenchmarkQuestion,
  QuestionResult,
  ConditionResult,
  ConditionMetrics,
  ExperimentRun,
} from "./lib/experiment-types";

// ─── Benchmark questions ────────────────────────────────────────────────────────
// Taken from calibration-references.ts (same source, same real% figures).
// Covers all five question types that the router handles.

const REFS: BenchmarkQuestion[] = [
  // Proofpoint Voice of the CISO 2025 (~1,600 CISOs, global)
  { q: "Is enabling employee use of generative-AI tools a strategic priority for you over the next two years?", type: "PRIORITY", real: 64, src: "proofpoint" },
  { q: "Do you feel your organization is at risk of experiencing a material cyberattack in the next 12 months?", type: "FORECAST", real: 76, src: "proofpoint" },
  { q: "Would you consider paying a ransom to prevent a data leak or to restore systems?", type: "STRATEGY", real: 66, src: "proofpoint" },
  { q: "Do you regard generative AI as a security risk to your organization?", type: "FACTUAL", real: 60, src: "proofpoint" },
  // Foundry / IDG Security Priorities 2026 (global)
  { q: "Is strengthening data protection your single top security priority this year?", type: "PRIORITY", real: 48, src: "foundry" },
  { q: "Are you more likely than before to consider AI-enabled security solutions?", type: "PRIORITY", real: 73, src: "foundry" },
  { q: "Is it getting harder for you to choose the right security tools for your organization?", type: "FACTUAL", real: 76, src: "foundry" },
  // Cisco Cybersecurity Readiness Index 2025 (global)
  { q: "Are you very confident in the resilience of your organization's current cybersecurity infrastructure against attacks?", type: "FACTUAL", real: 34, src: "cisco" },
  { q: "Does your organization use AI to better understand security threats?", type: "FACTUAL", real: 89, src: "cisco" },
  { q: "Does your organization have the internal resources and expertise to conduct comprehensive AI security assessments?", type: "FACTUAL", real: 45, src: "cisco" },
];

// ─── Helpers ───────────────────────────────────────────────────────────────────

function computeMetrics(questions: QuestionResult[]): ConditionMetrics {
  const valid = questions.filter((q) => !q.error);
  const errors = valid.map((q) => Math.abs(q.panelPct - q.realPct));
  const mae = errors.length
    ? Math.round(errors.reduce((a, b) => a + b, 0) / errors.length)
    : 0;
  const diversityMean = valid.length
    ? Number((valid.reduce((a, q) => a + q.sentimentStdDev, 0) / valid.length).toFixed(2))
    : 0;
  const collapseRate = valid.length
    ? valid.filter((q) => q.collapseFlag).length / valid.length
    : 0;
  const spreads = valid.map((q) => {
    const pcts = Object.values(q.byRegion).map((r) => r.proPct);
    return pcts.length >= 2 ? Math.max(...pcts) - Math.min(...pcts) : 0;
  });
  const segmentSpread = spreads.length
    ? Math.round(spreads.reduce((a, b) => a + b, 0) / spreads.length)
    : 0;
  return {
    mae,
    diversityMean,
    collapseRate,
    segmentSpread,
    totalInputTokens: questions.reduce((a, q) => a + q.totalInputTokens, 0),
    totalOutputTokens: questions.reduce((a, q) => a + q.totalOutputTokens, 0),
  };
}

function buildCondition(label: string, description: string, questions: QuestionResult[]): ConditionResult {
  return { label, description, questions, metrics: computeMetrics(questions) };
}

// ─── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const isDryRun = process.argv.includes("--dry-run");
  const N = isDryRun ? 3 : 100;
  // Anchor to the script file's location so the output path is correct regardless
  // of the working directory from which the script is invoked.
  const outDir = path.resolve(fileURLToPath(new URL("../../../calibration/reports", import.meta.url)));
  fs.mkdirSync(outDir, { recursive: true });

  console.log(`\n${"=".repeat(60)}`);
  console.log(`  Principe vs Naive Experiment ${isDryRun ? `[DRY RUN N=${N}]` : `[LIVE N=${N}]`}`);
  console.log(`${"=".repeat(60)}\n`);
  console.log(`Questions: ${REFS.length}  ·  Conditions: 3  ·  Total API calls: ~${REFS.length * 3 * N}`);

  // 1. DB setup — find firm + create throwaway project for Condition C
  const firm = await prisma.firm.findFirst({
    where: { anthropicKeyLast4: { not: null } },
    select: { id: true },
  });
  if (!firm) throw new Error("No firm with an Anthropic key found in the database.");

  // Preflight: warn if the firm has enabled CISO-talk insights. runPanelAsk()
  // calls loadEnabledInsightsForFirm(firmId) — firm-scoped, not project-scoped —
  // so these insights are injected into every Condition C prompt but not into A or B,
  // which would confound the comparison. Use a firm with no enabled insights for
  // a clean run.
  const insightCount = await prisma.transcriptInsight.count({
    where: { enabled: true, transcript: { firmId: firm.id, distillationStatus: "COMPLETE" } },
  });
  if (insightCount > 0) {
    console.warn(`\n⚠  WARNING: This firm has ${insightCount} enabled CISO-talk insight(s).`);
    console.warn(`   These will be injected into every Condition C prompt but not into A or B.`);
    console.warn(`   This confounds the comparison. Use a firm with no enabled insights for a`);
    console.warn(`   clean experiment.\n`);
  }

  const project = await prisma.project.create({
    data: { firmId: firm.id, name: `[experiment] naive-vs-principe ${new Date().toISOString().slice(0, 10)}` },
    select: { id: true },
  });

  console.log(`\n[setup] Created throwaway project ${project.id}`);

  try {
    await materialiseProjectAgents(project.id, null, N);
    console.log(`[setup] Materialised ${N} agents`);

    const client = await getAnthropicClientForFirm(firm.id);
    console.log("[setup] Anthropic client ready\n");

    // 2. Run all three conditions per question
    const naiveQs: QuestionResult[] = [];
    const personasQs: QuestionResult[] = [];
    const principeQs: QuestionResult[] = [];

    for (let i = 0; i < REFS.length; i++) {
      const ref = REFS[i];
      const qNum = `[${i + 1}/${REFS.length}]`;
      console.log(`${qNum} (${ref.type}) ${ref.src}: ${ref.q.slice(0, 65)}…`);

      // ─ A: True Naive ─────────────────────────────────────────────
      process.stdout.write(`  A naive      `);
      try {
        const r = await runNaivePanel(ref.q, client, N);
        r.realPct = ref.real;
        r.source = ref.src;
        r.questionType = ref.type;
        naiveQs.push(r);
        process.stdout.write(`${r.panelPct}% pro · σ=${r.sentimentStdDev} · ${(r.durationMs / 1000).toFixed(1)}s\n`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`FAILED: ${msg}`);
        naiveQs.push({
          question: ref.q, questionType: ref.type, realPct: ref.real, source: ref.src,
          panelPct: 0, rawPanelPct: 0, sentimentMean: 5, sentimentStdDev: 0,
          sentimentHistogram: new Array(10).fill(0) as number[],
          byRegion: {}, byIndustry: {}, collapseFlag: false,
          totalInputTokens: 0, totalOutputTokens: 0, durationMs: 0, error: msg,
        });
      }

      // ─ B: Personas Only ──────────────────────────────────────────
      process.stdout.write(`  B personas   `);
      try {
        const r = await runPersonasOnlyPanel(ref.q, client, N);
        r.realPct = ref.real;
        r.source = ref.src;
        r.questionType = ref.type;
        personasQs.push(r);
        process.stdout.write(`${r.panelPct}% pro · σ=${r.sentimentStdDev} · ${(r.durationMs / 1000).toFixed(1)}s\n`);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`FAILED: ${msg}`);
        personasQs.push({
          question: ref.q, questionType: ref.type, realPct: ref.real, source: ref.src,
          panelPct: 0, rawPanelPct: 0, sentimentMean: 5, sentimentStdDev: 0,
          sentimentHistogram: new Array(10).fill(0) as number[],
          byRegion: {}, byIndustry: {}, collapseFlag: false,
          totalInputTokens: 0, totalOutputTokens: 0, durationMs: 0, error: msg,
        });
      }

      // ─ C: Full Principe ──────────────────────────────────────────
      process.stdout.write(`  C principe   `);
      try {
        const panel = await runPanelAsk(ref.q, client, firm.id, project.id);
        const validCount = panel.responses.filter((r) => !r.apiError).length;
        const rawPct = validCount > 0
          ? Math.round((panel.aggregates.proCount / validCount) * 100)
          : 0;
        const detectedType: QuestionType = panel.questionType ?? (ref.type as QuestionType);
        const cal = calibrate(detectedType, rawPct);

        const histogram = new Array(10).fill(0) as number[];
        for (const r of panel.responses) {
          if (!r.apiError) histogram[Math.min(9, Math.max(0, r.sentiment - 1))]++;
        }
        const maxVerdict = Math.max(
          panel.aggregates.proCount,
          panel.aggregates.conCount,
          panel.aggregates.neutralCount,
        );

        const result: QuestionResult = {
          question: ref.q,
          questionType: String(detectedType),
          realPct: ref.real,
          source: ref.src,
          panelPct: cal.calibratedPct,
          rawPanelPct: rawPct,
          sentimentMean: panel.aggregates.sentimentMean,
          sentimentStdDev: panel.aggregates.sentimentStdDev,
          sentimentHistogram: histogram,
          byRegion: toProPct(panel.aggregates.byRegion),
          byIndustry: toProPct(panel.aggregates.byIndustry),
          collapseFlag: validCount > 0 && maxVerdict / validCount >= 0.85,
          totalInputTokens: panel.totalInputTokens,
          totalOutputTokens: panel.totalOutputTokens,
          durationMs: panel.durationMs,
        };
        principeQs.push(result);
        process.stdout.write(
          `${cal.calibratedPct}% pro (raw ${rawPct}%) · σ=${panel.aggregates.sentimentStdDev} · ${(panel.durationMs / 1000).toFixed(1)}s · type=${detectedType}\n`,
        );
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        console.log(`FAILED: ${msg}`);
        principeQs.push({
          question: ref.q, questionType: ref.type, realPct: ref.real, source: ref.src,
          panelPct: 0, rawPanelPct: 0, sentimentMean: 5, sentimentStdDev: 0,
          sentimentHistogram: new Array(10).fill(0) as number[],
          byRegion: {}, byIndustry: {}, collapseFlag: false,
          totalInputTokens: 0, totalOutputTokens: 0, durationMs: 0, error: msg,
        });
      }

      console.log();
    }

    // 3. Build condition results + compute metrics
    const naive = buildCondition("A: True Naive", `Identical prompt × ${N}`, naiveQs);
    const personasOnly = buildCondition("B: Personas Only", "100 distinct personas, no enrichment", personasQs);
    const principe = buildCondition("C: Full Principe", "Complete pipeline with calibration", principeQs);

    // 4. Persona stances for the diversity grid visualisation (pure, no DB).
    // Always generate the canonical 100 regardless of N so the grid looks meaningful
    // even on a dry run with N=3.
    const stancePersonas = generateAgentsForProject("experiment-grid-reference", null, 100);
    const personaStances = stancePersonas.map((p) => ({ stance: p.stance, region: p.region }));

    // 5. Build ExperimentRun
    const runDate = new Date().toISOString();
    const expId = `exp-${runDate.slice(0, 10)}${isDryRun ? "-dryrun" : ""}`;
    const run: ExperimentRun = {
      id: expId,
      runDate,
      model: MODEL,
      panelN: N,
      isDryRun,
      benchmarkCount: REFS.length,
      personaStances,
      conditions: { naive, personasOnly, principe },
    };

    // 6. Write JSON
    const jsonPath = path.join(outDir, `${expId}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(run, null, 2));
    console.log(`\nJSON → ${jsonPath}`);

    // 7. Generate + write HTML report
    const html = generateHtmlReport(run);
    const htmlPath = path.join(outDir, `${expId}.html`);
    fs.writeFileSync(htmlPath, html);
    console.log(`HTML → ${htmlPath}`);

    // 8. Print summary table
    console.log(`\n${"=".repeat(60)}`);
    console.log("  SUMMARY");
    console.log(`${"=".repeat(60)}`);
    console.log(`${"Condition".padEnd(26)} ${"MAE".padStart(6)} ${"Div σ".padStart(7)} ${"Collapse".padStart(9)} ${"Seg.Sprd".padStart(9)}`);
    console.log("-".repeat(60));
    for (const c of [naive, personasOnly, principe]) {
      const m = c.metrics;
      console.log(
        `${c.label.padEnd(26)} ${String(m.mae + "pp").padStart(6)} ${String(m.diversityMean.toFixed(2)).padStart(7)} ${String((m.collapseRate * 100).toFixed(0) + "%").padStart(9)} ${String(m.segmentSpread + "pp").padStart(9)}`,
      );
    }
    console.log();
    const gain = naive.metrics.mae - principe.metrics.mae;
    if (gain > 0) {
      console.log(`✓ Principe beats naive by ${gain}pp MAE — the null hypothesis is rejected.`);
    } else {
      console.log(`⚠ Unexpected: Principe did not outperform naive in this run (gain=${gain}pp).`);
    }
  } finally {
    // Clean up throwaway project — runs on both success and failure to prevent
    // orphaned projects accumulating in the database.
    await prisma.projectAgent.deleteMany({ where: { projectId: project.id } });
    await prisma.project.delete({ where: { id: project.id } });
    console.log(`[cleanup] Deleted project ${project.id}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("\nEXPERIMENT FAILED:", e);
    process.exit(1);
  });
