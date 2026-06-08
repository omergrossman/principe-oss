-- CreateEnum
CREATE TYPE "KnowledgeSourceKind" AS ENUM ('URL', 'FILE');

-- CreateTable
CREATE TABLE "KnowledgeSource" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "kind" "KnowledgeSourceKind" NOT NULL,
    "url" TEXT,
    "filename" TEXT,
    "mimeType" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "region" TEXT,
    "isCurated" BOOLEAN NOT NULL DEFAULT false,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "content" TEXT,
    "contentHash" TEXT,
    "publishedAt" TIMESTAMP(3),
    "lastFetchedAt" TIMESTAMP(3),
    "lastFetchError" TEXT,
    "fetchEnabled" BOOLEAN NOT NULL DEFAULT true,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "KnowledgeSource_firmId_enabled_idx" ON "KnowledgeSource"("firmId", "enabled");

-- CreateIndex
CREATE INDEX "KnowledgeSource_firmId_isCurated_idx" ON "KnowledgeSource"("firmId", "isCurated");

-- CreateIndex
CREATE INDEX "KnowledgeSource_publishedAt_idx" ON "KnowledgeSource"("publishedAt");

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeSource_firmId_url_key" ON "KnowledgeSource"("firmId", "url");

-- AddForeignKey
ALTER TABLE "KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;
