-- Sprint 3 — Cycle lifecycle schema reshape.
--
-- 1. Drop Cycle.portcoId — V1 architecture has no portco. Ownership is
--    now via Cycle.createdById; project linkage flows through hypothesisId.
-- 2. Add Cycle.validationId (unique, nullable, FK SetNull) so we can
--    return 409 + existing cycleId on idempotent re-create POSTs.
-- 3. Add exec-summary columns populated by synthesize() after the run
--    completes: summaryText, topPros, topCons, insights.

ALTER TABLE "Cycle"
  DROP CONSTRAINT IF EXISTS "Cycle_portcoId_fkey";
DROP INDEX IF EXISTS "Cycle_portcoId_status_createdAt_idx";
ALTER TABLE "Cycle"
  DROP COLUMN "portcoId";

ALTER TABLE "Cycle"
  ADD COLUMN "validationId" TEXT,
  ADD COLUMN "summaryText"  TEXT,
  ADD COLUMN "topPros"      JSONB,
  ADD COLUMN "topCons"      JSONB,
  ADD COLUMN "insights"     JSONB;

CREATE UNIQUE INDEX "Cycle_validationId_key" ON "Cycle"("validationId");

ALTER TABLE "Cycle"
  ADD CONSTRAINT "Cycle_validationId_fkey"
    FOREIGN KEY ("validationId") REFERENCES "HypothesisValidation"("id")
    ON DELETE SET NULL;

CREATE INDEX "Cycle_createdById_status_createdAt_idx"
  ON "Cycle"("createdById", "status", "createdAt");
