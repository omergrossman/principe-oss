-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "ownerUserId" TEXT;

-- CreateIndex
CREATE INDEX "Project_vcFirmId_ownerUserId_status_idx" ON "Project"("vcFirmId", "ownerUserId", "status");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Backfill: assign every existing project to the first VC_ADMIN of its
-- firm. Phase E (2026-06-06) — multi-user organisations. Legacy rows
-- predate per-user ownership; the bootstrap admin inherits them so the
-- admin's project list is unchanged after the migration.
UPDATE "Project" p
SET "ownerUserId" = sub.user_id
FROM (
  SELECT DISTINCT ON (m."vcFirmId") m."vcFirmId" AS firm_id, m."userId" AS user_id
  FROM "Membership" m
  WHERE m.role = 'VC_ADMIN' AND m."vcFirmId" IS NOT NULL
  ORDER BY m."vcFirmId", m."createdAt" ASC
) sub
WHERE p."vcFirmId" = sub.firm_id AND p."ownerUserId" IS NULL;
