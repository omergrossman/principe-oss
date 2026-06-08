-- Persona memory across asks (Sprint 9.1, 2026-06-08)
--
-- Adds askHistory JSON column on ProjectAgent. Populated after every
-- /api/ask save with a compact record (askId, question, verdict,
-- headline, askedAt). Capped at the most recent 10 entries by the
-- persistence helper (lib/ciso-panel/ask-history.ts).
--
-- Injected into the runtime persona prompt as a "Your recent panel
-- positions" section so the persona reads its own prior positions
-- before answering a new question — enabling consistency across
-- questions AND deliberate evolution when new evidence justifies it.

ALTER TABLE "ProjectAgent"
  ADD COLUMN "askHistory" JSON NOT NULL DEFAULT '[]';
