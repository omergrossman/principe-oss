// SPDX-License-Identifier: AGPL-3.0-or-later
import { prisma } from "@/lib/db/prisma";
import type { AgenticPersona } from "@/lib/personas/generate100";

// Sprint 5 — runtime persona extends AgenticPersona with depth fields
// so the ask path can build "YOUR ESTABLISHED POSITIONS" + "PHRASES
// YOU USE" sections without an extra DB join per agent.

export interface CoreOpinion {
  topic: string;
  position: string;
  kind: string;
  applicableThreatTypes: string[];
  createdAt: string;
}

export interface RuntimePersona extends AgenticPersona {
  coreOpinions: CoreOpinion[];
  signatureVocabulary: string[];
}

/**
 * Load a project's 100 agents from storage and project them into the
 * runtime persona shape that runPanelAsk expects.
 *
 * Each ProjectAgent's `baseMarkdown` IS the agent's system prompt
 * (Sprint 2's per-project materialisation writes the full prompt
 * content into that field). The `evolutionLog` is folded into a
 * "RECENT INTEL" suffix limited to the 5 most recent entries to keep
 * token budget bounded at fan-out time.
 */
export async function loadProjectAgents(projectId: string): Promise<RuntimePersona[]> {
  const rows = await prisma.projectAgent.findMany({
    where: { projectId },
    orderBy: { agentKey: "asc" },
  });

  return rows.map((r) => {
    const log = parseEvolutionLog(r.evolutionLog);
    const intelSection =
      log.length > 0
        ? `\n\nRECENT INTEL:\n${log
            .slice(-5)
            .map((e) => `- [${e.date.slice(0, 10)}] ${e.sourceTitle}`)
            .join("\n")}`
        : "";

    const coreOpinions = Array.isArray(r.coreOpinions)
      ? (r.coreOpinions as unknown as CoreOpinion[])
      : [];

    return {
      key: r.agentKey,
      name: r.name,
      region: r.region,
      industry: r.industry,
      companySize: r.companySize,
      tenure: r.tenure,
      // Background, budget, reportsTo were captured inside baseMarkdown at
      // materialisation time. The runtime doesn't need them as separate
      // fields — the system prompt has everything.
      background: "",
      reportsTo: "",
      budget: "",
      stance: r.stance as AgenticPersona["stance"],
      concerns: [],
      initiative: "",
      markdown: r.baseMarkdown,
      systemPrompt: r.baseMarkdown + intelSection,
      coreOpinions,
      signatureVocabulary: r.signatureVocabulary ?? [],
    };
  });
}

interface EvolutionEntry {
  date: string;
  sourceTitle: string;
  sourceUrl?: string;
  sourceHash?: string;
}

function parseEvolutionLog(raw: unknown): EvolutionEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: EvolutionEntry[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === "object" &&
      "date" in item &&
      "sourceTitle" in item &&
      typeof (item as Record<string, unknown>).date === "string" &&
      typeof (item as Record<string, unknown>).sourceTitle === "string"
    ) {
      const e = item as Record<string, unknown>;
      out.push({
        date: e.date as string,
        sourceTitle: e.sourceTitle as string,
        sourceUrl: typeof e.sourceUrl === "string" ? e.sourceUrl : undefined,
        sourceHash: typeof e.sourceHash === "string" ? e.sourceHash : undefined,
      });
    }
  }
  return out;
}
