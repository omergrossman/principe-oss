-- Drop trial-related fields from VCFirm (Sprint 8 OSS migration, 2026-06-08)
--
-- Trial counter + isTrial flag were SaaS funnel mechanics: DP master would
-- seed a tenant with INSTANCE_IS_TRIAL=true, every successful /api/ask
-- decremented trialQuestionsRemaining, and reaching 0 returned 402 to gate
-- a paid conversion. None of that applies to the OSS self-hosted distribution
-- (free, no funnel, BYO Anthropic key = user's own LLM spend is the only cost).

DROP INDEX IF EXISTS "VCFirm_isTrial_trialQuestionsRemaining_idx";

ALTER TABLE "VCFirm"
  DROP COLUMN IF EXISTS "isTrial",
  DROP COLUMN IF EXISTS "trialQuestionsRemaining";
