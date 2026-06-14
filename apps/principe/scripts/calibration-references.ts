// SPDX-License-Identifier: AGPL-3.0-or-later
// Build paired (panel%, real%) points across question types from public global
// CISO surveys (Proofpoint Voice of the CISO, Foundry Security Priorities, Cisco
// Readiness Index, Glilot). Runs each through the ORIGINAL global panel and
// prints the points to paste into calibration-map.ts SEED_POINTS, growing the
// Tier-2 map so types can move from "directional" → "calibrated".
//
// Run from a branch with the router (so questions get classified), DB bridged:
//   DATABASE_URL=... PRINCIPE_ENCRYPTION_KEY=... pnpm -C apps/principe exec tsx scripts/calibration-references.ts
import { prisma } from "@/lib/db/prisma";
import { materialiseProjectAgents } from "@/lib/projects/materialise";
import { getAnthropicClientForFirm } from "@/lib/anthropic/client";
import { runPanelAsk } from "@/lib/ciso-panel/ask";

const N = 50;

type Ref = { q: string; type: string; real: number; src: string };
const REFS: Ref[] = [
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

async function main() {
  const firm = await prisma.firm.findFirst({
    where: { anthropicKeyLast4: { not: null } },
    select: { id: true },
  });
  if (!firm) throw new Error("no firm with an Anthropic key");
  const project = await prisma.project.create({
    data: { firmId: firm.id, name: "[calib-refs] global" },
    select: { id: true },
  });
  await materialiseProjectAgents(project.id, null, N); // null = global default
  const client = await getAnthropicClientForFirm(firm.id);

  const points: { type: string; raw: number; real: number; note: string }[] = [];
  for (let i = 0; i < REFS.length; i++) {
    const ref = REFS[i];
    process.stdout.write(`\n[${i + 1}/${REFS.length}] (${ref.type}) ${ref.src} … `);
    try {
      const panel = await runPanelAsk(ref.q, client, firm.id, project.id);
      const total = panel.responses.length;
      const raw = total > 0 ? Math.round((panel.aggregates.proCount / total) * 100) : 0;
      const routed = panel.questionType ?? "?";
      points.push({ type: ref.type, raw, real: ref.real, note: `${ref.src}: ${ref.q.slice(0, 50)}` });
      process.stdout.write(`panel ${raw}% · real ${ref.real}% · gap ${Math.abs(raw - ref.real)}pp · routed=${routed}`);
    } catch (e) {
      process.stdout.write(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await prisma.projectAgent.deleteMany({ where: { projectId: project.id } });
  await prisma.project.delete({ where: { id: project.id } });

  console.log("\n\n===== PAIRED POINTS (paste into calibration-map SEED_POINTS) =====");
  for (const p of points) {
    console.log(
      `  { type: "${p.type}", raw: ${p.raw}, real: ${p.real}, note: "${p.note.replace(/"/g, "'")}" },`,
    );
  }
  // Per-type summary.
  const byType: Record<string, number[]> = {};
  for (const p of points) (byType[p.type] ??= []).push(Math.abs(p.raw - p.real));
  console.log("\nPer-type mean gap:");
  for (const [t, gaps] of Object.entries(byType)) {
    console.log(`  ${t}: n=${gaps.length}, MAE=${Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length)}pp`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("REFS RUN FAILED:", e);
    process.exit(1);
  });
