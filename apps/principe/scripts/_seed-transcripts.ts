/**
 * Sprint 5 — seeder for CISO talk transcripts.
 *
 * Reads `calibration/knowledge/<file>-snapshot.json`, creates one
 * Transcript row per entry, then awaits distillation sequentially.
 * Distillation auto-propagates to matching personas as part of its
 * post-completion flow.
 *
 * Idempotent by (firm, sourceTitle, speakerName) — re-running with the
 * same snapshot updates the existing transcript's rawTranscript + re-
 * distills.
 *
 * Usage:
 *   pnpm tsx scripts/_seed-transcripts.ts --file=expert-insights --firm-id=<firmId>
 */

import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";

const __here = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__here, "..", ".env.local") });

import { prisma } from "../src/lib/db/prisma";
import { distillTranscript } from "../src/lib/transcripts/distill";

interface Entry {
  speakerName: string;
  speakerRole: string;
  speakerIndustry: string;
  speakerRegion: string;
  speakerCompanySize: string;
  sourceUrl?: string;
  sourceTitle: string;
  rawTranscript: string;
}

function parseArgs(): { file: string; firmId: string } {
  const args = new Map<string, string>();
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args.set(m[1], m[2]);
  }
  const file = args.get("file");
  const firmId = args.get("firm-id");
  if (!file) throw new Error("--file required (snapshot file basename, e.g. expert-insights)");
  if (!firmId) throw new Error("--firm-id required");
  return { file, firmId };
}

async function loadSnapshot(file: string): Promise<Entry[]> {
  const path = resolve(
    process.cwd(),
    "..",
    "..",
    "calibration",
    "knowledge",
    `${file}-snapshot.json`,
  );
  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${file}-snapshot.json: expected array of entries`);
  }
  return parsed as Entry[];
}

async function seed(file: string, firmId: string): Promise<void> {
  const entries = await loadSnapshot(file);
  console.log(`[seed-transcripts:${file}] loading ${entries.length} entries for firm ${firmId}`);

  let created = 0;
  let updated = 0;
  const transcriptIds: string[] = [];

  for (const e of entries) {
    if (!e.speakerName || !e.sourceTitle || !e.rawTranscript) {
      console.warn(`[seed-transcripts] skipping entry missing speakerName/sourceTitle/rawTranscript`);
      continue;
    }
    const existing = await prisma.transcript.findFirst({
      where: { firmId: firmId, sourceTitle: e.sourceTitle, speakerName: e.speakerName },
      select: { id: true },
    });

    if (existing) {
      await prisma.transcript.update({
        where: { id: existing.id },
        data: {
          speakerRole: e.speakerRole,
          speakerIndustry: e.speakerIndustry,
          speakerRegion: e.speakerRegion,
          speakerCompanySize: e.speakerCompanySize,
          sourceUrl: e.sourceUrl ?? null,
          rawTranscript: e.rawTranscript,
          distillationStatus: "PENDING",
          distillationError: null,
        },
      });
      updated += 1;
      transcriptIds.push(existing.id);
    } else {
      const t = await prisma.transcript.create({
        data: {
          firmId: firmId,
          speakerName: e.speakerName,
          speakerRole: e.speakerRole,
          speakerIndustry: e.speakerIndustry,
          speakerRegion: e.speakerRegion,
          speakerCompanySize: e.speakerCompanySize,
          sourceUrl: e.sourceUrl ?? null,
          sourceTitle: e.sourceTitle,
          rawTranscript: e.rawTranscript,
          distillationStatus: "PENDING",
        },
        select: { id: true },
      });
      created += 1;
      transcriptIds.push(t.id);
    }
  }

  console.log(`[seed-transcripts:${file}] upserted: created=${created} updated=${updated}`);
  console.log(`[seed-transcripts:${file}] distilling ${transcriptIds.length} sequentially (~10-30s each)…`);

  let done = 0;
  let insightsTotal = 0;
  for (const tid of transcriptIds) {
    const r = await distillTranscript({ transcriptId: tid });
    done += 1;
    if (r.ok) {
      insightsTotal += r.insightCount ?? 0;
      console.log(
        `[seed-transcripts:${file}] [${done}/${transcriptIds.length}] ${tid} → ok (${r.insightCount} insights)`,
      );
    } else {
      console.warn(
        `[seed-transcripts:${file}] [${done}/${transcriptIds.length}] ${tid} → ${r.error ?? r.skipped ?? "unknown"}`,
      );
    }
  }

  console.log(
    `[seed-transcripts:${file}] complete: ${insightsTotal} insights across ${transcriptIds.length} transcripts`,
  );
}

async function main() {
  const { file, firmId } = parseArgs();
  await seed(file, firmId);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
