-- Sprint 6 — drop ProjectAsk share columns + share UI.
--
-- The Share-link flow (generate token → public read-only viewer at
-- /shared/<token>) was removed as part of the "simplify pages and
-- functionalities" pass. The columns are dead: the API route, the
-- public viewer page, and the ShareButton UI were all deleted in the
-- same commit.
--
-- Applied via `prisma db push` per the established baseline-gap pattern.

DROP INDEX IF EXISTS "ProjectAsk_shareToken_key";
DROP INDEX IF EXISTS "ProjectAsk_shareToken_idx";
ALTER TABLE "ProjectAsk" DROP COLUMN IF EXISTS "shareToken";
ALTER TABLE "ProjectAsk" DROP COLUMN IF EXISTS "sharedScope";
