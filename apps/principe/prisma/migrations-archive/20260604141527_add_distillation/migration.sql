-- Sprint 2 Phase 1 — source distillation. One-shot LLM pass on upload
-- extracts a structured card (problem/solution/ICP for project sources;
-- tldr/findings for firm-wide). Briefing builder prefers the card; the
-- raw `content` column is kept as fallback.

ALTER TABLE "KnowledgeSource"
  ADD COLUMN "distilled"             JSONB,
  ADD COLUMN "distilledAt"           TIMESTAMP(3),
  ADD COLUMN "distilledContentHash"  TEXT;
