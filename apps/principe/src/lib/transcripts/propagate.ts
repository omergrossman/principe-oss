// Sprint 5 — auto-population of persona depth fields from transcripts.
//
// When a transcript distills successfully, every ProjectAgent matching
// the speaker's industry AND region accumulates that transcript's id,
// extracted opinions, and vocabulary anchors. The matching is by
// canonical industry/region — the LLM is instructed to use canonical
// names so cross-table equality works.
//
// Recomputation: when an insight is disabled OR edited, affected
// personas are flagged `personaStale=true`. Explicit admin trigger
// (POST /api/admin/knowledge/transcripts/[id]/recompute-personas) calls
// `recomputePersonas(transcriptId)` to re-derive from current enabled
// insights. This debounces runaway recomputation on bulk insight edits.

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";

interface CoreOpinion {
  topic: string;
  position: string;
  sourceTranscriptId: string;
  sourceInsightId: string;
  kind: string;
  // Sprint 5 — store applicableThreatTypes on each opinion so the ask
  // path can rank opinions by question relevance without joining back
  // to TranscriptInsight per agent.
  applicableThreatTypes: string[];
  createdAt: string;
}

/**
 * Propagate a newly-distilled transcript to matching personas:
 * - Add transcript id to originatingTranscriptIds (if not present)
 * - Append targeted insights (where this persona's industry+region match)
 *   as { topic, position } entries on coreOpinions
 * - Merge vocabulary anchors from all of this transcript's insights
 * - Clear personaStale (just-recomputed)
 */
export async function propagateTranscriptToPersonas(
  transcriptId: string,
): Promise<{ updatedPersonaCount: number }> {
  const transcript = await prisma.transcript.findUnique({
    where: { id: transcriptId },
    select: {
      id: true,
      firmId: true,
      speakerIndustry: true,
      speakerRegion: true,
      insights: {
        where: { enabled: true },
        select: {
          id: true,
          insightText: true,
          kind: true,
          routingScope: true,
          applicableIndustries: true,
          applicableRegions: true,
          applicableThreatTypes: true,
          vocabularyAnchors: true,
          createdAt: true,
        },
      },
    },
  });
  if (!transcript) return { updatedPersonaCount: 0 };

  const personas = await prisma.projectAgent.findMany({
    where: {
      industry: transcript.speakerIndustry,
      region: transcript.speakerRegion,
      project: { firmId: transcript.firmId },
    },
    select: {
      id: true,
      originatingTranscriptIds: true,
      coreOpinions: true,
      signatureVocabulary: true,
    },
  });

  if (personas.length === 0) return { updatedPersonaCount: 0 };

  const newOpinions: CoreOpinion[] = transcript.insights
    .filter((i) => i.routingScope === "TARGETED")
    .map((i) => ({
      topic: i.kind.toLowerCase().replace(/_/g, "-"),
      position: i.insightText,
      sourceTranscriptId: transcript.id,
      sourceInsightId: i.id,
      kind: i.kind,
      applicableThreatTypes: i.applicableThreatTypes,
      createdAt: i.createdAt.toISOString(),
    }));

  const newVocab = Array.from(
    new Set(transcript.insights.flatMap((i) => i.vocabularyAnchors)),
  ).filter(Boolean);

  let updated = 0;
  for (const persona of personas) {
    const existingOpinions = Array.isArray(persona.coreOpinions)
      ? (persona.coreOpinions as unknown as CoreOpinion[])
      : [];
    const filteredExisting = existingOpinions.filter(
      (o) => o.sourceTranscriptId !== transcript.id,
    );
    const mergedOpinions = [...filteredExisting, ...newOpinions];

    const existingTranscriptIds = persona.originatingTranscriptIds ?? [];
    const mergedTranscriptIds = existingTranscriptIds.includes(transcript.id)
      ? existingTranscriptIds
      : [...existingTranscriptIds, transcript.id];

    const mergedVocab = Array.from(
      new Set([...(persona.signatureVocabulary ?? []), ...newVocab]),
    ).slice(0, 50);

    await prisma.projectAgent.update({
      where: { id: persona.id },
      data: {
        originatingTranscriptIds: mergedTranscriptIds,
        coreOpinions: mergedOpinions as unknown as Prisma.InputJsonValue,
        signatureVocabulary: mergedVocab,
        personaStale: false,
      },
    });
    updated += 1;
  }

  return { updatedPersonaCount: updated };
}

/**
 * Re-derive persona fields from scratch for a transcript. Used after
 * insight edits/disables. Strips contributions from this transcript on
 * matching personas, then re-applies from current enabled insights.
 */
export async function recomputePersonasForTranscript(
  transcriptId: string,
): Promise<{ updatedPersonaCount: number }> {
  const transcript = await prisma.transcript.findUnique({
    where: { id: transcriptId },
    select: {
      id: true,
      firmId: true,
      speakerIndustry: true,
      speakerRegion: true,
    },
  });
  if (!transcript) return { updatedPersonaCount: 0 };

  const matchingPersonas = await prisma.projectAgent.findMany({
    where: {
      industry: transcript.speakerIndustry,
      region: transcript.speakerRegion,
      project: { firmId: transcript.firmId },
    },
    select: { id: true, coreOpinions: true, originatingTranscriptIds: true },
  });

  for (const persona of matchingPersonas) {
    const opinions = Array.isArray(persona.coreOpinions)
      ? (persona.coreOpinions as unknown as CoreOpinion[])
      : [];
    const filtered = opinions.filter(
      (o) => o.sourceTranscriptId !== transcript.id,
    );
    const txIds = (persona.originatingTranscriptIds ?? []).filter(
      (id) => id !== transcript.id,
    );
    await prisma.projectAgent.update({
      where: { id: persona.id },
      data: {
        coreOpinions: filtered as unknown as Prisma.InputJsonValue,
        originatingTranscriptIds: txIds,
      },
    });
  }

  return propagateTranscriptToPersonas(transcriptId);
}

/**
 * Flag personas as stale when an insight from a transcript is edited.
 * Cheap operation — just sets personaStale=true on matching personas.
 * Admin then triggers recompute explicitly.
 */
export async function markPersonasStaleForTranscript(
  transcriptId: string,
): Promise<{ markedCount: number }> {
  const transcript = await prisma.transcript.findUnique({
    where: { id: transcriptId },
    select: {
      firmId: true,
      speakerIndustry: true,
      speakerRegion: true,
    },
  });
  if (!transcript) return { markedCount: 0 };

  const res = await prisma.projectAgent.updateMany({
    where: {
      industry: transcript.speakerIndustry,
      region: transcript.speakerRegion,
      project: { firmId: transcript.firmId },
    },
    data: { personaStale: true },
  });
  return { markedCount: res.count };
}
