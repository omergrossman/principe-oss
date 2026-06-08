-- Sprint 5 — transcript-anchored personas.
--
-- 1. Transcript + TranscriptInsight tables for curated CISO talk content.
--    Distillation extracts a fan of typed insights per transcript that
--    route independently into the briefing builder.
-- 2. ProjectAgent gains depth fields populated when a Transcript
--    matching the persona's industry+region is ingested:
--      - originatingTranscriptIds: which transcripts shape this persona
--      - coreOpinions: extracted { topic, position } from those transcripts
--      - signatureVocabulary: key phrases the agent should reuse
--      - personaStale: true when an upstream insight was edited; admin
--        triggers explicit recompute via UI.

CREATE TYPE "DistillationStatus" AS ENUM ('PENDING', 'COMPLETE', 'FAILED');

CREATE TYPE "InsightKind" AS ENUM (
  'VENDOR_OPINION',
  'REGULATORY_TAKE',
  'INCIDENT_LESSON',
  'BUYING_BEHAVIOR',
  'TREND_CALL',
  'THREAT_TAKE',
  'FRAMEWORK_POSITION'
);

CREATE TYPE "InsightRoutingScope" AS ENUM ('UNIVERSAL', 'TARGETED');

CREATE TABLE "Transcript" (
  "id"                  TEXT PRIMARY KEY,
  "firmId"            TEXT NOT NULL,
  "speakerName"         TEXT NOT NULL,
  "speakerRole"         TEXT NOT NULL,
  "speakerIndustry"     TEXT NOT NULL,
  "speakerRegion"       TEXT NOT NULL,
  "speakerCompanySize"  TEXT NOT NULL,
  "sourceUrl"           TEXT,
  "sourceTitle"         TEXT NOT NULL,
  "rawTranscript"       TEXT NOT NULL,
  "distillationStatus"  "DistillationStatus" NOT NULL DEFAULT 'PENDING',
  "distillationError"   TEXT,
  "addedAt"             TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"           TIMESTAMP(3) NOT NULL,

  CONSTRAINT "Transcript_firmId_fkey"
    FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE
);

CREATE INDEX "Transcript_firmId_addedAt_idx"
  ON "Transcript"("firmId", "addedAt");

CREATE INDEX "Transcript_firmId_speakerIndustry_speakerRegion_idx"
  ON "Transcript"("firmId", "speakerIndustry", "speakerRegion");

CREATE TABLE "TranscriptInsight" (
  "id"                       TEXT PRIMARY KEY,
  "transcriptId"             TEXT NOT NULL,
  "insightText"              TEXT NOT NULL,
  "kind"                     "InsightKind" NOT NULL,
  "routingScope"             "InsightRoutingScope" NOT NULL,
  "applicableIndustries"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "applicableRegions"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "applicableFrameworks"     TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "applicableThreatTypes"    TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "vocabularyAnchors"        TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "enabled"                  BOOLEAN NOT NULL DEFAULT true,
  "createdAt"                TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"                TIMESTAMP(3) NOT NULL,

  CONSTRAINT "TranscriptInsight_transcriptId_fkey"
    FOREIGN KEY ("transcriptId") REFERENCES "Transcript"("id") ON DELETE CASCADE
);

CREATE INDEX "TranscriptInsight_transcriptId_enabled_idx"
  ON "TranscriptInsight"("transcriptId", "enabled");

CREATE INDEX "TranscriptInsight_routingScope_enabled_idx"
  ON "TranscriptInsight"("routingScope", "enabled");

CREATE INDEX "TranscriptInsight_kind_idx"
  ON "TranscriptInsight"("kind");

ALTER TABLE "ProjectAgent"
  ADD COLUMN "originatingTranscriptIds" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "coreOpinions"             JSONB  NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN "signatureVocabulary"      TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN "personaStale"             BOOLEAN NOT NULL DEFAULT false;
