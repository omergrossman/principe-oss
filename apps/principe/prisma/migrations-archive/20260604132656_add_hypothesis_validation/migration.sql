-- Sprint 2 — pre-cycle Statistician verdicts. The Cycle table still
-- requires portcoId (Sprint 1 schema, dead path in V1); reshape pending
-- in Sprint 3 when EP-06 wires Run end-to-end. Until then, Validate-time
-- verdicts attach to the Hypothesis, not the Cycle.

CREATE TABLE "HypothesisValidation" (
  "id"                  TEXT PRIMARY KEY,
  "hypothesisId"        TEXT NOT NULL,
  "createdById"         TEXT NOT NULL,
  "kind"                "VerdictKind" NOT NULL,
  "confidenceScore"     INTEGER NOT NULL,
  "klDivergence"        DOUBLE PRECISION,
  "bciLow"              DOUBLE PRECISION,
  "bciHigh"             DOUBLE PRECISION,
  "recommendedN"        INTEGER,
  "reasoning"           JSONB NOT NULL,
  "stubMode"            BOOLEAN NOT NULL DEFAULT true,
  "serviceVersion"      TEXT,
  "forceOverridden"     BOOLEAN NOT NULL DEFAULT false,
  "forceOverrideReason" TEXT,
  "createdAt"           TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "HypothesisValidation_hypothesisId_fkey"
    FOREIGN KEY ("hypothesisId") REFERENCES "Hypothesis"("id") ON DELETE CASCADE
);

CREATE INDEX "HypothesisValidation_hypothesisId_createdAt_idx"
  ON "HypothesisValidation"("hypothesisId", "createdAt");

CREATE INDEX "HypothesisValidation_kind_idx"
  ON "HypothesisValidation"("kind");
