-- Sprint 5 KB expansion — license-aware resource metadata.
--
-- 1. LicensePosture enum gates how source text can be handled.
--    OPEN = public-domain/open-licensed (full content stored).
--    LICENSED_REPORT = paid analyst content (NO source text; only our
--    own summary in `content` and `distilled`). Briefing renderer
--    treats LICENSED_REPORT sources as attribution-only references.
-- 2. richMetadata holds the structured KB schema: source_org,
--    primary_domain, key_concepts, control_or_capability_taxonomy,
--    representative_vendors, threats_or_risks, defensive_controls,
--    and cross-framework mappings (ATTACK/D3FEND/NIST/OWASP/CSA).
--
-- This migration was applied via `prisma db push` because the migration
-- history has a known pre-existing gap (ProjectAgent and other tables
-- were created via early db push without a corresponding CREATE TABLE
-- migration, which breaks shadow-DB validation on every subsequent
-- `prisma migrate dev`). Baseline reconciliation is a follow-up item.

CREATE TYPE "LicensePosture" AS ENUM (
  'OPEN',
  'PUBLIC_PAGE',
  'LICENSED_REPORT',
  'VENDOR_REPRINT'
);

ALTER TABLE "KnowledgeSource"
  ADD COLUMN "licensePosture" "LicensePosture" NOT NULL DEFAULT 'OPEN',
  ADD COLUMN "richMetadata"   JSONB;
