// SPDX-License-Identifier: AGPL-3.0-or-later
// One-shot: refresh every existing project's personas to the CURRENT calibrated
// panel (posture + AI-autonomy axis + 2026 grounding) WITHOUT wiping per-persona
// memory. The normal materialise path delete+creates rows (losing askHistory /
// coreOpinions / evolutionLog / signatureVocabulary); this regenerates the same
// deterministic personas per project and UPDATES each row in place by agentKey,
// preserving those memory columns.
//
//   DATABASE_URL=... PRINCIPE_ENCRYPTION_KEY=... pnpm -C apps/principe exec tsx scripts/rematerialise-projects.ts
import { prisma } from "@/lib/db/prisma";
import { generateAgentsForProject } from "@/lib/projects/materialise";
import type { PanelComposition } from "@/lib/projects/composition";

async function main() {
  const projects = await prisma.project.findMany({
    select: { id: true, name: true, composition: true, panelSize: true },
    orderBy: { name: "asc" },
  });
  console.log(`Found ${projects.length} project(s).\n`);

  let totalUpdated = 0;
  let totalMissing = 0;
  for (const proj of projects) {
    const composition = (proj.composition as PanelComposition | null) ?? null;
    const personas = generateAgentsForProject(proj.id, composition, proj.panelSize);

    let updated = 0;
    let missing = 0;
    // One row at a time, matched on the (projectId, agentKey) unique key.
    // updateMany (not update) so a regenerated key absent from the DB is a
    // no-op count of 0 rather than a throw.
    for (const p of personas) {
      const res = await prisma.projectAgent.updateMany({
        where: { projectId: proj.id, agentKey: p.key },
        data: {
          name: p.name,
          region: p.region,
          industry: p.industry,
          companySize: p.companySize,
          tenure: p.tenure,
          stance: p.stance,
          baseMarkdown: p.systemPrompt, // the new calibrated prompt
          // askHistory / coreOpinions / evolutionLog / signatureVocabulary /
          // personaStale are intentionally NOT in `data` — preserved as-is.
        },
      });
      if (res.count > 0) updated += res.count;
      else missing++;
    }
    totalUpdated += updated;
    totalMissing += missing;
    const compLabel = composition ? "custom" : "default";
    console.log(
      `  ${proj.name} (${compLabel}, N=${proj.panelSize}): updated ${updated}/${personas.length}` +
        (missing ? ` · ${missing} regenerated key(s) not in DB` : ""),
    );
  }

  console.log(
    `\nDone. Updated ${totalUpdated} persona prompt(s) in place; memory columns preserved.` +
      (totalMissing ? ` ${totalMissing} key mismatch(es).` : ""),
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("REMATERIALISE FAILED:", e);
    process.exit(1);
  });
