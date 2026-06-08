-- Trial state on Firm (2026-06-07)
-- Seeded by DP master at provision time when the customer came in
-- through the marketing-site free-trial form. trialQuestionsRemaining
-- decrements on every successful /api/ask; reaching 0 returns 402.

ALTER TABLE "VCFirm"
  ADD COLUMN "isTrial"                  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN "trialQuestionsRemaining"  INTEGER;

CREATE INDEX "VCFirm_isTrial_trialQuestionsRemaining_idx"
  ON "VCFirm"("isTrial", "trialQuestionsRemaining");
