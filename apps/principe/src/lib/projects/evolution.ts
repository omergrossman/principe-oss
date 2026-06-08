import { prisma } from "@/lib/db/prisma";

/**
 * Programmatic agent evolution.
 *
 * When a KnowledgeSource gains/refreshes content, append a dated intel
 * note to the evolutionLog of every agent the source is relevant to.
 *
 * Match rules (V1):
 *   - source.projectId NULL (firm-wide) → applies to all ACTIVE projects
 *     in the firm.
 *   - source.projectId set → applies only to that project.
 *   - For agent match within the project: agent.region === source.region,
 *     OR source.region is NULL/global (applies to every agent).
 *
 * Idempotency: each evolution log entry carries a `sourceHash` derived
 * from the source row's `contentHash`. If the agent already has an
 * entry with this exact sourceHash, we skip — re-running the function
 * for the same content is a no-op.
 *
 * No LLM call — pure text append.
 */
export async function appendEvolutionForSource(sourceId: string): Promise<{
  agentsTouched: number;
  projectsTouched: number;
}> {
  const source = await prisma.knowledgeSource.findUnique({
    where: { id: sourceId },
    select: {
      id: true,
      firmId: true,
      projectId: true,
      title: true,
      url: true,
      region: true,
      contentHash: true,
      content: true,
    },
  });
  if (!source || !source.content || !source.contentHash) {
    return { agentsTouched: 0, projectsTouched: 0 };
  }

  const projects = await prisma.project.findMany({
    where: {
      firmId: source.firmId,
      status: "ACTIVE",
      ...(source.projectId ? { id: source.projectId } : {}),
    },
    select: { id: true },
  });
  if (projects.length === 0) {
    return { agentsTouched: 0, projectsTouched: 0 };
  }

  const matchingRegion = source.region && source.region !== "global"
    ? source.region
    : null;
  const date = new Date().toISOString();

  let agentsTouched = 0;
  const projectsTouched = projects.length;

  for (const project of projects) {
    const agents = await prisma.projectAgent.findMany({
      where: {
        projectId: project.id,
        ...(matchingRegion ? { region: matchingRegion } : {}),
      },
      select: { id: true, evolutionLog: true },
    });

    for (const agent of agents) {
      const log = parseLog(agent.evolutionLog);
      if (log.some((e) => e.sourceHash === source.contentHash)) {
        // Already recorded — skip.
        continue;
      }
      log.push({
        date,
        sourceTitle: source.title,
        sourceUrl: source.url ?? undefined,
        sourceHash: source.contentHash!,
      });
      await prisma.projectAgent.update({
        where: { id: agent.id },
        data: { evolutionLog: log as unknown as object[] },
      });
      agentsTouched += 1;
    }
  }

  return { agentsTouched, projectsTouched };
}

interface LogEntry {
  date: string;
  sourceTitle: string;
  sourceUrl?: string;
  sourceHash: string;
}

function parseLog(raw: unknown): LogEntry[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (x): x is LogEntry =>
      typeof x === "object" &&
      x !== null &&
      typeof (x as Record<string, unknown>).date === "string" &&
      typeof (x as Record<string, unknown>).sourceTitle === "string" &&
      typeof (x as Record<string, unknown>).sourceHash === "string",
  );
}
