// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Story 01.4 — end-to-end verification of the knowledge-feed consumer side.
 *
 * Exercises the REAL `applyBundle` + briefing scorer against a live DB,
 * inside a throwaway, fully-isolated test firm (created + cascade-deleted
 * here — never touches a real firm's rows). Proves, in order:
 *
 *   1. Apply writes targeting metadata (region / industries / category /
 *      publishedAt) so feed entries are actually targetable.
 *   2. Targeting: an industry+region-matched entry ranks ABOVE a general
 *      entry for a matching persona, and is DEMOTED (not dropped) for a
 *      non-matching persona. A general entry reaches everyone.
 *   3. Supersession: a foundational entry re-shipped under the same id is
 *      replaced in place (no duplicate).
 *   4. Expiry: an event dropped from a later bundle is pruned (snapshot).
 *   5. SECURITY: the calibration baseline (kind TEXT) is NEVER pruned,
 *      even by a bundle that omits it; an empty-knowledge bundle prunes
 *      nothing (guard against an accidental empty publish wiping the feed).
 *
 * Run:  pnpm -C apps/principe exec tsx scripts/verify-feed-apply.ts
 * (requires DATABASE_URL — uses the same client the app uses).
 */
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { applyBundle } from "@/lib/updates/apply";
import { loadEnabledSources, buildBriefingForAgent } from "@/lib/sources/briefing";
import type { BundleManifest } from "@/lib/updates/manifest";

type EntrySpec = {
  id: string;
  content: string;
  region?: string;
  industries?: string[];
  category?: string;
  publishedAt?: string;
};

function buildBundle(specs: EntrySpec[]): {
  manifest: BundleManifest;
  files: Map<string, Buffer>;
} {
  const files = new Map<string, Buffer>();
  const entries = specs.map((s) => {
    const path = `knowledge/${s.id}.md`;
    const bytes = Buffer.from(s.content, "utf8");
    files.set(path, bytes);
    return {
      type: "knowledge" as const,
      path,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      bytes: bytes.length,
      id: s.id,
      region: s.region,
      industries: s.industries,
      category: s.category,
      publishedAt: s.publishedAt,
    };
  });
  const manifest: BundleManifest = {
    manifestVersion: 1,
    version: "test",
    createdAt: new Date().toISOString(),
    bundleSha256: "0".repeat(64),
    bundleBytes: 0,
    bundlePath: "bundles/test.tar.gz",
    changelog: "verification fixture",
    entries,
  };
  return { manifest, files };
}

let passed = 0;
function check(label: string, cond: boolean) {
  if (!cond) throw new Error(`FAIL: ${label}`);
  passed += 1;
  console.log(`  ✓ ${label}`);
}

/** index of a feed row's rendered header ("<id> (date…)") in the briefing. */
function pos(briefing: string, id: string): number {
  return briefing.indexOf(`${id} (`);
}

async function main() {
  const slug = `feed-test-${createHash("sha256").update("verify-feed-apply").digest("hex").slice(0, 10)}`;
  // Clean any leftover from a previous aborted run.
  await prisma.firm.deleteMany({ where: { slug } });
  const firm = await prisma.firm.create({
    data: { name: "FEED VERIFY (throwaway)", slug },
  });
  const firmId = firm.id;
  console.log(`\ntest firm: ${firmId} (${slug})\n`);

  try {
    // A baseline row that must survive every prune — stands in for the
    // calibration baseline (kind TEXT, never kind BUNDLE).
    await prisma.knowledgeSource.create({
      data: {
        id: `baseline-${firmId}`,
        firmId,
        kind: "TEXT",
        title: "ISO 27001 baseline",
        content: "Baseline control catalogue — must never be pruned.",
      },
    });

    // ---- Phase 1: apply v1 ----
    console.log("Phase 1 — apply v1 (metadata + targeting)");
    const v1 = buildBundle([
      { id: "evt-a", content: "Healthcare ransomware wave hits providers.", region: "us", industries: ["healthcare"], category: "threat-intel", publishedAt: "2026-06-08T00:00:00Z" },
      { id: "evt-b", content: "ANZ privacy regulation tightens breach reporting.", region: "anz", category: "regulator", publishedAt: "2026-06-07T00:00:00Z" },
      { id: "found-xdr", content: "Analyst XDR landscape — v1 (reportDate 2026-01).", category: "analyst", publishedAt: "2026-01-15T00:00:00Z" },
      { id: "gen-g", content: "General CISO budget trends for the year.", category: "news", publishedAt: "2026-06-06T00:00:00Z" },
    ]);
    const r1 = await applyBundle(v1.manifest, v1.files, firmId);
    check("v1: 4 new", r1.knowledge.new === 4);
    check("v1: 0 removed", r1.knowledge.removed === 0);
    check("v1: 0 failed", r1.failed.length === 0);

    const a = await prisma.knowledgeSource.findUnique({ where: { id: "evt-a" } });
    check("evt-a region written", a?.region === "us");
    check("evt-a industries written", JSON.stringify(a?.applicableIndustries) === JSON.stringify(["healthcare"]));
    check("evt-a category written", a?.category === "threat-intel");
    check("evt-a publishedAt written", a?.publishedAt?.toISOString().startsWith("2026-06-08") === true);
    check("evt-a marked kind BUNDLE", a?.kind === "BUNDLE");

    // ---- Phase 2: targeting ----
    console.log("Phase 2 — targeting (rank up on match, demote-don't-drop)");
    const sources = await loadEnabledSources(firmId);
    const bHealth = buildBriefingForAgent(sources, { region: "us", industry: "healthcare" });
    if (process.env.DEBUG_BRIEFING) {
      console.log("--- healthcare briefing headers ---");
      console.log(bHealth.split("\n").filter((l) => /^—/.test(l)).join("\n"));
      console.log("evt-a@", pos(bHealth, "evt-a"), "gen-g@", pos(bHealth, "gen-g"));
    }
    check("healthcare/us persona ranks evt-a above general gen-g", pos(bHealth, "evt-a") < pos(bHealth, "gen-g") && pos(bHealth, "evt-a") >= 0);

    const bFin = buildBriefingForAgent(sources, { region: "anz", industry: "financial-services" });
    check("anz persona surfaces evt-b", pos(bFin, "evt-b") >= 0);
    check("non-matching persona DEMOTES evt-a below general (still present)", pos(bFin, "evt-a") > pos(bFin, "gen-g") && pos(bFin, "evt-a") >= 0);
    check("general gen-g reaches both personas", pos(bHealth, "gen-g") >= 0 && pos(bFin, "gen-g") >= 0);

    // ---- Phase 3: supersession + expiry (snapshot) ----
    console.log("Phase 3 — supersession + expiry");
    const v2 = buildBundle([
      { id: "evt-b", content: "ANZ privacy regulation tightens breach reporting.", region: "anz", category: "regulator", publishedAt: "2026-06-07T00:00:00Z" }, // unchanged → skipped
      { id: "found-xdr", content: "Analyst XDR landscape — v2 (reportDate 2026-06). SUPERSEDES.", category: "analyst", publishedAt: "2026-06-09T00:00:00Z" }, // same id, new content → updated
      { id: "evt-c", content: "New zero-day in widely used VPN appliance.", region: "us", category: "threat-intel", publishedAt: "2026-06-09T00:00:00Z" }, // new
      // evt-a OMITTED → must be pruned. gen-g OMITTED → must be pruned.
    ]);
    const r2 = await applyBundle(v2.manifest, v2.files, firmId);
    check("v2: evt-b skipped (unchanged)", r2.knowledge.skipped === 1);
    check("v2: found-xdr updated (superseded in place)", r2.knowledge.updated === 1);
    check("v2: evt-c new", r2.knowledge.new === 1);
    check("v2: evt-a + gen-g pruned (removed=2)", r2.knowledge.removed === 2);

    const foundRows = await prisma.knowledgeSource.findMany({ where: { id: "found-xdr" } });
    check("supersession: exactly one found-xdr row", foundRows.length === 1);
    check("supersession: content is v2", foundRows[0]?.content?.includes("v2") === true);
    check("expiry: evt-a gone", (await prisma.knowledgeSource.findUnique({ where: { id: "evt-a" } })) === null);
    check("evt-b still present", (await prisma.knowledgeSource.findUnique({ where: { id: "evt-b" } })) !== null);

    // ---- Phase 4: SECURITY — baseline survival + empty-bundle guard ----
    console.log("Phase 4 — baseline survival + empty-bundle guard");
    // A bundle that omits the baseline (and everything but evt-b): prune
    // must remove the absent FEED rows but never the TEXT baseline.
    const v3 = buildBundle([
      { id: "evt-b", content: "ANZ privacy regulation tightens breach reporting.", region: "anz", category: "regulator", publishedAt: "2026-06-07T00:00:00Z" },
    ]);
    const r3 = await applyBundle(v3.manifest, v3.files, firmId);
    check("v3: found-xdr + evt-c pruned (removed=2)", r3.knowledge.removed === 2);
    check("🔒 baseline (kind TEXT) survives a bundle that omits it", (await prisma.knowledgeSource.findUnique({ where: { id: `baseline-${firmId}` } })) !== null);

    // Empty-knowledge bundle: must prune NOTHING (guard).
    const empty = buildBundle([]);
    const r4 = await applyBundle(empty.manifest, empty.files, firmId);
    check("🔒 empty-knowledge bundle prunes nothing (removed=0)", r4.knowledge.removed === 0);
    check("🔒 evt-b survives empty bundle", (await prisma.knowledgeSource.findUnique({ where: { id: "evt-b" } })) !== null);
    check("🔒 baseline survives empty bundle", (await prisma.knowledgeSource.findUnique({ where: { id: `baseline-${firmId}` } })) !== null);

    console.log(`\n✅ ALL ${passed} CHECKS PASSED\n`);
  } finally {
    // Cascade-delete the throwaway firm and every row under it.
    await prisma.firm.delete({ where: { id: firmId } }).catch(() => {});
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : e}\n`);
  process.exitCode = 1;
});
