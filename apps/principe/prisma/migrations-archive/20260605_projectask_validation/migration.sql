-- Sprint 5.5 — hybrid statistical validation on every ProjectAsk.
--
-- Runs synchronously after the panel completes (1-3s, negligible
-- vs the 3-4min panel run). Stores PASS/WARN/FAIL + reasoning trace.
-- UI surfaces a warning badge only when verdict != PASS.
--
-- Applied via `prisma db push` (same baseline-gap reason documented
-- in 20260605_kb_resource_metadata).

ALTER TABLE "ProjectAsk"
  ADD COLUMN "validation" JSONB;
