// SPDX-License-Identifier: AGPL-3.0-or-later
// Sprint 5 — transcript distillation. One LLM call per transcript that
// extracts a fan of typed insights with routing tags. Distinct from
// `lib/sources/distill.ts` (which distills a single KnowledgeSource
// into a single card) — transcripts produce many independent insights.

import type Anthropic from "@anthropic-ai/sdk";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getAnthropicClientForFirm } from "@/lib/anthropic/client";
import { ANTHROPIC_MODELS } from "@/lib/anthropic/models";
import {
  INDUSTRIES,
  REGION_KEYS,
  THREAT_TYPES,
  type Industry,
  type RegionKey,
  type ThreatType,
} from "@/lib/canon";
import { propagateTranscriptToPersonas } from "./propagate";

const DISTILL_INPUT_CAP = 30_000;

type InsightKind =
  | "VENDOR_OPINION"
  | "REGULATORY_TAKE"
  | "INCIDENT_LESSON"
  | "BUYING_BEHAVIOR"
  | "TREND_CALL"
  | "THREAT_TAKE"
  | "FRAMEWORK_POSITION";

type RoutingScope = "UNIVERSAL" | "TARGETED";

interface ParsedInsight {
  insightText: string;
  kind: InsightKind;
  routingScope: RoutingScope;
  applicableIndustries: string[];
  applicableRegions: string[];
  applicableFrameworks: string[];
  applicableThreatTypes: string[];
  vocabularyAnchors: string[];
}

const SYSTEM_PROMPT = `You are extracting structured insights from a transcript of a CISO's public talk (conference, podcast, interview). The insights will brief synthetic CISO personas that simulate real CISO reasoning. Pattern-grounding matters — extract what makes this speaker's positions specific, not generic CISO platitudes.

Return strict JSON: a single array of 5-20 insight objects. NO markdown fence. NO preamble. NO trailing prose.

Each insight object shape:
{
  "insightText": "<1-3 sentences, ≤ 400 chars, the specific position/observation/lesson from this CISO>",
  "kind": "VENDOR_OPINION" | "REGULATORY_TAKE" | "INCIDENT_LESSON" | "BUYING_BEHAVIOR" | "TREND_CALL" | "THREAT_TAKE" | "FRAMEWORK_POSITION",
  "routingScope": "UNIVERSAL" | "TARGETED",
  "applicableIndustries": [<canonical industry names; empty if UNIVERSAL>],
  "applicableRegions": [<region keys; empty if UNIVERSAL>],
  "applicableFrameworks": [<framework names like "DORA","NIS2","NIST CSF v2","MITRE ATT&CK","HIPAA","PCI-DSS","ISO 27001">],
  "applicableThreatTypes": [<threat type keys; empty if no clear threat match>],
  "vocabularyAnchors": [<≤ 5 short phrases this CISO uses that future personas should reuse>]
}

Routing rules:
- "UNIVERSAL" = the insight applies broadly across industries/regions (e.g. "CISOs increasingly report budget compression in 2026"). applicableIndustries + applicableRegions stay empty.
- "TARGETED" = the insight is specific to a context (e.g. "EU fintech CISOs prioritize DORA evidence collection over general SOC tooling"). Populate the relevant tags.

Canonical industry names (use these exactly):
${INDUSTRIES.map((i) => `  - ${i}`).join("\n")}

Canonical region keys: ${REGION_KEYS.join(", ")}

Canonical threat type keys: ${THREAT_TYPES.join(", ")}

Insight kind guidance:
- VENDOR_OPINION: position on a specific vendor/category ("X overpromises on Y").
- REGULATORY_TAKE: how this CISO interprets a regulation ("DORA Art. 28 is the bottleneck").
- INCIDENT_LESSON: a lesson from a real incident the CISO references.
- BUYING_BEHAVIOR: procurement / vendor selection patterns.
- TREND_CALL: forward-looking prediction or pattern observation.
- THREAT_TAKE: position on a threat vector / attack pattern.
- FRAMEWORK_POSITION: position on a control framework / methodology.

Quality bar:
- Specific > generic. "Spends 40% of his budget on identity" beats "thinks identity matters."
- Cite the speaker's actual reasoning when present. Don't invent rationale.
- Don't include logistical fluff ("thanks for inviting me", "great question").
- Empty fields if not present. Don't hallucinate routing tags to seem thorough.`;

interface DistillInput {
  transcriptId: string;
}

interface DistillResult {
  ok: boolean;
  skipped?: "no-content" | "no-api-key";
  insightCount?: number;
  error?: string;
}

