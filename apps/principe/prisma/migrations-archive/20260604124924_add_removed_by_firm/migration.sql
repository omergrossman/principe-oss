-- Soft-delete flag for knowledge sources. Curated sources need this
-- because the seeder would otherwise resurrect them on every page load.
-- For user sources we still hard-delete; this flag only matters when
-- the row sticks around to block the seeder.
ALTER TABLE "KnowledgeSource"
  ADD COLUMN "removedByFirm" BOOLEAN NOT NULL DEFAULT false;
