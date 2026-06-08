-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."AuditActorType" AS ENUM ('USER', 'STRIPE_WEBHOOK', 'SYSTEM', 'CRON', 'API');

-- CreateEnum
CREATE TYPE "public"."CycleStatus" AS ENUM ('DRAFT', 'VALIDATING', 'QUEUED', 'RUNNING', 'COMPLETE', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "public"."DistillationStatus" AS ENUM ('PENDING', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "public"."HypothesisMode" AS ENUM ('TEST', 'DISCOVERY');

-- CreateEnum
CREATE TYPE "public"."InsightKind" AS ENUM ('VENDOR_OPINION', 'REGULATORY_TAKE', 'INCIDENT_LESSON', 'BUYING_BEHAVIOR', 'TREND_CALL', 'THREAT_TAKE', 'FRAMEWORK_POSITION');

-- CreateEnum
CREATE TYPE "public"."InsightRoutingScope" AS ENUM ('UNIVERSAL', 'TARGETED');

-- CreateEnum
CREATE TYPE "public"."KnowledgeSourceKind" AS ENUM ('URL', 'FILE', 'VENDOR_CARD');

-- CreateEnum
CREATE TYPE "public"."LicensePosture" AS ENUM ('OPEN', 'PUBLIC_PAGE', 'LICENSED_REPORT', 'VENDOR_REPRINT');

-- CreateEnum
CREATE TYPE "public"."ProjectStatus" AS ENUM ('ACTIVE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."SentimentLabel" AS ENUM ('POSITIVE', 'NEUTRAL', 'NEGATIVE');

-- CreateEnum
CREATE TYPE "public"."TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'ARCHIVED', 'PURGED');

-- CreateEnum
CREATE TYPE "public"."VerdictKind" AS ENUM ('PASS', 'WARN', 'FAIL', 'DIRECTIONAL');

-- CreateEnum
CREATE TYPE "public"."WorkspaceRole" AS ENUM ('VC_ADMIN', 'PORTCO_FOUNDER', 'PRINCIPE_ADMIN');

-- CreateTable
CREATE TABLE "public"."AuditLog" (
    "id" TEXT NOT NULL,
    "portcoId" TEXT,
    "actorType" "public"."AuditActorType" NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "resourceType" TEXT,
    "resourceId" TEXT,
    "metadata" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."BacktestResult" (
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
CREATE TABLE "public"."CISOPanel" (
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
CREATE TABLE "public"."CalibrationDataset" (
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
CREATE TABLE "public"."Cycle" (
    "id" TEXT NOT NULL,
    "hypothesisId" TEXT NOT NULL,
    "panelVersion" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "parentCycleId" TEXT,
    "status" "public"."CycleStatus" NOT NULL DEFAULT 'DRAFT',
    "totalPersonas" INTEGER NOT NULL DEFAULT 30,
    "llmCostUsd" DECIMAL(10,4),
    "durationSec" INTEGER,
    "completedAt" TIMESTAMP(3),
    "failedReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "validationId" TEXT,
    "summaryText" TEXT,
    "topPros" JSONB,
    "topCons" JSONB,
    "insights" JSONB,

    CONSTRAINT "Cycle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Hypothesis" (
    "id" TEXT NOT NULL,
    "portcoId" TEXT,
    "createdById" TEXT NOT NULL,
    "mode" "public"."HypothesisMode" NOT NULL,
    "content" TEXT NOT NULL,
    "draftSavedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "projectId" TEXT,

    CONSTRAINT "Hypothesis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."HypothesisValidation" (
    "id" TEXT NOT NULL,
    "hypothesisId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "kind" "public"."VerdictKind" NOT NULL,
    "confidenceScore" INTEGER NOT NULL,
    "klDivergence" DOUBLE PRECISION,
    "bciLow" DOUBLE PRECISION,
    "bciHigh" DOUBLE PRECISION,
    "recommendedN" INTEGER,
    "reasoning" JSONB NOT NULL,
    "stubMode" BOOLEAN NOT NULL DEFAULT true,
    "serviceVersion" TEXT,
    "forceOverridden" BOOLEAN NOT NULL DEFAULT false,
    "forceOverrideReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HypothesisValidation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Invitation" (
    "id" TEXT NOT NULL,
    "vcFirmId" TEXT NOT NULL,
    "portcoId" TEXT,
    "email" TEXT NOT NULL,
    "role" "public"."WorkspaceRole" NOT NULL,
    "invitedById" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."KnowledgeSource" (
    "id" TEXT NOT NULL,
    "vcFirmId" TEXT NOT NULL,
    "kind" "public"."KnowledgeSourceKind" NOT NULL,
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
    "projectId" TEXT,
    "removedByFirm" BOOLEAN NOT NULL DEFAULT false,
    "distilled" JSONB,
    "distilledAt" TIMESTAMP(3),
    "distilledContentHash" TEXT,
    "applicableIndustries" JSONB,
    "applicableFrameworks" JSONB,
    "licensePosture" "public"."LicensePosture" NOT NULL DEFAULT 'OPEN',
    "richMetadata" JSONB,

    CONSTRAINT "KnowledgeSource_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "vcFirmId" TEXT,
    "portcoId" TEXT,
    "role" "public"."WorkspaceRole" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."PanelConfiguration" (
    "id" TEXT NOT NULL,
    "portcoId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PanelConfiguration_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Passkey" (
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
CREATE TABLE "public"."PersonaDefinition" (
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
CREATE TABLE "public"."Portco" (
    "id" TEXT NOT NULL,
    "vcFirmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "public"."TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "archivedAt" TIMESTAMP(3),
    "purgeScheduledAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Portco_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProcessedStripeEvent" (
    "id" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "vcFirmId" TEXT,
    "processedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProcessedStripeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."Project" (
    "id" TEXT NOT NULL,
    "vcFirmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "status" "public"."ProjectStatus" NOT NULL DEFAULT 'ACTIVE',
    "composition" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "Project_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectAgent" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "agentKey" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "region" TEXT NOT NULL,
    "industry" TEXT NOT NULL,
    "companySize" TEXT NOT NULL,
    "tenure" TEXT NOT NULL,
    "stance" TEXT NOT NULL,
    "baseMarkdown" TEXT NOT NULL,
    "evolutionLog" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "originatingTranscriptIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "coreOpinions" JSONB NOT NULL DEFAULT '[]',
    "signatureVocabulary" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "personaStale" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "ProjectAgent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ProjectAsk" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "panelResult" JSON NOT NULL,
    "aggregates" JSON NOT NULL,
    "summary" JSON NOT NULL,
    "tokensIn" INTEGER NOT NULL DEFAULT 0,
    "tokensOut" INTEGER NOT NULL DEFAULT 0,
    "costUsd" DECIMAL(10,4) NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "validation" JSONB,

    CONSTRAINT "ProjectAsk_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."StatisticianVerdict" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "kind" "public"."VerdictKind" NOT NULL,
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
CREATE TABLE "public"."SyntheticTranscript" (
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
CREATE TABLE "public"."TenantLifecycleAuditLog" (
    "id" TEXT NOT NULL,
    "vcFirmId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "actorType" TEXT NOT NULL,
    "actorId" TEXT,
    "payload" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TenantLifecycleAuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."ThemeCluster" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "frequency" INTEGER NOT NULL,
    "sentiment" "public"."SentimentLabel" NOT NULL,
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
CREATE TABLE "public"."Transcript" (
    "id" TEXT NOT NULL,
    "vcFirmId" TEXT NOT NULL,
    "speakerName" TEXT NOT NULL,
    "speakerRole" TEXT NOT NULL,
    "speakerIndustry" TEXT NOT NULL,
    "speakerRegion" TEXT NOT NULL,
    "speakerCompanySize" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "sourceTitle" TEXT NOT NULL,
    "rawTranscript" TEXT NOT NULL,
    "distillationStatus" "public"."DistillationStatus" NOT NULL DEFAULT 'PENDING',
    "distillationError" TEXT,
    "addedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Transcript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."TranscriptInsight" (
    "id" TEXT NOT NULL,
    "transcriptId" TEXT NOT NULL,
    "insightText" TEXT NOT NULL,
    "kind" "public"."InsightKind" NOT NULL,
    "routingScope" "public"."InsightRoutingScope" NOT NULL,
    "applicableIndustries" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applicableRegions" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applicableFrameworks" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "applicableThreatTypes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "vocabularyAnchors" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TranscriptInsight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastSignInAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."VCFirm" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "status" "public"."TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "region" TEXT NOT NULL DEFAULT 'us',
    "stripeCustomerId" TEXT,
    "stripeSubscriptionId" TEXT,
    "archivedAt" TIMESTAMP(3),
    "purgeScheduledAt" TIMESTAMP(3),
    "purgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "anthropicKeyCiphertext" TEXT,
    "anthropicKeyLast4" TEXT,

    CONSTRAINT "VCFirm_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AuditLog_action_createdAt_idx" ON "public"."AuditLog"("action" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "public"."AuditLog"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "AuditLog_portcoId_createdAt_idx" ON "public"."AuditLog"("portcoId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "BacktestResult_datasetId_panelVersion_idx" ON "public"."BacktestResult"("datasetId" ASC, "panelVersion" ASC);

-- CreateIndex
CREATE INDEX "BacktestResult_panelVersion_passed_idx" ON "public"."BacktestResult"("panelVersion" ASC, "passed" ASC);

-- CreateIndex
CREATE INDEX "CISOPanel_isActive_idx" ON "public"."CISOPanel"("isActive" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CISOPanel_version_key" ON "public"."CISOPanel"("version" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "CalibrationDataset_datasetId_key" ON "public"."CalibrationDataset"("datasetId" ASC);

-- CreateIndex
CREATE INDEX "CalibrationDataset_publisher_year_idx" ON "public"."CalibrationDataset"("publisher" ASC, "year" ASC);

-- CreateIndex
CREATE INDEX "Cycle_createdById_status_createdAt_idx" ON "public"."Cycle"("createdById" ASC, "status" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "Cycle_hypothesisId_idx" ON "public"."Cycle"("hypothesisId" ASC);

-- CreateIndex
CREATE INDEX "Cycle_parentCycleId_idx" ON "public"."Cycle"("parentCycleId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Cycle_validationId_key" ON "public"."Cycle"("validationId" ASC);

-- CreateIndex
CREATE INDEX "Hypothesis_createdById_idx" ON "public"."Hypothesis"("createdById" ASC);

-- CreateIndex
CREATE INDEX "Hypothesis_portcoId_updatedAt_idx" ON "public"."Hypothesis"("portcoId" ASC, "updatedAt" ASC);

-- CreateIndex
CREATE INDEX "Hypothesis_projectId_updatedAt_idx" ON "public"."Hypothesis"("projectId" ASC, "updatedAt" ASC);

-- CreateIndex
CREATE INDEX "HypothesisValidation_hypothesisId_createdAt_idx" ON "public"."HypothesisValidation"("hypothesisId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "HypothesisValidation_kind_idx" ON "public"."HypothesisValidation"("kind" ASC);

-- CreateIndex
CREATE INDEX "Invitation_email_idx" ON "public"."Invitation"("email" ASC);

-- CreateIndex
CREATE INDEX "Invitation_token_idx" ON "public"."Invitation"("token" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_token_key" ON "public"."Invitation"("token" ASC);

-- CreateIndex
CREATE INDEX "Invitation_vcFirmId_acceptedAt_idx" ON "public"."Invitation"("vcFirmId" ASC, "acceptedAt" ASC);

-- CreateIndex
CREATE INDEX "KnowledgeSource_publishedAt_idx" ON "public"."KnowledgeSource"("publishedAt" ASC);

-- CreateIndex
CREATE INDEX "KnowledgeSource_vcFirmId_enabled_idx" ON "public"."KnowledgeSource"("vcFirmId" ASC, "enabled" ASC);

-- CreateIndex
CREATE INDEX "KnowledgeSource_vcFirmId_isCurated_idx" ON "public"."KnowledgeSource"("vcFirmId" ASC, "isCurated" ASC);

-- CreateIndex
CREATE INDEX "KnowledgeSource_vcFirmId_projectId_enabled_idx" ON "public"."KnowledgeSource"("vcFirmId" ASC, "projectId" ASC, "enabled" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "KnowledgeSource_vcFirmId_url_projectId_key" ON "public"."KnowledgeSource"("vcFirmId" ASC, "url" ASC, "projectId" ASC);

-- CreateIndex
CREATE INDEX "Membership_portcoId_idx" ON "public"."Membership"("portcoId" ASC);

-- CreateIndex
CREATE INDEX "Membership_userId_idx" ON "public"."Membership"("userId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_vcFirmId_portcoId_key" ON "public"."Membership"("userId" ASC, "vcFirmId" ASC, "portcoId" ASC);

-- CreateIndex
CREATE INDEX "Membership_vcFirmId_idx" ON "public"."Membership"("vcFirmId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PanelConfiguration_portcoId_name_key" ON "public"."PanelConfiguration"("portcoId" ASC, "name" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Passkey_credentialId_key" ON "public"."Passkey"("credentialId" ASC);

-- CreateIndex
CREATE INDEX "Passkey_userId_idx" ON "public"."Passkey"("userId" ASC);

-- CreateIndex
CREATE INDEX "PersonaDefinition_panelId_idx" ON "public"."PersonaDefinition"("panelId" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "PersonaDefinition_panelId_key_key" ON "public"."PersonaDefinition"("panelId" ASC, "key" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Portco_vcFirmId_slug_key" ON "public"."Portco"("vcFirmId" ASC, "slug" ASC);

-- CreateIndex
CREATE INDEX "Portco_vcFirmId_status_idx" ON "public"."Portco"("vcFirmId" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "ProcessedStripeEvent_processedAt_idx" ON "public"."ProcessedStripeEvent"("processedAt" ASC);

-- CreateIndex
CREATE INDEX "Project_vcFirmId_isDefault_idx" ON "public"."Project"("vcFirmId" ASC, "isDefault" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "Project_vcFirmId_name_key" ON "public"."Project"("vcFirmId" ASC, "name" ASC);

-- CreateIndex
CREATE INDEX "Project_vcFirmId_status_idx" ON "public"."Project"("vcFirmId" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "ProjectAgent_projectId_agentKey_key" ON "public"."ProjectAgent"("projectId" ASC, "agentKey" ASC);

-- CreateIndex
CREATE INDEX "ProjectAgent_projectId_idx" ON "public"."ProjectAgent"("projectId" ASC);

-- CreateIndex
CREATE INDEX "ProjectAgent_projectId_industry_idx" ON "public"."ProjectAgent"("projectId" ASC, "industry" ASC);

-- CreateIndex
CREATE INDEX "ProjectAgent_projectId_region_idx" ON "public"."ProjectAgent"("projectId" ASC, "region" ASC);

-- CreateIndex
CREATE INDEX "ProjectAsk_projectId_createdAt_idx" ON "public"."ProjectAsk"("projectId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "StatisticianVerdict_cycleId_key" ON "public"."StatisticianVerdict"("cycleId" ASC);

-- CreateIndex
CREATE INDEX "StatisticianVerdict_kind_idx" ON "public"."StatisticianVerdict"("kind" ASC);

-- CreateIndex
CREATE INDEX "SyntheticTranscript_cycleId_idx" ON "public"."SyntheticTranscript"("cycleId" ASC);

-- CreateIndex
CREATE INDEX "SyntheticTranscript_cycleId_personaRegion_idx" ON "public"."SyntheticTranscript"("cycleId" ASC, "personaRegion" ASC);

-- CreateIndex
CREATE INDEX "TenantLifecycleAuditLog_createdAt_idx" ON "public"."TenantLifecycleAuditLog"("createdAt" ASC);

-- CreateIndex
CREATE INDEX "TenantLifecycleAuditLog_eventType_createdAt_idx" ON "public"."TenantLifecycleAuditLog"("eventType" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "TenantLifecycleAuditLog_vcFirmId_createdAt_idx" ON "public"."TenantLifecycleAuditLog"("vcFirmId" ASC, "createdAt" ASC);

-- CreateIndex
CREATE INDEX "ThemeCluster_cycleId_frequency_idx" ON "public"."ThemeCluster"("cycleId" ASC, "frequency" ASC);

-- CreateIndex
CREATE INDEX "Transcript_vcFirmId_addedAt_idx" ON "public"."Transcript"("vcFirmId" ASC, "addedAt" ASC);

-- CreateIndex
CREATE INDEX "Transcript_vcFirmId_speakerIndustry_speakerRegion_idx" ON "public"."Transcript"("vcFirmId" ASC, "speakerIndustry" ASC, "speakerRegion" ASC);

-- CreateIndex
CREATE INDEX "TranscriptInsight_kind_idx" ON "public"."TranscriptInsight"("kind" ASC);

-- CreateIndex
CREATE INDEX "TranscriptInsight_routingScope_enabled_idx" ON "public"."TranscriptInsight"("routingScope" ASC, "enabled" ASC);

-- CreateIndex
CREATE INDEX "TranscriptInsight_transcriptId_enabled_idx" ON "public"."TranscriptInsight"("transcriptId" ASC, "enabled" ASC);

-- CreateIndex
CREATE INDEX "User_email_idx" ON "public"."User"("email" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "public"."User"("email" ASC);

-- CreateIndex
CREATE INDEX "VCFirm_region_idx" ON "public"."VCFirm"("region" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "VCFirm_slug_key" ON "public"."VCFirm"("slug" ASC);

-- CreateIndex
CREATE INDEX "VCFirm_status_purgeScheduledAt_idx" ON "public"."VCFirm"("status" ASC, "purgeScheduledAt" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "VCFirm_stripeCustomerId_key" ON "public"."VCFirm"("stripeCustomerId" ASC);

-- AddForeignKey
ALTER TABLE "public"."AuditLog" ADD CONSTRAINT "AuditLog_portcoId_fkey" FOREIGN KEY ("portcoId") REFERENCES "public"."Portco"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."BacktestResult" ADD CONSTRAINT "BacktestResult_datasetId_fkey" FOREIGN KEY ("datasetId") REFERENCES "public"."CalibrationDataset"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Cycle" ADD CONSTRAINT "Cycle_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Cycle" ADD CONSTRAINT "Cycle_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "public"."Hypothesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Cycle" ADD CONSTRAINT "Cycle_parentCycleId_fkey" FOREIGN KEY ("parentCycleId") REFERENCES "public"."Cycle"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Cycle" ADD CONSTRAINT "Cycle_validationId_fkey" FOREIGN KEY ("validationId") REFERENCES "public"."HypothesisValidation"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Hypothesis" ADD CONSTRAINT "Hypothesis_portcoId_fkey" FOREIGN KEY ("portcoId") REFERENCES "public"."Portco"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."HypothesisValidation" ADD CONSTRAINT "HypothesisValidation_hypothesisId_fkey" FOREIGN KEY ("hypothesisId") REFERENCES "public"."Hypothesis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "public"."User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Invitation" ADD CONSTRAINT "Invitation_vcFirmId_fkey" FOREIGN KEY ("vcFirmId") REFERENCES "public"."VCFirm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."KnowledgeSource" ADD CONSTRAINT "KnowledgeSource_vcFirmId_fkey" FOREIGN KEY ("vcFirmId") REFERENCES "public"."VCFirm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_portcoId_fkey" FOREIGN KEY ("portcoId") REFERENCES "public"."Portco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Membership" ADD CONSTRAINT "Membership_vcFirmId_fkey" FOREIGN KEY ("vcFirmId") REFERENCES "public"."VCFirm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PanelConfiguration" ADD CONSTRAINT "PanelConfiguration_portcoId_fkey" FOREIGN KEY ("portcoId") REFERENCES "public"."Portco"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."PersonaDefinition" ADD CONSTRAINT "PersonaDefinition_panelId_fkey" FOREIGN KEY ("panelId") REFERENCES "public"."CISOPanel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Portco" ADD CONSTRAINT "Portco_vcFirmId_fkey" FOREIGN KEY ("vcFirmId") REFERENCES "public"."VCFirm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProcessedStripeEvent" ADD CONSTRAINT "ProcessedStripeEvent_vcFirmId_fkey" FOREIGN KEY ("vcFirmId") REFERENCES "public"."VCFirm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Project" ADD CONSTRAINT "Project_vcFirmId_fkey" FOREIGN KEY ("vcFirmId") REFERENCES "public"."VCFirm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectAgent" ADD CONSTRAINT "ProjectAgent_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ProjectAsk" ADD CONSTRAINT "ProjectAsk_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "public"."Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."StatisticianVerdict" ADD CONSTRAINT "StatisticianVerdict_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "public"."Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."SyntheticTranscript" ADD CONSTRAINT "SyntheticTranscript_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "public"."Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TenantLifecycleAuditLog" ADD CONSTRAINT "TenantLifecycleAuditLog_vcFirmId_fkey" FOREIGN KEY ("vcFirmId") REFERENCES "public"."VCFirm"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."ThemeCluster" ADD CONSTRAINT "ThemeCluster_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "public"."Cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."Transcript" ADD CONSTRAINT "Transcript_vcFirmId_fkey" FOREIGN KEY ("vcFirmId") REFERENCES "public"."VCFirm"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."TranscriptInsight" ADD CONSTRAINT "TranscriptInsight_transcriptId_fkey" FOREIGN KEY ("transcriptId") REFERENCES "public"."Transcript"("id") ON DELETE CASCADE ON UPDATE CASCADE;

