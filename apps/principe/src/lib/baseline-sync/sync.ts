import { createHmac } from "node:crypto";
import { prisma } from "@/lib/db/prisma";

/**
 * Tenant-side baseline sync against DP master.
 *
 * Flow:
 *   1. Cheap version check — GET /api/baseline/v1/version. If the
 *      returned version matches our last-applied version, return early.
 *   2. Otherwise pull the delta — GET /api/baseline/v1/delta?since=...
 *   3. Apply: upsert added sources/transcripts by baselineId; soft-disable
 *      rows whose baselineId is in the removed lists. Tenant-added
 *      rows (baselineId NULL) are never touched.
 *   4. Stamp BaselineSyncState with the new version.
 *
 * Auth: HMAC-SHA256 of `${timestamp}\n${instanceId}\n${path}` signed
 * with DP_BOOTSTRAP_SECRET. DP master verifies against the same
 * secret stored in the Instance row.
 */

const DP_MASTER_URL = process.env.DP_MASTER_URL?.trim();
const DP_INSTANCE_ID = process.env.DP_INSTANCE_ID?.trim();
const DP_BOOTSTRAP_SECRET = process.env.DP_BOOTSTRAP_SECRET?.trim();

export interface SyncResult {
  status: "ok" | "version-match" | "skipped-no-config" | "error";
  appliedVersion?: string;
  addedSources?: number;
  addedTranscripts?: number;
  removedSources?: number;
  removedTranscripts?: number;
  error?: string;
}

interface VersionResponse {
  version: string;
  sourceCount: number;
  transcriptCount: number;
}

interface DeltaSource {
  id: string;
  kind: "URL" | "TEXT" | "FILE";
  title: string;
  url: string | null;
  fileName: string | null;
  content: string | null;
  category: string | null;
  addedAt: string;
}

interface DeltaTranscript {
  id: string;
  speakerName: string;
  speakerTitle: string | null;
  speakerIndustry: string | null;
  speakerRegion: string | null;
  year: number | null;
  sourceUrl: string | null;
  content: string;
  addedAt: string;
}

interface DeltaResponse {
  version: string;
  addedSources: DeltaSource[];
  addedTranscripts: DeltaTranscript[];
  removedSourceIds: string[];
  removedTranscriptIds: string[];
}

function isConfigured(): boolean {
  return Boolean(DP_MASTER_URL && DP_INSTANCE_ID && DP_BOOTSTRAP_SECRET);
}

function signedHeaders(path: string): Record<string, string> {
  const timestamp = new Date().toISOString();
  const payload = `${timestamp}\n${DP_INSTANCE_ID}\n${path}`;
  const sig = createHmac("sha256", DP_BOOTSTRAP_SECRET!)
    .update(payload)
    .digest("hex");
  return {
    "x-dp-instance-id": DP_INSTANCE_ID!,
    "x-dp-timestamp": timestamp,
    authorization: `Bearer ${sig}`,
    accept: "application/json",
  };
}

