import { prisma } from "@/lib/db/prisma";
import { generatePersonas, PANEL_VERSION, type AgenticPersona } from "./generate100";

/**
 * Idempotent seed for the agentic-100 CISO panel.
 *
 * On first run: creates the panel + 100 PersonaDefinition rows, marks it
 * active, deactivates any prior panels.
 *
 * On subsequent runs: verifies the panel exists with exactly 100 personas;
 * does nothing if so. If it exists but has the wrong count (mid-generation
 * crash), the personas are regenerated.
 */

export interface SeedResult {
  created: boolean;
  panelId: string;
  personaCount: number;
}

export async function ensureAgenticPanel(): Promise<SeedResult> {
  const existing = await prisma.cISOPanel.findUnique({
    where: { version: PANEL_VERSION },
    include: { _count: { select: { personas: true } } },
  });

  if (existing && existing._count.personas === 100) {
    if (!existing.isActive) {
      await activateOnly(existing.id);
    }
    return { created: false, panelId: existing.id, personaCount: 100 };
  }

  const personas: AgenticPersona[] = generatePersonas();

  const panel = await prisma.$transaction(async (tx) => {
    let p = existing;
    if (!p) {
      const created = await tx.cISOPanel.create({
        data: {
          version: PANEL_VERSION,
          populationFrame:
            "100 synthetic CISO agents — experienced (3+ years), spread across 7 regions, 24 industries (GICS-aligned), 5 company-size bands, 4 stances, 7 background archetypes.",
          isActive: false,
          defaultPanelSize: 100,
          maxPanelSize: 100,
          diversitySpec: {
            regions: ["us", "eu-west", "uk", "eu-central", "apac", "anz", "mea"],
            industriesMin: 15,
            stancesMin: 4,
            backgroundsMin: 5,
          },
        },
      });
      p = { ...created, _count: { personas: 0 } };
    } else {
      await tx.personaDefinition.deleteMany({ where: { panelId: p.id } });
    }

    await tx.personaDefinition.createMany({
      data: personas.map((per: AgenticPersona) => ({
        panelId: p!.id,
        key: per.key,
        name: per.name,
        region: per.region,
        industry: per.industry,
        companySize: per.companySize,
        tenure: per.tenure,
        background: per.background,
        reportsTo: per.reportsTo,
        budget: per.budget,
        markdown: per.markdown,
      })),
    });

    return p!;
  });

  await activateOnly(panel.id);

  return { created: true, panelId: panel.id, personaCount: 100 };
}

async function activateOnly(panelId: string): Promise<void> {
  await prisma.$transaction([
    prisma.cISOPanel.updateMany({
      where: { id: { not: panelId }, isActive: true },
      data: { isActive: false },
    }),
    prisma.cISOPanel.update({
      where: { id: panelId },
      data: { isActive: true },
    }),
  ]);
}
