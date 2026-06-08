-- Sprint 4 — knowledge-moat schema additions.
--
-- 1. KnowledgeSourceKind.VENDOR_CARD: handcrafted admin uploads (vendor
--    metadata) that don't have a URL or file backing.
-- 2. KnowledgeSource.applicableIndustries: per-source tag list driving
--    +4 industry-match scoring in the briefing builder.
-- 3. KnowledgeSource.applicableFrameworks: per-source tag list driving
--    +3 framework-fit scoring per persona's industry-typical set.

ALTER TYPE "KnowledgeSourceKind" ADD VALUE 'VENDOR_CARD';

ALTER TABLE "KnowledgeSource"
  ADD COLUMN "applicableIndustries" JSONB,
  ADD COLUMN "applicableFrameworks" JSONB;
