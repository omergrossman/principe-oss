// SPDX-License-Identifier: AGPL-3.0-or-later
// Leg-2 on-task calibration: run the 8 survey pitches through an MEA-matched
// panel (matching the all-MEA respondent pool) and compare panel "% in favor"
// to the real CISO answers. Throwaway project, cleaned up at the end.
//
// Run (with the DB bridged to host:55432):
//   DATABASE_URL=... PRINCIPE_ENCRYPTION_KEY=... \
//   pnpm -C apps/principe exec tsx scripts/calibrate-leg2.ts
import { prisma } from "@/lib/db/prisma";
import { materialiseProjectAgents } from "@/lib/projects/materialise";
import { SIZE_BANDS, type PanelComposition } from "@/lib/projects/composition";
import { getAnthropicClientForFirm } from "@/lib/anthropic/client";
import { runPanelAsk } from "@/lib/ciso-panel/ask";

const N = 50;

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

// Real CISO "% in favor" (pro / 12) from the survey, per pitch. 12 respondents
// with genuine self-reported regions: 9 MEA / 2 US (dliniado, melissa) / 1 APAC
// (tommy) — real geographic spread now, no relabelling. Recomputed 2026-06-22
// from all 12 responses. pro = "Definitely/Probably would".
const REAL = [25, 42, 58, 17, 58, 58, 92, 67];
const LABEL = [
  "MDR displacement",
  "Autonomous AI SOC auto-close",
  "$40k KEV detection-testing",
  "Replace SIEM w/ NL data lake",
  "Auto-gen SOC2/ISO evidence",
  "Monitor employee LLM prompts",
  "Passwordless org-wide 12mo",
  "Buy from pre-Series-A startup",
];

const MIX: PanelComposition = {
  regionWeights: { mea: 75, us: 17, apac: 8 }, // matches the 9 MEA / 2 US / 1 APAC respondent pool
  industries: [],
  stanceWeights: { cautious: 0.25, balanced: 0.25, aggressive: 0.25, contrarian: 0.25 },
  sizeMin: SIZE_BANDS[0],
  sizeMax: SIZE_BANDS[4],
  presetKey: null,
};

async function main() {
  const firm = await prisma.firm.findFirst({
    where: { anthropicKeyLast4: { not: null } },
    select: { id: true },
  });
  if (!firm) throw new Error("no firm with an Anthropic key");

  const project = await prisma.project.create({
    data: { firmId: firm.id, name: "[calib] MIX Leg-2", composition: MIX as unknown as object },
    select: { id: true },
  });
  await materialiseProjectAgents(project.id, MIX, N);
  const client = await getAnthropicClientForFirm(firm.id);

  const rows: { q: number; label: string; panel: number | null; real: number; pro: number; con: number; neu: number; total: number }[] = [];
  for (let i = 0; i < PITCHES.length; i++) {
    process.stdout.write(`\n[Q${i + 1}] ${LABEL[i]} … `);
    try {
      const panel = await runPanelAsk(PITCHES[i], client, firm.id, project.id);
      const a = panel.aggregates;
      const total = panel.responses.length;
      const favor = total > 0 ? Math.round((a.proCount / total) * 100) : 0;
      rows.push({ q: i + 1, label: LABEL[i], panel: favor, real: REAL[i], pro: a.proCount, con: a.conCount, neu: a.neutralCount, total });
      process.stdout.write(`panel ${favor}% in favor (pro ${a.proCount}/${total}) · real ${REAL[i]}% · gap ${Math.abs(favor - REAL[i])}pp`);
    } catch (e) {
      rows.push({ q: i + 1, label: LABEL[i], panel: null, real: REAL[i], pro: 0, con: 0, neu: 0, total: 0 });
      process.stdout.write(`FAILED: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  // Cleanup.
  await prisma.projectAgent.deleteMany({ where: { projectId: project.id } });
  await prisma.project.delete({ where: { id: project.id } });

  const scored = rows.filter((r) => r.panel !== null) as (typeof rows[number] & { panel: number })[];
  const gaps = scored.map((r) => Math.abs(r.panel - r.real));
  const mae = gaps.length ? Math.round(gaps.reduce((x, y) => x + y, 0) / gaps.length) : null;
  const within15 = gaps.filter((g) => g <= 15).length;

  console.log("\n\n===== LEG-2 CALIBRATION (MIX panel (9MEA/2US/1APAC) N=" + N + " vs 12 real CISOs) =====");
  console.log("Q  | pitch                          | panel | real | gap");
  for (const r of rows) {
    const p = r.panel === null ? "FAIL" : `${r.panel}%`;
    console.log(
      `${String(r.q).padEnd(2)} | ${r.label.padEnd(30)} | ${p.padStart(5)} | ${String(r.real + "%").padStart(4)} | ${r.panel === null ? "—" : Math.abs(r.panel - r.real) + "pp"}`,
    );
  }
  console.log(`\nMean absolute gap (MAE): ${mae}pp   ·   within 15pp: ${within15}/${scored.length}`);
  console.log("RESULT_JSON " + JSON.stringify({ n_real: 12, panelN: N, mae, within15, rows }));
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("CALIBRATION FAILED:", e);
    process.exit(1);
  });
