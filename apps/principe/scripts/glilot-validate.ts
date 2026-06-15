// SPDX-License-Identifier: AGPL-3.0-or-later
// External validation: pose the Glilot 2026 CISO Survey's (binary) questions to
// the ORIGINAL, ungrounded, GLOBAL panel and compare "% in favor" to Glilot's
// real published distribution. Glilot is global + larger-n + independent, so it
// is a better calibration reference than the n=9 MEA Google Form.
//
// IMPORTANT: run from `main` (original personas) so the panel was NOT grounded
// in Glilot's numbers — otherwise this is circular.
import { prisma } from "@/lib/db/prisma";
import { materialiseProjectAgents } from "@/lib/projects/materialise";
import { getAnthropicClientForFirm } from "@/lib/anthropic/client";
import { runPanelAsk } from "@/lib/ciso-panel/ask";

const N = 50;

// Glilot binary survey items, framed as a CISO answering about their own
// org/intent (the panel votes pro = yes / con = no / neutral = depends).
const QUESTIONS = [
  "Will you invest in AI-powered cybersecurity tools in 2026?",
  "Will you allocate budget specifically for AI systems that automate security tasks?",
  "By the end of 2026, will operational use of AI for defense be standard practice at your organization?",
  "Is securing AI-generated code a priority for your security program?",
  "Will you invest in tools specifically built to detect AI-driven attacks?",
  "Is governance and monitoring of your organization's own AI usage a priority for you?",
];
const REAL = [78, 41, 59, 56, 51, 48]; // Glilot real "% yes"
const LABEL = [
  "Invest in AI security tools",
  "Budget for AI task-automation",
  "AI-for-defense standard by 2026",
  "Securing AI-generated code",
  "Detect AI-driven attacks",
  "Govern own AI usage",
];

async function main() {
  const firm = await prisma.firm.findFirst({
    where: { anthropicKeyLast4: { not: null } },
    select: { id: true },
  });
  if (!firm) throw new Error("no firm with an Anthropic key");

  // composition = null → the canonical GLOBAL default panel (matches Glilot).
  const project = await prisma.project.create({
    data: { firmId: firm.id, name: "[glilot-validate] global" },
    select: { id: true },
  });
  await materialiseProjectAgents(project.id, null, N);
  const client = await getAnthropicClientForFirm(firm.id);

  const rows: { q: number; label: string; panel: number | null; real: number; pro: number; con: number; neu: number; total: number }[] = [];
  for (let i = 0; i < QUESTIONS.length; i++) {
    process.stdout.write(`\n[Q${i + 1}] ${LABEL[i]} … `);
    try {
      const panel = await runPanelAsk(QUESTIONS[i], client, firm.id, project.id);
      const a = panel.aggregates;
      const total = panel.responses.length;
      const favor = total > 0 ? Math.round((a.proCount / total) * 100) : 0;
      rows.push({ q: i + 1, label: LABEL[i], panel: favor, real: REAL[i], pro: a.proCount, con: a.conCount, neu: a.neutralCount, total });
      process.stdout.write(`panel ${favor}% (pro ${a.proCount}/${total}) · real ${REAL[i]}% · gap ${Math.abs(favor - REAL[i])}pp`);
    } catch (e) {
      rows.push({ q: i + 1, label: LABEL[i], panel: null, real: REAL[i], pro: 0, con: 0, neu: 0, total: 0 });
      process.stdout.write(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  await prisma.projectAgent.deleteMany({ where: { projectId: project.id } });
  await prisma.project.delete({ where: { id: project.id } });

  const scored = rows.filter((r) => r.panel !== null) as (typeof rows[number] & { panel: number })[];
  const gaps = scored.map((r) => Math.abs(r.panel - r.real));
  const mae = gaps.length ? Math.round(gaps.reduce((x, y) => x + y, 0) / gaps.length) : null;
  const within15 = gaps.filter((g) => g <= 15).length;

  console.log("\n\n===== GLILOT EXTERNAL VALIDATION (global panel N=" + N + ", ORIGINAL ungrounded personas) =====");
  console.log("Q  | item                          | panel | real | gap");
  for (const r of rows) {
    const p = r.panel === null ? "FAIL" : `${r.panel}%`;
    console.log(`${String(r.q).padEnd(2)} | ${r.label.padEnd(29)} | ${p.padStart(5)} | ${String(r.real + "%").padStart(4)} | ${r.panel === null ? "—" : Math.abs(r.panel - r.real) + "pp"}`);
  }
  console.log(`\nMean absolute gap (MAE): ${mae}pp   ·   within 15pp: ${within15}/${scored.length}`);
  console.log("RESULT_JSON " + JSON.stringify({ source: "glilot-2026", panelN: N, mae, within15, rows }));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("VALIDATION FAILED:", e);
    process.exit(1);
  });
