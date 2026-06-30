-- AlterTable
ALTER TABLE "ProjectAgent" ALTER COLUMN "askHistory" SET DATA TYPE JSONB;

-- AlterTable
ALTER TABLE "ProjectAsk" ADD COLUMN     "trendContext" JSONB;
