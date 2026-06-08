-- Phase E follow-up — baseline KB sync link to DP master (2026-06-06).
-- Adds nullable baselineId + baselineRemovedAt to KnowledgeSource +
-- Transcript so the tenant-side sync library can match rows and
-- soft-disable on removal. Adds BaselineSyncState singleton. Adds
-- TEXT to KnowledgeSourceKind for plain-text snippets pushed from
-- DP master's /admin/baseline.

ALTER TYPE "KnowledgeSourceKind" ADD VALUE 'TEXT';

ALTER TABLE "KnowledgeSource"
  ADD COLUMN "baselineId" TEXT,
  ADD COLUMN "baselineRemovedAt" TIMESTAMP(3);

ALTER TABLE "Transcript"
  ADD COLUMN "baselineId" TEXT,
  ADD COLUMN "baselineRemovedAt" TIMESTAMP(3);

CREATE UNIQUE INDEX "KnowledgeSource_vcFirmId_baselineId_key"
  ON "KnowledgeSource"("vcFirmId", "baselineId");

CREATE UNIQUE INDEX "Transcript_vcFirmId_baselineId_key"
  ON "Transcript"("vcFirmId", "baselineId");

CREATE TABLE "BaselineSyncState" (
  "id"                  INTEGER NOT NULL DEFAULT 1,
  "lastAppliedVersion"  TIMESTAMP(3),
  "lastSyncAt"          TIMESTAMP(3),
  "lastSyncStatus"      TEXT,
  "syncCount"           INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "BaselineSyncState_pkey" PRIMARY KEY ("id")
);
