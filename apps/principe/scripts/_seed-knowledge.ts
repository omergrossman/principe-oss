// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Sprint 4 — knowledge-corpus seeders.
 *
 * Single multi-target script. Each target reads a snapshot JSON from
 * `~/principe/calibration/knowledge/` and idempotently upserts
 * KnowledgeSource rows for the firm specified by --firm-id. Distillation
 * is triggered fire-and-forget so cards generate in the background.
 *
 * Usage:
 *   tsx scripts/_seed-knowledge.ts --target=mitre --firm-id=<firmId>
 *   tsx scripts/_seed-knowledge.ts --target=nist-csf --firm-id=<firmId>
 *   tsx scripts/_seed-knowledge.ts --target=dora --firm-id=<firmId>
 *   tsx scripts/_seed-knowledge.ts --target=nis2 --firm-id=<firmId>
 *
 * Snapshot shape (each row in the JSON array):
 *   {
 *     "url": "https://attack.mitre.org/tactics/TA0001/",
 *     "title": "MITRE ATT&CK — Initial Access (TA0001)",
 *     "content": "<long text describing the tactic + techniques>",
 *     "applicableIndustries": [],
 *     "applicableFrameworks": ["MITRE ATT&CK"]
 *   }
 *
 * The seeder upserts by (firmId, url) — re-running is idempotent.
 * The actual content collection (fetching from MITRE / EUR-Lex / NIST)
 * is content work; the snapshots are committed under
 * `calibration/knowledge/<target>-snapshot.json` so seeding is
 * reproducible.
 */

import { config as loadDotenv } from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { readFile } from "node:fs/promises";

// Load .env.local from apps/principe/ so DATABASE_URL etc. are available
// when this script is invoked from any cwd via `pnpm tsx scripts/...`.
const __here = dirname(fileURLToPath(import.meta.url));
loadDotenv({ path: resolve(__here, "..", ".env.local") });

import { Prisma } from "@prisma/client";
import { prisma } from "../src/lib/db/prisma";
import { distillSource } from "../src/lib/sources/distill";

type Target =
  | "mitre"
  | "nist-csf"
  | "dora"
  | "nis2"
  | "kb-open-frameworks"
  | "kb-analyst-reports"
  | "kb-pitch-decks";

type LicensePosture =
  | "OPEN"
  | "PUBLIC_PAGE"
  | "LICENSED_REPORT"
  | "VENDOR_REPRINT";

interface SeedRow {
  url: string;
  title: string;
  content: string;
  category?: string;
  applicableIndustries?: string[];
  applicableFrameworks?: string[];
  region?: string;
  licensePosture?: LicensePosture;
  richMetadata?: Record<string, unknown>;
}

const TARGET_META: Record<
  Target,
  {
    category: string;
    snapshotFile: string;
    defaultFrameworks: string[];
    defaultRegion: string;
    // Pitch-deck references are short, already-structured descriptions —
    // distillation would burn cost without adding signal. Skip for them.
    skipDistillation?: boolean;
  }
> = {
  mitre: {
    category: "framework",
    snapshotFile: "mitre-attack-snapshot.json",
    defaultFrameworks: ["MITRE ATT&CK"],
    defaultRegion: "global",
  },
  "nist-csf": {
    category: "framework",
    snapshotFile: "nist-csf-snapshot.json",
    defaultFrameworks: ["NIST CSF v2"],
    defaultRegion: "global",
  },
  dora: {
    category: "regulator",
    snapshotFile: "dora-snapshot.json",
    defaultFrameworks: ["DORA"],
    defaultRegion: "eu-west",
  },
  nis2: {
    category: "regulator",
    snapshotFile: "nis2-snapshot.json",
    defaultFrameworks: ["NIS2"],
    defaultRegion: "eu-west",
  },
  "kb-open-frameworks": {
    category: "framework",
    snapshotFile: "kb-open-frameworks-snapshot.json",
    defaultFrameworks: [],
    defaultRegion: "global",
  },
  "kb-analyst-reports": {
    category: "analyst",
    snapshotFile: "kb-analyst-reports-snapshot.json",
    defaultFrameworks: [],
    defaultRegion: "global",
  },
  "kb-pitch-decks": {
    category: "pitch_deck_reference",
    snapshotFile: "kb-pitch-decks-snapshot.json",
    defaultFrameworks: [],
    defaultRegion: "global",
    skipDistillation: true,
  },
};

function parseArgs(): { target: Target; firmId: string } {
  const args = new Map<string, string>();
  for (const a of process.argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) args.set(m[1], m[2]);
  }
  const target = args.get("target") as Target | undefined;
  const firmId = args.get("firm-id");
  if (!target || !TARGET_META[target]) {
    throw new Error(
      `--target required, one of: ${Object.keys(TARGET_META).join(", ")}`,
    );
  }
  if (!firmId) throw new Error("--firm-id required");
  return { target, firmId };
}

