// SPDX-License-Identifier: AGPL-3.0-or-later
// Diagnose WHY the panel misses on the Leg-2 pitch wedge: classify each pitch's
// question type, and for the worst two misses dump the verdict split + sample
// persona reasoning so we can see the failure mechanism before tuning.
//
//   DATABASE_URL=... PRINCIPE_ENCRYPTION_KEY=... pnpm -C apps/principe exec tsx scripts/leg2-diagnose.ts
import { prisma } from "@/lib/db/prisma";
import { materialiseProjectAgents } from "@/lib/projects/materialise";
import { SIZE_BANDS, type PanelComposition } from "@/lib/projects/composition";
import { getAnthropicClientForFirm } from "@/lib/anthropic/client";
import { runPanelAsk } from "@/lib/ciso-panel/ask";
import { classifyQuestion } from "@/lib/ciso-panel/question-router";

const N = 16;
const PITCHES = [
  "A vendor offers managed detection & response (MDR) that cuts your mean-time-to-respond by 40%, but takes ~6 weeks to integrate. Would you replace your current MDR/SOC arrangement with it?",
  "A vendor offers an autonomous AI SOC analyst that triages and auto-closes ~80% of tier-1 alerts with no human in the loop. Would you let it auto-close alerts in production?",
  "Would you pay ~$40k/year for a tool that continuously tests your detections against the latest CISA KEV exploits and shows you exactly which ones would have missed?",
  "A vendor offers a natural-language security data lake to replace your SIEM entirely — no rules, no SIEM license. Would you move off your current SIEM for it?",
  "A tool auto-generates your SOC 2 and ISO 27001 evidence continuously from your live cloud configuration. Would you rely on it for an actual audit?",
  "A tool monitors every employee prompt to public LLMs and blocks sensitive-data leaks in real time. Would you deploy it org-wide?",
  "Would you move your workforce to passwordless / passkey authentication org-wide within the next 12 months?",
  "Would you buy a core security control from a pre-Series-A startup (≤20 employees) if it clearly outperformed the incumbents in a head-to-head proof of concept?",
];
const REAL = [20, 50, 60, 20, 70, 60, 90, 60];
const DUMP = [4, 6]; // 0-indexed: Q5 (audit evidence) + Q7 (passwordless) — the two worst

const MIX: PanelComposition = {
  regionWeights: { mea: 70, us: 20, apac: 10 },
  industries: [],
  stanceWeights: { cautious: 0.25, balanced: 0.25, aggressive: 0.25, contrarian: 0.25 },
  sizeMin: SIZE_BANDS[0],
  sizeMax: SIZE_BANDS[4],
  presetKey: null,
};

async function main() {
  const firm = await prisma.firm.findFirst({ where: { anthropicKeyLast4: { not: null } }, select: { id: true } });
  if (!firm) throw new Error("no firm");
  const project = await prisma.project.create({ data: { firmId: firm.id, name: "[diag] leg2", composition: MIX as unknown as object }, select: { id: true } });
  await materialiseProjectAgents(project.id, MIX, N);
  const client = await getAnthropicClientForFirm(firm.id);

  console.log("=== routing (how each pitch is typed) ===");
  for (let i = 0; i < PITCHES.length; i++) {
    const t = await classifyQuestion(PITCHES[i], client);
    console.log(`Q${i + 1} [${t}] real ${REAL[i]}%`);
  }

  for (const i of DUMP) {
    console.log(`\n=== Q${i + 1} (real ${REAL[i]}%) — verdict split + sample reasoning ===`);
    const panel = await runPanelAsk(PITCHES[i], client, firm.id, project.id);
    const a = panel.aggregates;
    console.log(`pro ${a.proCount} / con ${a.conCount} / neutral ${a.neutralCount} (N=${panel.responses.length}) · routed=${panel.questionType}`);
    const sample = panel.responses.slice(0, 6);
    for (const r of sample) {
      console.log(`  [${r.verdict}] ${(r.reasoning ?? "").slice(0, 150)}`);
    }
  }

  await prisma.projectAgent.deleteMany({ where: { projectId: project.id } });
  await prisma.project.delete({ where: { id: project.id } });
}
main().then(() => process.exit(0)).catch((e) => { console.error("DIAG FAILED:", e); process.exit(1); });
