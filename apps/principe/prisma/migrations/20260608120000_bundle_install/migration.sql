-- Bundle install ledger + BUNDLE kind for KnowledgeSource (Sprint 9)
--
-- Records each knowledge-bundle install: which version landed, the
-- bundle's SHA-256, where it came from, and what changed. Used by
-- /api/updates/check to compute "you're on X, latest is Y" and by
-- the audit trail when verifying that an install actually happened.

CREATE TABLE "BundleInstall" (
  "id"           TEXT NOT NULL,
  "version"      TEXT NOT NULL,
  "sha256"       TEXT NOT NULL,
  "source"       TEXT NOT NULL,
  "diffSummary"  JSON NOT NULL,
  "installedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "BundleInstall_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "BundleInstall_version_key" ON "BundleInstall"("version");
CREATE INDEX "BundleInstall_installedAt_idx" ON "BundleInstall"("installedAt");

-- Extend KnowledgeSourceKind with BUNDLE so bundle-delivered entries
-- can be distinguished from URL/FILE/VENDOR_CARD/TEXT entries in
-- queries + admin UI.
ALTER TYPE "KnowledgeSourceKind" ADD VALUE 'BUNDLE';