async function loadSnapshot(target: Target): Promise<SeedRow[]> {
  const meta = TARGET_META[target];
  const path = resolve(
    process.cwd(),
    "..",
    "..",
    "calibration",
    "knowledge",
    meta.snapshotFile,
  );
  const raw = await readFile(path, "utf-8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error(`${meta.snapshotFile}: expected an array of seed rows`);
  }
  return parsed as SeedRow[];
}

async function seed(target: Target, firmId: string): Promise<void> {
  const meta = TARGET_META[target];
  const rows = await loadSnapshot(target);
  console.log(
    `[seed-${target}] loading ${rows.length} rows for firm ${firmId} from ${meta.snapshotFile}`,
  );

  let created = 0;
  let updated = 0;
  const idsToDistill: string[] = [];

  for (const row of rows) {
    if (!row.url || !row.title || !row.content) {
      console.warn(`[seed-${target}] skipping row missing url/title/content`);
      continue;
    }
    const existing = await prisma.knowledgeSource.findFirst({
      where: { firmId: firmId, url: row.url },
      select: { id: true },
    });
    const applicableFrameworks =
      row.applicableFrameworks ?? meta.defaultFrameworks;
    const applicableIndustries = row.applicableIndustries ?? [];
    const region = row.region ?? meta.defaultRegion;

    const category = row.category ?? meta.category;
    const licensePosture = row.licensePosture ?? "OPEN";
    const richMetadata = row.richMetadata
      ? (row.richMetadata as unknown as Prisma.InputJsonValue)
      : Prisma.JsonNull;

    if (existing) {
      await prisma.knowledgeSource.update({
        where: { id: existing.id },
        data: {
          title: row.title,
          content: row.content,
          contentHash: simpleHash(row.content),
          category,
          region,
          applicableFrameworks:
            applicableFrameworks as unknown as Prisma.InputJsonValue,
          applicableIndustries:
            applicableIndustries as unknown as Prisma.InputJsonValue,
          licensePosture,
          richMetadata,
        },
      });
      updated += 1;
      idsToDistill.push(existing.id);
    } else {
      const source = await prisma.knowledgeSource.create({
        data: {
          firmId: firmId,
          kind: "URL",
          url: row.url,
          title: row.title,
          content: row.content,
          contentHash: simpleHash(row.content),
          category,
          region,
          applicableFrameworks:
            applicableFrameworks as unknown as Prisma.InputJsonValue,
          applicableIndustries:
            applicableIndustries as unknown as Prisma.InputJsonValue,
          licensePosture,
          richMetadata,
          isCurated: true,
          enabled: true,
          lastFetchedAt: new Date(),
          fetchEnabled: false, // snapshot-backed; no refetch loop
        },
      });
      created += 1;
      idsToDistill.push(source.id);
    }
  }

  console.log(`[seed-${target}] upserted: created=${created} updated=${updated}`);

  if (meta.skipDistillation) {
    console.log(
      `[seed-${target}] skipping distillation (target opts out — content is already short + structured)`,
    );
    return;
  }

  // Distill AWAITED, not fire-and-forget. The seeder is a short-lived
  // script; detached promises would be cut off when Node exits. We pace
  // sequentially so the Anthropic-side rate-limit gate doesn't kick in.
  if (idsToDistill.length > 0) {
    console.log(
      `[seed-${target}] distilling ${idsToDistill.length} sources (sequential, ~5-15s each)…`,
    );
    let done = 0;
    for (const id of idsToDistill) {
      try {
        const result = await distillSource({ sourceId: id });
        done += 1;
        const tag =
          result.ok && result.skipped
            ? `skipped:${result.skipped}`
            : result.ok
              ? "ok"
              : `error:${result.error?.slice(0, 60)}`;
        console.log(`[seed-${target}] [${done}/${idsToDistill.length}] ${id} → ${tag}`);
      } catch (e) {
        const msg = e instanceof Error ? e.message.slice(0, 100) : String(e);
        console.warn(`[seed-${target}] [${done + 1}/${idsToDistill.length}] ${id} → throw: ${msg}`);
      }
    }
    console.log(`[seed-${target}] distillation complete`);
  }
}

function simpleHash(s: string): string {
  // Tiny hash for content-change detection. Not crypto-strong; sufficient
  // for "did the snapshot change" comparisons.
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return `seed:${(h >>> 0).toString(16)}`;
}

async function main() {
  const { target, firmId } = parseArgs();
  await seed(target, firmId);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
