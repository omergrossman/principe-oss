-- In-app "What's New" news center.

-- Per-user unread high-water mark.
ALTER TABLE "User" ADD COLUMN "lastNewsSeenAt" TIMESTAMP(3);

-- News-feed consent (manual/automatic), default automatic. Also flip the
-- knowledge-update default to automatic and bring the existing workspace
-- in line with the new "automatic by default" stance.
ALTER TABLE "VCFirm" ADD COLUMN "autoNews" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "VCFirm" ADD COLUMN "newsVersion" TEXT;
ALTER TABLE "VCFirm" ALTER COLUMN "autoUpdate" SET DEFAULT true;
UPDATE "VCFirm" SET "autoUpdate" = true;

-- News items (snapshot of the signed feed). Global, not firm-scoped.
CREATE TABLE "NewsItem" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "tag" TEXT NOT NULL,
    "channel" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "summary" TEXT,
    "body" TEXT NOT NULL,
    "link" TEXT,
    "kind" TEXT,
    "expiresAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NewsItem_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "NewsItem_date_idx" ON "NewsItem"("date");
