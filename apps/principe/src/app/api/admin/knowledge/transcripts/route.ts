// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import { fireAndForgetDistillTranscript } from "@/lib/transcripts/distill";
import { INDUSTRIES, REGION_KEYS, COMPANY_SIZES } from "@/lib/canon";

const MIN_TRANSCRIPT_CHARS = 500;

export async function GET() {
  const session = await requireRole("PRINCIPE_ADMIN");
  const transcripts = await prisma.transcript.findMany({
    where: { firmId: session.firmId },
    orderBy: { addedAt: "desc" },
    select: {
      id: true,
      speakerName: true,
      speakerRole: true,
      speakerIndustry: true,
      speakerRegion: true,
      speakerCompanySize: true,
      sourceTitle: true,
      sourceUrl: true,
      distillationStatus: true,
      addedAt: true,
      _count: { select: { insights: true } },
    },
  });
  return NextResponse.json({ transcripts });
}

interface CreateBody {
  speakerName?: string;
  speakerRole?: string;
  speakerIndustry?: string;
  speakerRegion?: string;
  speakerCompanySize?: string;
  sourceUrl?: string;
  sourceTitle?: string;
  rawTranscript?: string;
}

export async function POST(req: Request) {
  const session = await requireRole("PRINCIPE_ADMIN");
  const body = (await req.json().catch(() => ({}))) as Partial<CreateBody>;

  const speakerName = typeof body.speakerName === "string" ? body.speakerName.trim() : "";
  const speakerRole = typeof body.speakerRole === "string" ? body.speakerRole.trim() : "";
  const speakerIndustry =
    typeof body.speakerIndustry === "string" ? body.speakerIndustry.trim() : "";
  const speakerRegion =
    typeof body.speakerRegion === "string" ? body.speakerRegion.trim() : "";
  const speakerCompanySize =
    typeof body.speakerCompanySize === "string" ? body.speakerCompanySize.trim() : "";
  const sourceUrl =
    typeof body.sourceUrl === "string" && body.sourceUrl.trim()
      ? body.sourceUrl.trim()
      : null;
  const sourceTitle =
    typeof body.sourceTitle === "string" ? body.sourceTitle.trim() : "";
  const rawTranscript =
    typeof body.rawTranscript === "string" ? body.rawTranscript : "";

  const errors: string[] = [];
  if (!speakerName) errors.push("Speaker name required.");
  if (!speakerRole) errors.push("Speaker role required.");
  if (!(INDUSTRIES as readonly string[]).includes(speakerIndustry)) {
    errors.push("Speaker industry must be one of the canonical 24.");
  }
  if (!(REGION_KEYS as readonly string[]).includes(speakerRegion)) {
    errors.push("Speaker region must be one of the canonical region keys.");
  }
  if (!(COMPANY_SIZES as readonly string[]).includes(speakerCompanySize)) {
    errors.push("Speaker company size must be one of the canonical sizes.");
  }
  if (!sourceTitle) errors.push("Source title required.");
  if (rawTranscript.length < MIN_TRANSCRIPT_CHARS) {
    errors.push(`Transcript must be at least ${MIN_TRANSCRIPT_CHARS} characters.`);
  }
  if (errors.length > 0) {
    return NextResponse.json({ errors }, { status: 400 });
  }

  const transcript = await prisma.transcript.create({
    data: {
      firmId: session.firmId,
      speakerName,
      speakerRole,
      speakerIndustry,
      speakerRegion,
      speakerCompanySize,
      sourceUrl,
      sourceTitle,
      rawTranscript,
      distillationStatus: "PENDING",
    },
    select: { id: true },
  });

  fireAndForgetDistillTranscript(transcript.id);

  return NextResponse.json({ transcriptId: transcript.id });
}
