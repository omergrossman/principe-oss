// SPDX-License-Identifier: AGPL-3.0-or-later
import { prisma } from "@/lib/db/prisma";
import {
  generatePersonas,
  type AgenticPersona,
} from "@/lib/personas/generate100";
import {
  type PanelComposition,
  SIZE_BANDS,
  DEFAULT_COMPOSITION,
} from "./composition";

/**
 * Produce 100 ProjectAgent rows for a project given its composition.
 *
 * The generator seed is derived from the project's id so re-running
 * materialisation for the same (project, composition) tuple yields the
 * same 100 agents (deterministic). Different projects with identical
 * compositions still get different agents — that's intentional. The
 * caller is expected to be a one-shot create or an explicit
 * "regenerate" operation.
 */
export async function materialiseProjectAgents(
  projectId: string,
  composition: PanelComposition | null,
  panelSize = 100,
): Promise<{ created: number }> {
  const personas = generateAgentsForProject(projectId, composition, panelSize);

  // Clear any existing agents first (regenerate path).
  await prisma.projectAgent.deleteMany({ where: { projectId } });

  await prisma.projectAgent.createMany({
    data: personas.map((p) => ({
      projectId,
      agentKey: p.key,
      name: p.name,
      region: p.region,
      industry: p.industry,
      companySize: p.companySize,
      tenure: p.tenure,
      stance: p.stance,
      baseMarkdown: p.systemPrompt,
      evolutionLog: [],
    })),
  });

  return { created: personas.length };
}

/**
 * Pure (no DB) — generate the N personas for a project. Exposed so
 * the wizard preview can render the same composition without writing
 * to the DB.
 *
 * Sprint 7: `panelSize` defaults to 100 to preserve legacy call shapes;
 * accepts 30-200 (clamped in generatePersonas).
 */
export function generateAgentsForProject(
  projectId: string,
  composition: PanelComposition | null,
  panelSize = 100,
): AgenticPersona[] {
  const seed = deriveSeed(projectId);
  if (!composition) {
    // Default project — use the canonical Sprint-1 seed for exact parity
    // at the canonical N=100. Pass panelSize so non-default-N still works
    // via the proportional-scaling path inside generatePersonas.
    return generatePersonas(undefined, undefined, panelSize);
  }
  const sizeMinIndex = SIZE_BANDS.indexOf(composition.sizeMin);
  const sizeMaxIndex = SIZE_BANDS.indexOf(composition.sizeMax);
  return generatePersonas(
    seed,
    {
      regionWeights: composition.regionWeights as Record<string, number>,
      industries: composition.industries,
      stanceWeights: composition.stanceWeights,
      sizeMinIndex,
      sizeMaxIndex,
    },
    panelSize,
  );
}

/**
 * Derive a 32-bit integer seed from a project id. cuid()s vary in
 * total entropy but the last ~10 base36 chars give us plenty of
 * spread for a PRNG seed.
 */
function deriveSeed(projectId: string): number {
  let h = 0;
  for (let i = 0; i < projectId.length; i++) {
    h = (h * 31 + projectId.charCodeAt(i)) | 0;
  }
  return Math.abs(h) || 1;
}

export { DEFAULT_COMPOSITION };
