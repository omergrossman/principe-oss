import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import { markPersonasStaleForTranscript } from "@/lib/transcripts/propagate";
import { INDUSTRIES, REGION_KEYS, THREAT_TYPES } from "@/lib/canon";

interface PatchBody {
  insightText?: string;
  enabled?: boolean;
  applicableIndustries?: string[];
  applicableRegions?: string[];
  applicableFrameworks?: string[];
  applicableThreatTypes?: string[];
  vocabularyAnchors?: string[];
  routingScope?: "UNIVERSAL" | "TARGETED";
}

function filterArr(v: unknown, allow?: Set<string>): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim())
    .filter((x) => x && (!allow || allow.has(x)));
}

const VALID_INDUSTRIES = new Set<string>(INDUSTRIES);
const VALID_REGIONS = new Set<string>(REGION_KEYS);
const VALID_THREATS = new Set<string>(THREAT_TYPES);

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string; insightId: string }> },
) {
  const session = await requireRole("PRINCIPE_ADMIN");
  const { id, insightId } = await params;

  const insight = await prisma.transcriptInsight.findFirst({
    where: {
      id: insightId,
      transcript: { id, firmId: session.firmId },
    },
    select: { id: true },
  });
  if (!insight) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }

  const body = (await req.json().catch(() => ({}))) as Partial<PatchBody>;
  const data: Prisma.TranscriptInsightUpdateInput = {};

  let changed = false;
  if (typeof body.insightText === "string") {
    const txt = body.insightText.trim();
    if (txt.length === 0) {
      return NextResponse.json({ error: "Insight text cannot be empty." }, { status: 400 });
    }
    data.insightText = txt.slice(0, 400);
    changed = true;
  }
  if (typeof body.enabled === "boolean") {
    data.enabled = body.enabled;
    changed = true;
  }
  if (body.routingScope === "UNIVERSAL" || body.routingScope === "TARGETED") {
    data.routingScope = body.routingScope;
    changed = true;
  }
  if (body.applicableIndustries !== undefined) {
    data.applicableIndustries = filterArr(body.applicableIndustries, VALID_INDUSTRIES);
    changed = true;
  }
  if (body.applicableRegions !== undefined) {
    data.applicableRegions = filterArr(body.applicableRegions, VALID_REGIONS);
    changed = true;
  }
  if (body.applicableFrameworks !== undefined) {
    data.applicableFrameworks = filterArr(body.applicableFrameworks);
    changed = true;
  }
  if (body.applicableThreatTypes !== undefined) {
    data.applicableThreatTypes = filterArr(body.applicableThreatTypes, VALID_THREATS);
    changed = true;
  }
  if (body.vocabularyAnchors !== undefined) {
    data.vocabularyAnchors = filterArr(body.vocabularyAnchors);
    changed = true;
  }

  if (!changed) {
    return NextResponse.json({ error: "Nothing to update." }, { status: 400 });
  }

  const updated = await prisma.transcriptInsight.update({
    where: { id: insightId },
    data,
  });

  // Flag affected personas as stale — admin triggers recompute explicitly.
  await markPersonasStaleForTranscript(id);

  return NextResponse.json({ insight: updated });
}