async function fetchJson<T>(path: string): Promise<T> {
  const res = await fetch(`${DP_MASTER_URL}${path}`, {
    method: "GET",
    headers: signedHeaders(path),
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text().catch(() => `HTTP ${res.status}`);
    throw new Error(`DP master ${path} returned ${res.status}: ${body.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function syncBaselineFromDp(args: {
  firmId: string;
}): Promise<SyncResult> {
  if (!isConfigured()) {
    return { status: "skipped-no-config" };
  }
  const state = await prisma.baselineSyncState.findUnique({
    where: { id: 1 },
  });
  const lastVersion = state?.lastAppliedVersion?.toISOString() ?? null;

  try {
    // 1. Cheap version check
    const current = await fetchJson<VersionResponse>(
      "/api/baseline/v1/version",
    );
    if (lastVersion === current.version) {
      await stampState({
        version: current.version,
        status: "version-match",
      });
      return {
        status: "version-match",
        appliedVersion: current.version,
      };
    }

    // 2. Pull delta
    const sincePath = `/api/baseline/v1/delta?since=${encodeURIComponent(
      lastVersion ?? new Date(0).toISOString(),
    )}`;
    const delta = await fetchJson<DeltaResponse>(sincePath);

    // 3. Apply
    const counts = await applyDelta(args.firmId, delta);

    // 4. Stamp
    await stampState({
      version: delta.version,
      status: "ok",
    });

    return {
      status: "ok",
      appliedVersion: delta.version,
      ...counts,
    };
  } catch (e) {
    const error = e instanceof Error ? e.message : "unknown";
    await stampState({ version: lastVersion ?? null, status: error });
    return { status: "error", error };
  }
}

async function stampState(args: {
  version: string | null;
  status: string;
}): Promise<void> {
  await prisma.baselineSyncState.upsert({
    where: { id: 1 },
    create: {
      id: 1,
      lastAppliedVersion: args.version ? new Date(args.version) : null,
      lastSyncAt: new Date(),
      lastSyncStatus: args.status,
      syncCount: 1,
    },
    update: {
      lastAppliedVersion: args.version ? new Date(args.version) : null,
      lastSyncAt: new Date(),
      lastSyncStatus: args.status,
      syncCount: { increment: 1 },
    },
  });
}

async function applyDelta(
  firmId: string,
  delta: DeltaResponse,
): Promise<{
  addedSources: number;
  addedTranscripts: number;
  removedSources: number;
  removedTranscripts: number;
}> {
  let addedSources = 0;
  let addedTranscripts = 0;
  let removedSources = 0;
  let removedTranscripts = 0;

  // Upsert added sources. We key on (firmId, baselineId) so retry is
  // safe. URL kind gets the url for routing/scrape; TEXT/FILE store
  // content inline.
  for (const s of delta.addedSources) {
    const data = {
      firmId,
      baselineId: s.id,
      baselineRemovedAt: null,
      // Map DP master's kind to Principe's KnowledgeSourceKind.
      kind:
        s.kind === "URL"
          ? ("URL" as const)
          : s.kind === "FILE"
            ? ("FILE" as const)
            : ("TEXT" as const),
      url: s.url ?? null,
      filename: s.fileName ?? null,
      title: s.title,
      category: s.category ?? "framework",
      content: s.content ?? null,
      isCurated: true,
      enabled: true,
    };
    await prisma.knowledgeSource.upsert({
      where: {
        firmId_baselineId: { firmId, baselineId: s.id },
      },
      create: data,
      update: {
        title: data.title,
        url: data.url,
        filename: data.filename,
        content: data.content,
        category: data.category,
        baselineRemovedAt: null,
        enabled: true,
      },
    });
    addedSources += 1;
  }

  for (const t of delta.addedTranscripts) {
    await prisma.transcript.upsert({
      where: {
        firmId_baselineId: { firmId, baselineId: t.id },
      },
      create: {
        firmId,
        baselineId: t.id,
        baselineRemovedAt: null,
        speakerName: t.speakerName,
        speakerRole: t.speakerTitle ?? "CISO",
        speakerIndustry: t.speakerIndustry ?? "Other",
        speakerRegion: t.speakerRegion ?? "us",
        speakerCompanySize: "M",
        sourceUrl: t.sourceUrl,
        sourceTitle: `${t.speakerName}${t.year ? ` (${t.year})` : ""}`,
        rawTranscript: t.content,
      },
      update: {
        speakerName: t.speakerName,
        speakerRole: t.speakerTitle ?? "CISO",
        speakerIndustry: t.speakerIndustry ?? "Other",
        speakerRegion: t.speakerRegion ?? "us",
        sourceUrl: t.sourceUrl,
        rawTranscript: t.content,
        baselineRemovedAt: null,
      },
    });
    addedTranscripts += 1;
  }

  // Soft-disable removed items. We leave the rows so any historical
  // ProjectAsk that quoted them still resolves; the panel's read paths
  // filter on baselineRemovedAt IS NULL.
  if (delta.removedSourceIds.length > 0) {
    const r = await prisma.knowledgeSource.updateMany({
      where: {
        firmId,
        baselineId: { in: delta.removedSourceIds },
        baselineRemovedAt: null,
      },
      data: { baselineRemovedAt: new Date(), enabled: false },
    });
    removedSources = r.count;
  }
  if (delta.removedTranscriptIds.length > 0) {
    const r = await prisma.transcript.updateMany({
      where: {
        firmId,
        baselineId: { in: delta.removedTranscriptIds },
        baselineRemovedAt: null,
      },
      data: { baselineRemovedAt: new Date() },
    });
    removedTranscripts = r.count;
  }

  return { addedSources, addedTranscripts, removedSources, removedTranscripts };
}
