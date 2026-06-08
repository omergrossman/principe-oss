-- Drop dead SaaS / baseline-sync debris left over from the donor repo.
-- All four targets have ZERO code references and the tables are empty
-- (verified before writing this migration). IF EXISTS keeps it idempotent.
--
--   * VCFirm.stripeCustomerId / stripeSubscriptionId  — billing, never used in OSS
--   * ProcessedStripeEvent                            — Stripe webhook dedupe ledger
--   * BaselineSyncState                               — DP-master baseline-sync state
--
-- NOTE: the Cycle / Hypothesis / HypothesisValidation models are deliberately
-- NOT dropped — they are LIVE (the /validations force-override feature uses
-- them), contrary to the initial audit's assumption.

ALTER TABLE "VCFirm" DROP COLUMN IF EXISTS "stripeCustomerId";
ALTER TABLE "VCFirm" DROP COLUMN IF EXISTS "stripeSubscriptionId";
DROP TABLE IF EXISTS "ProcessedStripeEvent";
DROP TABLE IF EXISTS "BaselineSyncState";
