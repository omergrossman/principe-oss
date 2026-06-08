/**
 * One-off: rebuild every ProjectAgent.baseMarkdown using the current
 * buildSystemPrompt() in generate100.ts.
 *
 * Use this after editing the persona system-prompt template (e.g.,
 * widening the con-verdict definition). Personas are deterministic per
 * (projectId, composition) so re-generating with the same seed yields
 * the same name / region / industry / stance / background / concerns /
 * initiative — only the prompt template scaffolding changes.
 *
 * Preserves all depth fields: coreOpinions, signatureVocabulary,
 * originatingTranscriptIds, evolutionLog, personaStale.
 *
 * Usage:
 *   pnpm tsx scripts/_rebuild-persona-prompts.ts
 */

import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __here = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__here, "..", ".env.local") });

import { prisma } from "../src/lib/db/prisma";
import { generateAgentsForProject } from "../src/lib/projects/materialise";
import type { PanelComposition } from "../src/lib/projects/composition";

async function main(): Promise<void> {
  const projects = await prisma.project.findMany({
    select: { id: true, name: true, firmId: true, composition: true },
  });
  console.log(`[rebuild-prompts] found ${projects.length} projects`);

  let totalUpdated = 0;

  for (const project of projects) {
    // composition is a JSON field on Project; null means "use canonical
    // Sprint-1 default seed". Cast through unknown because Prisma JSON
    // typing is loose.
    const compositionForGen: PanelComposition | null =
      (project.composition as unknown as PanelComposition | null) ?? null;

    const personas = generateAgentsForProject(project.id, compositionForGen);

    // Index by agentKey (which the generator emits as "agent-001"..."agent-100").
    const byKey = new Map(personas.map((p) => [p.key, p]));

    const existing = await prisma.projectAgent.findMany({
      where: { projectId: project.id },
      select: { id: true, agentKey: true },
    });

    let updated = 0;
    for (const row of existing) {
      const p = byKey.get(row.agentKey);
      if (!p) {
        console.warn(
          `[rebuild-prompts] ${project.name}: no generated persona for agentKey ${row.agentKey} — skipping`,
        );
        continue;
      }
      await prisma.projectAgent.update({
        where: { id: row.id },
        data: { baseMarkdown: p.systemPrompt },
      });
      updated += 1;
    }

    totalUpdated += updated;
    console.log(
      `[rebuild-prompts] ${project.name} (${project.id}): updated ${updated}/${existing.length} agents`,
    );
  }

  console.log(`[rebuild-prompts] complete: ${totalUpdated} ProjectAgent rows updated`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
