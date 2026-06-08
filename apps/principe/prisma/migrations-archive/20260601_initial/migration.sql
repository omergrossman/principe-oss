
-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "WorkspaceRole" AS ENUM ('VC_ADMIN', 'PORTCO_FOUNDER', 'PRINCIPE_ADMIN');

-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED', 'PURGED');

-- CreateEnum
CREATE TYPE "HypothesisMode" AS ENUM ('TEST', 'DISCOVERY');

-- CreateEnum
CREATE TYPE "CycleStatus" AS ENUM ('DRAFT', 'VALIDATING', 'QUEUED', 'RUNNING', 'COMPLETE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "VerdictKind" AS ENUM ('PASS', 'WARN', 'FAIL', 'DIRECTIONAL');

-- CreateEnum
CREATE TYPE "SentimentLabel" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "AuditActorType" AS ENUM ('USER', 'STRIPE_WEBHOOK', 'SYSTEM', 'CRON', 'API');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSignInAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "deviceType" TEXT,
    "backedUp" BOOLEAN NOT NULL DEFAULT false,
    "nickname" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastUsedAt" TIMESTAMP(3),

    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Firm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "region" TEXT NOT NULL DEFAULT 'us',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "purgeScheduledAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Firm_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Portco" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "purgeScheduledAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firmId" TEXT,
    "portcoId" TEXT,
    "role" "WorkspaceRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "portcoId" TEXT,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "invitedById" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hypothesis" (
    "id" TEXT NOT NULL,
    "portcoId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "mode" "HypothesisMode" NOT NULL,
    "content" TEXT NOT NULL,
    "draftSavedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Cycle" (
    "id" TEXT NOT NULL,
    "portcoId" TEXT NOT NULL,
    "hypothesisId" TEXT NOT NULL,
    "panelVersion" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "parentCycleId" TEXT,
    "status" "CycleStatus" NOT NULL DEFAULT 'DRAFT',
    "totalPersonas" INTEGER NOT NULL DEFAULT 30,
    "llmCostUsd" DECIMAL(10,4),
    "durationSec" INTEGER,
    "completedAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StatisticianVerdict" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "kind" "VerdictKind" NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "klDivergence" DOUBLE PRECISION,
    "bciLow" DOUBLE PRECISION,
    "bciHigh" DOUBLE PRECISION,
    "reasoning" JSONB NOT NULL,
    "forceOverridden" BOOLEAN NOT NULL DEFAULT false,
    "forceOverrideUserId" TEXT,
    "forceOverrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "StatisticianVerdict_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SyntheticTranscript" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "personaKey" TEXT NOT NULL,
    "personaName" TEXT NOT NULL,
    "personaRegion" TEXT NOT NULL,
    "paragraphs" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "themeIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "rawResponse" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SyntheticTranscript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ThemeCluster" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "frequency" INTEGER NOT NULL,
    "sentiment" "SentimentLabel" NOT NULL,
    "posCount" INTEGER NOT NULL DEFAULT 0,
    "neuCount" INTEGER NOT NULL DEFAULT 0,
    "negCount" INTEGER NOT NULL DEFAULT 0,
    "strataAttribution" JSONB NOT NULL,
    "quotes" JSONB NOT NULL,
    "isObjection" BOOLEAN NOT NULL DEFAULT false,
    "isEndorsement" BOOLEAN NOT NULL DEFAULT false,
    "isSurprise" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ThemeCluster_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PanelConfiguration" (
    "id" TEXT NOT NULL,
    "portcoId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PanelConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CISOPanel" (
    "id" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "diversitySpec" JSONB NOT NULL,
    "populationFrame" TEXT NOT NULL,
    "defaultPanelSize" INTEGER NOT NULL DEFAULT 30,
    "maxPanelSize" INTEGER NOT NULL DEFAULT 50,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CISOPanel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PersonaDefinition" (
    "id" TEXT NOT NULL,
    "panelId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "companySize" TEXT NOT NULL,
    "tenure" TEXT NOT NULL,
    "background" TEXT,
    "reportsTo" TEXT,
    "budget" TEXT,
    "markdown" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PersonaDefinition_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CalibrationDataset" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "publisher" TEXT NOT NULL,
    "year" INTEGER NOT NULL,
    "publicationDate" TIMESTAMP(3),
    "sampleSize" INTEGER NOT NULL,
    "regionCoverage" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "licenseStatus" TEXT NOT NULL,
    "methodologyNotes" TEXT,
    "distributions" JSONB NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CalibrationDataset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BacktestResult" (
    "id" TEXT NOT NULL,
    "datasetId" TEXT NOT NULL,
    "panelVersion" TEXT NOT NULL,
    "questionCategory" TEXT NOT NULL,
    "correlation" DOUBLE PRECISION,
    "klDivergence" DOUBLE PRECISION,
    "passed" BOOLEAN NOT NULL,
    "notes" TEXT,
    "ranAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BacktestResult_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "portcoId" TEXT,
    "actorType" "AuditActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TenantLifecycleAuditLog" (
    "id" TEXT NOT NULL,
    "firmId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantLifecycleAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProcessedStripeEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "firmId" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedStripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Passkey_credentialId_key" ON "Passkey"("credentialId");

-- CreateIndex
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Firm_slug_key" ON "Firm"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Firm_stripeCustomerId_key" ON "Firm"("stripeCustomerId");

-- CreateIndex
CREATE INDEX "Firm_status_purgeScheduledAt_idx" ON "Firm"("status", "purgeScheduledAt");

-- CreateIndex
CREATE INDEX "Firm_region_idx" ON "Firm"("region");

-- CreateIndex
CREATE INDEX "Portco_firmId_status_idx" ON "Portco"("firmId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Portco_firmId_slug_key" ON "Portco"("firmId", "slug");

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "Membership"("userId");

-- CreateIndex
CREATE INDEX "Membership_firmId_idx" ON "Membership"("firmId");

-- CreateIndex
CREATE INDEX "Membership_portcoId_idx" ON "Membership"("portcoId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_firmId_portcoId_key" ON "Membership"("userId", "firmId", "portcoId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_token_idx" ON "Invitation"("token");

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "Invitation"("email");

-- CreateIndex
CREATE INDEX "Invitation_firmId_acceptedAt_idx" ON "Invitation"("firmId", "acceptedAt");

-- CreateIndex
CREATE INDEX "Hypothesis_portcoId_updatedAt_idx" ON "Hypothesis"("portcoId", "updatedAt");

-- CreateIndex
CREATE INDEX "Hypothesis_createdById_idx" ON "Hypothesis"("createdById");

-- CreateIndex
CREATE INDEX "Cycle_portcoId_status_createdAt_idx" ON "Cycle"("portcoId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "Cycle_hypothesisId_idx" ON "Cycle"("hypothesisId");

-- CreateIndex
CREATE INDEX "Cycle_parentCycleId_idx" ON "Cycle"("parentCycleId");

-- CreateIndex
CREATE UNIQUE INDEX "StatisticianVerdict_cycleId_key" ON "StatisticianVerdict"("cycleId");

-- CreateIndex
CREATE INDEX "StatisticianVerdict_kind_idx" ON "StatisticianVerdict"("kind");

-- CreateIndex
CREATE INDEX "SyntheticTranscript_cycleId_idx" ON "SyntheticTranscript"("cycleId");

-- CreateIndex
CREATE INDEX "SyntheticTranscript_cycleId_personaRegion_idx" ON "SyntheticTranscript"("cycleId", "personaRegion");

-- CreateIndex
CREATE INDEX "ThemeCluster_cycleId_frequency_idx" ON "ThemeCluster"("cycleId", "frequency");

-- CreateIndex
CREATE UNIQUE INDEX "PanelConfiguration_portcoId_name_key" ON "PanelConfiguration"("portcoId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "CISOPanel_version_key" ON "CISOPanel"("version");

-- CreateIndex
CREATE INDEX "CISOPanel_isActive_idx" ON "CISOPanel"("isActive");

-- CreateIndex
CREATE INDEX "PersonaDefinition_panelId_idx" ON "PersonaDefinition"("panelId");

-- CreateIndex
CREATE UNIQUE INDEX "PersonaDefinition_panelId_key_key" ON "PersonaDefinition"("panelId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "CalibrationDataset_datasetId_key" ON "CalibrationDataset"("datasetId");

-- CreateIndex
CREATE INDEX "CalibrationDataset_publisher_year_idx" ON "CalibrationDataset"("publisher", "year");

-- CreateIndex
CREATE INDEX "BacktestResult_datasetId_panelVersion_idx" ON "BacktestResult"("datasetId", "panelVersion");

-- CreateIndex
CREATE INDEX "BacktestResult_panelVersion_passed_idx" ON "BacktestResult"("panelVersion", "passed");

-- CreateIndex
CREATE INDEX "AuditLog_portcoId_createdAt_idx" ON "AuditLog"("portcoId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "AuditLog"("action", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "TenantLifecycleAuditLog_firmId_createdAt_idx" ON "TenantLifecycleAuditLog"("firmId", "createdAt");

-- CreateIndex
CREATE INDEX "TenantLifecycleAuditLog_eventType_createdAt_idx" ON "TenantLifecycleAuditLog"("eventType", "createdAt");

-- CreateIndex
CREATE INDEX "TenantLifecycleAuditLog_createdAt_idx" ON "TenantLifecycleAuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "ProcessedStripeEvent_processedAt_idx" ON "ProcessedStripeEvent"("processedAt");

-- AddForeignKey
ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Portco" ADD CONSTRAINT "Portco_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_portcoId_fkey" FOREIGN KEY ("portcoId") REFERENCES "Portco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Hypothesis" ADD CONSTRAINT "Hypothesis_portcoId_fkey" FOREIGN KEY ("portcoId") REFERENCES "Portco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_portcoId_fkey" FOREIGN KEY ("portcoId") REFERENCES "Portco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "Hypothesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Cycle" ADD CONSTRAINT "Cycle_parentCycleId_fkey" FOREIGN KEY ("parentCycleId") REFERENCES "Cycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StatisticianVerdict" ADD CONSTRAINT "StatisticianVerdict_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyntheticTranscript" ADD CONSTRAINT "SyntheticTranscript_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ThemeCluster" ADD CONSTRAINT "ThemeCluster_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PanelConfiguration" ADD CONSTRAINT "PanelConfiguration_portcoId_fkey" FOREIGN KEY ("portcoId") REFERENCES "Portco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PersonaDefinition" ADD CONSTRAINT "PersonaDefinition_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "CISOPanel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BacktestResult" ADD CONSTRAINT "BacktestResult_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "CalibrationDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_portcoId_fkey" FOREIGN KEY ("portcoId") REFERENCES "Portco"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TenantLifecycleAuditLog" ADD CONSTRAINT "TenantLifecycleAuditLog_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProcessedStripeEvent" ADD CONSTRAINT "ProcessedStripeEvent_firmId_fkey" FOREIGN KEY ("firmId") REFERENCES "Firm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