export async function distillTranscript({
  transcriptId,
}: DistillInput): Promise<DistillResult> {
  const transcript = await prisma.transcript.findUnique({
    where: { id: transcriptId },
    select: {
      id: true,
      firmId: true,
      speakerName: true,
      speakerRole: true,
      speakerIndustry: true,
      speakerRegion: true,
      speakerCompanySize: true,
      sourceTitle: true,
      rawTranscript: true,
    },
  });
  if (!transcript) return { ok: false, error: "Transcript not found" };
  if (!transcript.rawTranscript || transcript.rawTranscript.trim().length === 0) {
    return { ok: false, skipped: "no-content" };
  }

  let client: Anthropic;
  try {
    client = await getAnthropicClientForFirm(transcript.firmId);
  } catch (e) {
    if (e instanceof Error && e.message === "ANTHROPIC_KEY_MISSING") {
      await markFailed(transcriptId, "Anthropic key not configured for this firm");
      return { ok: false, skipped: "no-api-key" };
    }
    throw e;
  }

  await prisma.transcript.update({
    where: { id: transcriptId },
    data: { distillationStatus: "PENDING", distillationError: null },
  });

  const raw = transcript.rawTranscript.slice(0, DISTILL_INPUT_CAP);
  const speakerContext = `Speaker: ${transcript.speakerName} (${transcript.speakerRole}) — industry: ${transcript.speakerIndustry}, region: ${transcript.speakerRegion}, company size: ${transcript.speakerCompanySize}.\nSource: ${transcript.sourceTitle}\n\n---\n\n`;

  let parsedInsights: ParsedInsight[];
  try {
    const res = await client.messages.create({
      model: ANTHROPIC_MODELS.panel,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: speakerContext + raw }],
    });
    const text = res.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("")
      .trim();
    parsedInsights = parseInsights(text);
    if (parsedInsights.length === 0) {
      throw new Error("Distiller returned an empty insights array");
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message.slice(0, 400) : "unknown";
    await markFailed(transcriptId, msg);
    return { ok: false, error: msg };
  }

  // Replace any prior insights (idempotent retry behavior).
  await prisma.$transaction([
    prisma.transcriptInsight.deleteMany({ where: { transcriptId } }),
    prisma.transcriptInsight.createMany({
      data: parsedInsights.map((p) => ({
        transcriptId,
        insightText: p.insightText,
        kind: p.kind,
        routingScope: p.routingScope,
        applicableIndustries: p.applicableIndustries,
        applicableRegions: p.applicableRegions,
        applicableFrameworks: p.applicableFrameworks,
        applicableThreatTypes: p.applicableThreatTypes,
        vocabularyAnchors: p.vocabularyAnchors,
      })),
    }),
    prisma.transcript.update({
      where: { id: transcriptId },
      data: { distillationStatus: "COMPLETE", distillationError: null },
    }),
  ]);

  // Propagate to matching personas — auto-populates their depth fields.
  // Awaited so the seeder + admin UI know it's done before responding.
  try {
    await propagateTranscriptToPersonas(transcriptId);
  } catch (e) {
    console.warn(
      `[transcript-distill ${transcriptId}] propagation failed:`,
      e instanceof Error ? e.message : String(e),
    );
  }

  return { ok: true, insightCount: parsedInsights.length };
}

async function markFailed(transcriptId: string, error: string): Promise<void> {
  await prisma.transcript
    .update({
      where: { id: transcriptId },
      data: { distillationStatus: "FAILED", distillationError: error },
    })
    .catch(() => {});
}

function parseInsights(text: string): ParsedInsight[] {
  // Strip code fence if model added one despite instruction.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const data = JSON.parse(cleaned);
  if (!Array.isArray(data)) {
    throw new Error("Distiller output is not an array");
  }
  return data.map(coerceInsight).filter((x): x is ParsedInsight => x !== null);
}

const VALID_KINDS = new Set<InsightKind>([
  "VENDOR_OPINION",
  "REGULATORY_TAKE",
  "INCIDENT_LESSON",
  "BUYING_BEHAVIOR",
  "TREND_CALL",
  "THREAT_TAKE",
  "FRAMEWORK_POSITION",
]);

const VALID_REGIONS = new Set<string>(REGION_KEYS);
const VALID_INDUSTRIES = new Set<string>(INDUSTRIES);
const VALID_THREATS = new Set<string>(THREAT_TYPES);

function coerceInsight(raw: unknown): ParsedInsight | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const insightText =
    typeof r.insightText === "string" ? r.insightText.trim().slice(0, 400) : "";
  if (!insightText) return null;

  const kindRaw = typeof r.kind === "string" ? r.kind : "";
  const kind: InsightKind = VALID_KINDS.has(kindRaw as InsightKind)
    ? (kindRaw as InsightKind)
    : "TREND_CALL";

  const routingScope: RoutingScope =
    r.routingScope === "UNIVERSAL" ? "UNIVERSAL" : "TARGETED";

  return {
    insightText,
    kind,
    routingScope,
    applicableIndustries: filterArr(r.applicableIndustries, VALID_INDUSTRIES, 8),
    applicableRegions: filterArr(r.applicableRegions, VALID_REGIONS, 4),
    applicableFrameworks: arrStrings(r.applicableFrameworks, 6, 60),
    applicableThreatTypes: filterArr(r.applicableThreatTypes, VALID_THREATS, 5),
    vocabularyAnchors: arrStrings(r.vocabularyAnchors, 5, 80),
  };
}

function filterArr(v: unknown, allow: Set<string>, max: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => allow.has(x))
    .slice(0, max);
}

function arrStrings(v: unknown, max: number, perItemCap: number): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().slice(0, perItemCap))
    .filter(Boolean)
    .slice(0, max);
}

export function fireAndForgetDistillTranscript(transcriptId: string): void {
  void distillTranscript({ transcriptId }).catch((e) => {
    console.warn(
      `[transcript-distill] ${transcriptId} failed:`,
      e instanceof Error ? e.message : String(e),
    );
  });
}

// Unused import suppression for now — kept in case future routes want
// the typed Prisma payload helpers.
export type { Industry, RegionKey, ThreatType };
void Prisma;
