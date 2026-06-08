// SPDX-License-Identifier: AGPL-3.0-or-later
import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { getAnthropicClientForFirm } from "@/lib/anthropic/client";
import { ANTHROPIC_MODELS } from "@/lib/anthropic/models";

/**
 * One-shot LLM distillation of a KnowledgeSource into a structured card.
 *
 * Project sources get a product-shaped card (problem / solution / ICP /
 * GTM / moat) — that's what an agent needs to reason about the founder's
 * actual company. Firm-wide sources get an industry-research card
 * (tldr / findings / applicable regions) — what an agent needs to
 * ground claims about the market.
 *
 * Fire-and-forget on upload. If it fails, raw `content` stays as the
 * fallback in the briefing builder — nothing breaks, the briefing just
 * costs more tokens for that source.
 */

// Cap raw content sent to the distiller. Decks rarely exceed ~12 KB of
// extracted text; reports are usually under 20 KB. Higher cap = more
// fidelity at small marginal cost; we accept a soft cap to keep first-
// pass cost predictable.
const DISTILL_INPUT_CAP = 20_000;

export type ProjectCard = {
  kind: "project";
  productName: string | null;
  problemStatement: string | null;
  solution: string | null;
  icp: string | null;
  gtm: string | null;
  competitiveMoat: string | null;
  pricing: string | null;
  traction: string | null;
  keyAssertions: string[];
  openQuestions: string[];
};

export type FirmCard = {
  kind: "firm";
  tldr: string | null;
  keyFindings: string[];
  applicableRegions: string[];
  applicableQuestionCategories: string[];
  statisticalCitations: string[];
};

// Sprint 4 — knowledge-moat card types. Framework / regulation / vendor
// sources each render in a shape that pro-level CISO reasoning leans on
// (control IDs, jurisdictions, vendor positioning) — not collapsed into
// the generic firm card.

export type FrameworkCard = {
  kind: "framework";
  frameworkName: string | null;
  function: string | null;
  controlIds: string[];
  scope: string | null;
  applicableIndustries: string[];
  // Up to 8 controls. id is the framework's own identifier
  // (e.g. "PR.PT-3" for NIST CSF). description is short prose.
  keyControls: { id: string; description: string }[];
};

export type RegulationCard = {
  kind: "regulation";
  regulationName: string | null;
  jurisdiction: string[];
  applicableIndustries: string[];
  keyObligations: string[];
  deadlines: string[];
  penaltyFramework: string | null;
};

export type VendorCard = {
  kind: "vendor";
  productName: string | null;
  category: string | null;
  capabilities: string[];
  pricingTier: string | null;
  integrations: string[];
  marketPosition: string | null;
  primaryCritique: string | null;
  alternativesToConsider: string[];
};

export type DistilledCard =
  | ProjectCard
  | FirmCard
  | FrameworkCard
  | RegulationCard
  | VendorCard;

export type DistilledKind = DistilledCard["kind"];

const PROJECT_INSTRUCTION = `You are extracting a structured product card from a founder's own materials (pitch deck, company site, product spec, or founder-supplied report). This card is the AUTHORITATIVE description of the company for downstream synthetic-CISO panel reasoning.

Return strict JSON with EXACTLY these fields. Use null for any field the source doesn't address. Do not invent facts.

{
  "kind": "project",
  "productName": string | null,
  "problemStatement": string | null,
  "solution": string | null,
  "icp": string | null,
  "gtm": string | null,
  "competitiveMoat": string | null,
  "pricing": string | null,
  "traction": string | null,
  "keyAssertions": string[],
  "openQuestions": string[]
}

Field guidance:
- "icp" = ideal customer profile in one sentence (company size + industry + buyer role)
- "keyAssertions" = bold product claims the founder is making (≤ 8 items, each ≤ 200 chars)
- "openQuestions" = unanswered gaps that would matter to a CISO buyer (≤ 5 items)
- Keep prose tight. Each string field ≤ 400 chars. Lists capped above.

Output JSON only. No markdown fence, no commentary.`;

const FIRM_INSTRUCTION = `You are extracting a structured research card from an industry source (analyst report, threat intel, regulator publication, news). This card is used as background context for a synthetic-CISO panel.

Return strict JSON with EXACTLY these fields. Use null for any field not addressed. Do not invent.

{
  "kind": "firm",
  "tldr": string | null,
  "keyFindings": string[],
  "applicableRegions": string[],
  "applicableQuestionCategories": string[],
  "statisticalCitations": string[]
}

Field guidance:
- "tldr" = one sentence summary of the source's central claim (≤ 280 chars)
- "keyFindings" = ≤ 6 bullets, each ≤ 200 chars, that a CISO panel would lean on
- "applicableRegions" = subset of [global, us, uk, eu-west, eu-central, apac, anz, mea]
- "applicableQuestionCategories" = subset of [initial-access, ransomware, vendor-consolidation, ai-procurement, cloud-security, identity, compliance, board-reporting, budget, vulnerabilities]
- "statisticalCitations" = ≤ 5 strong stats with units and dates ("63% of CISOs in 2026 …")

Output JSON only. No markdown fence, no commentary.`;

const FRAMEWORK_INSTRUCTION = `You are extracting a structured framework card from a cybersecurity framework source (NIST CSF, MITRE ATT&CK, ISO 27001, CIS Controls, etc.). This card is what pro-level CISO agents lean on to cite control IDs and frame their reasoning against industry standards.

Return strict JSON with EXACTLY these fields. Use null for any field not addressed. Use the framework's own identifier conventions (e.g. "PR.PT-3" for NIST CSF, "T1078" for MITRE ATT&CK).

{
  "kind": "framework",
  "frameworkName": string | null,
  "function": string | null,
  "controlIds": string[],
  "scope": string | null,
  "applicableIndustries": string[],
  "keyControls": [{ "id": string, "description": string }]
}

Field guidance:
- "frameworkName" = canonical name ("NIST CSF v2", "MITRE ATT&CK Enterprise", "CIS Controls v8")
- "function" = the function/tactic/domain this card covers ("PROTECT", "Initial Access")
- "controlIds" = ≤ 20 ids from this function/tactic (e.g. ["PR.PT-3","PR.AC-1"])
- "scope" = one sentence on when an agent should cite this (e.g. "Asset management and access control posture")
- "applicableIndustries" = subset of [financial-services, healthcare, insurance, technology, government, energy, retail, manufacturing, telecom, education, critical-infrastructure]; empty array = broadly applicable
- "keyControls" = ≤ 8 of the most load-bearing controls with id + ≤ 160-char description

Output JSON only. No markdown fence, no commentary.`;

const REGULATION_INSTRUCTION = `You are extracting a structured regulation card from a legal/regulatory text (DORA, NIS2, GDPR, HIPAA, PCI-DSS, FedRAMP, SOX, etc.). This card is what pro-level CISO agents reference to ground compliance reasoning in actual law/standard text.

Return strict JSON with EXACTLY these fields. Use null for any field not addressed. Cite article/section numbers where the source provides them.

{
  "kind": "regulation",
  "regulationName": string | null,
  "jurisdiction": string[],
  "applicableIndustries": string[],
  "keyObligations": string[],
  "deadlines": string[],
  "penaltyFramework": string | null
}

Field guidance:
- "regulationName" = canonical name ("DORA", "NIS2 Directive (EU) 2022/2555", "HIPAA Security Rule")
- "jurisdiction" = subset of [global, us, uk, eu-west, eu-central, apac, anz, mea]; for multi-state US use ["us"]
- "applicableIndustries" = subset of [financial-services, healthcare, insurance, technology, government, energy, retail, manufacturing, telecom, education, critical-infrastructure]
- "keyObligations" = ≤ 6 obligations the regulation imposes (each ≤ 200 chars, cite the article if the source provides one — e.g. "Art. 28: ICT third-party risk management")
- "deadlines" = ≤ 4 dated milestones (e.g. "DORA effective 2025-01-17", "NIS2 transposition by 2024-10-17"); empty array if none
- "penaltyFramework" = one sentence on enforcement (e.g. "Up to 2% of global turnover for systemic breaches")

Output JSON only. No markdown fence, no commentary.`;

const VENDOR_INSTRUCTION = `You are extracting a structured vendor card from admin-supplied vendor metadata (handcrafted by Principe; not from the open web). This card is the AUTHORITATIVE description of a cybersecurity vendor for downstream CISO panel reasoning about buying decisions, vendor selection, and competitive positioning.

Return strict JSON with EXACTLY these fields. Use null for any field the input doesn't address. Don't invent capabilities or pricing the input doesn't claim.

{
  "kind": "vendor",
  "productName": string | null,
  "category": string | null,
  "capabilities": string[],
  "pricingTier": string | null,
  "integrations": string[],
  "marketPosition": string | null,
  "primaryCritique": string | null,
  "alternativesToConsider": string[]
}

Field guidance:
- "productName" = the product name CISOs say in conversation ("CrowdStrike Falcon", "Wiz")
- "category" = vendor category ("EDR", "CNAPP", "SIEM", "IAM", "AppSec", "SASE", "SaaS posture", etc.)
- "capabilities" = ≤ 8 capabilities, each ≤ 120 chars
- "pricingTier" = one sentence on cost positioning ("Premium — Enterprise ARR typically $250K+")
- "integrations" = ≤ 8 named integrations a CISO would care about ("Splunk", "Okta", "ServiceNow")
- "marketPosition" = one sentence on competitive standing ("Leader in Gartner MQ 2025 for EPP/EDR")
- "primaryCritique" = honest weakness most often raised ("Forensics depth lags Carbon Black on Windows endpoint")
- "alternativesToConsider" = ≤ 5 competitor product names

Output JSON only. No markdown fence, no commentary.`;

interface DistillInput {
  sourceId: string;
}

interface DistillResult {
  ok: boolean;
  skipped?: "no-content" | "unchanged" | "no-api-key";
  error?: string;
}

export async function distillSource({
  sourceId,
}: DistillInput): Promise<DistillResult> {
  const source = await prisma.knowledgeSource.findUnique({
    where: { id: sourceId },
    select: {
      id: true,
      firmId: true,
      projectId: true,
      kind: true,
      title: true,
      content: true,
      contentHash: true,
      distilledContentHash: true,
      category: true,
    },
  });
  if (!source) return { ok: false, error: "Source not found" };
  if (!source.content || source.content.trim().length === 0) {
    return { ok: false, skipped: "no-content" };
  }
  if (
    source.contentHash &&
    source.distilledContentHash === source.contentHash
  ) {
    return { ok: true, skipped: "unchanged" };
  }

  let client;
  try {
    client = await getAnthropicClientForFirm(source.firmId);
  } catch (e) {
    if (e instanceof Error && e.message === "ANTHROPIC_KEY_MISSING") {
      return { ok: false, skipped: "no-api-key" };
    }
    throw e;
  }

  // Pick the card type from kind + category + projectId. Order matters:
  // VENDOR_CARD takes precedence (admin-supplied); then project-scoped;
  // then category-based; then default firm card.
  const targetKind = pickTargetKind(source);
  const instruction = INSTRUCTION_BY_KIND[targetKind];
  const raw = source.content.slice(0, DISTILL_INPUT_CAP);

  let parsed: DistilledCard;
  try {
    parsed = await callDistiller(client, source, raw, instruction, targetKind);
  } catch (e) {
    return {
      ok: false,
      error: e instanceof Error ? e.message.slice(0, 200) : "unknown",
    };
  }

  await prisma.knowledgeSource.update({
    where: { id: sourceId },
    data: {
      distilled: parsed as unknown as Prisma.InputJsonValue,
      distilledAt: new Date(),
      distilledContentHash: source.contentHash,
    },
  });
  return { ok: true };
}

const INSTRUCTION_BY_KIND: Record<DistilledKind, string> = {
  project: PROJECT_INSTRUCTION,
  firm: FIRM_INSTRUCTION,
  framework: FRAMEWORK_INSTRUCTION,
  regulation: REGULATION_INSTRUCTION,
  vendor: VENDOR_INSTRUCTION,
};

function pickTargetKind(source: {
  projectId: string | null;
  category: string | null;
  kind: string | null;
}): DistilledKind {
  if (source.kind === "VENDOR_CARD") return "vendor";
  if (source.projectId !== null) return "project";
  const cat = source.category?.toLowerCase() ?? "";
  if (cat === "framework") return "framework";
  if (cat === "regulator") return "regulation";
  return "firm";
}

async function callDistiller(
  client: Awaited<ReturnType<typeof getAnthropicClientForFirm>>,
  source: { title: string; category: string | null },
  raw: string,
  instruction: string,
  expectedKind: DistilledKind,
  attempt = 1,
): Promise<DistilledCard> {
  const userMessage = `Source title: ${source.title}\nCategory: ${source.category ?? "uncategorized"}\n\n---\n\n${raw}`;
  const sharpenedSystem =
    attempt === 1
      ? instruction
      : `${instruction}\n\nReminder: your previous response had the wrong "kind" value. You MUST set "kind": "${expectedKind}" and match the schema for that kind exactly.`;

  const res = await client.messages.create({
    model: ANTHROPIC_MODELS.panel,
    max_tokens: 1500,
    system: sharpenedSystem,
    messages: [{ role: "user", content: userMessage }],
  });
  const text = res.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim();
  const parsed = parseDistillerJson(text, expectedKind);

  // Kind-mismatch retry: one extra shot with a sharper instruction.
  if (parsed.kind !== expectedKind && attempt < 2) {
    return callDistiller(client, source, raw, instruction, expectedKind, attempt + 1);
  }

  return parsed;
}

function parseDistillerJson(
  text: string,
  expectedKind: DistilledKind,
): DistilledCard {
  // Strip a leading ```json fence if Claude added one despite the instruction.
  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
  const data = JSON.parse(cleaned);
  if (typeof data !== "object" || data === null) {
    throw new Error("Distiller output is not an object");
  }
  // Coerce by expectedKind. If the model returned a different kind, we
  // still try to coerce against the expected schema — the caller decides
  // whether to retry based on the resulting card's `kind` field.
  const claimedKind = typeof data.kind === "string" ? data.kind : null;
  const kindToUse = claimedKind === expectedKind ? expectedKind : (claimedKind ?? expectedKind);

  switch (kindToUse) {
    case "project":
      return {
        kind: "project",
        productName: stringOrNull(data.productName),
        problemStatement: stringOrNull(data.problemStatement),
        solution: stringOrNull(data.solution),
        icp: stringOrNull(data.icp),
        gtm: stringOrNull(data.gtm),
        competitiveMoat: stringOrNull(data.competitiveMoat),
        pricing: stringOrNull(data.pricing),
        traction: stringOrNull(data.traction),
        keyAssertions: stringArr(data.keyAssertions).slice(0, 8),
        openQuestions: stringArr(data.openQuestions).slice(0, 5),
      };
    case "firm":
      return {
        kind: "firm",
        tldr: stringOrNull(data.tldr),
        keyFindings: stringArr(data.keyFindings).slice(0, 6),
        applicableRegions: stringArr(data.applicableRegions).slice(0, 10),
        applicableQuestionCategories: stringArr(
          data.applicableQuestionCategories,
        ).slice(0, 10),
        statisticalCitations: stringArr(data.statisticalCitations).slice(0, 5),
      };
    case "framework":
      return {
        kind: "framework",
        frameworkName: stringOrNull(data.frameworkName),
        function: stringOrNull(data.function),
        controlIds: stringArr(data.controlIds).slice(0, 20),
        scope: stringOrNull(data.scope),
        applicableIndustries: stringArr(data.applicableIndustries).slice(0, 12),
        keyControls: parseKeyControls(data.keyControls).slice(0, 8),
      };
    case "regulation":
      return {
        kind: "regulation",
        regulationName: stringOrNull(data.regulationName),
        jurisdiction: stringArr(data.jurisdiction).slice(0, 8),
        applicableIndustries: stringArr(data.applicableIndustries).slice(0, 12),
        keyObligations: stringArr(data.keyObligations).slice(0, 6),
        deadlines: stringArr(data.deadlines).slice(0, 4),
        penaltyFramework: stringOrNull(data.penaltyFramework),
      };
    case "vendor":
      return {
        kind: "vendor",
        productName: stringOrNull(data.productName),
        category: stringOrNull(data.category),
        capabilities: stringArr(data.capabilities).slice(0, 8),
        pricingTier: stringOrNull(data.pricingTier),
        integrations: stringArr(data.integrations).slice(0, 8),
        marketPosition: stringOrNull(data.marketPosition),
        primaryCritique: stringOrNull(data.primaryCritique),
        alternativesToConsider: stringArr(data.alternativesToConsider).slice(0, 5),
      };
    default:
      throw new Error(`Distiller returned unknown kind: ${kindToUse}`);
  }
}

function parseKeyControls(v: unknown): { id: string; description: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const e = entry as Record<string, unknown>;
      const id = typeof e.id === "string" ? e.id.trim().slice(0, 40) : null;
      const description =
        typeof e.description === "string" ? e.description.trim().slice(0, 200) : null;
      if (!id || !description) return null;
      return { id, description };
    })
    .filter((x): x is { id: string; description: string } => x !== null);
}

function stringOrNull(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim();
  if (!trimmed) return null;
  return trimmed.slice(0, 400);
}

function stringArr(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is string => typeof x === "string")
    .map((x) => x.trim().slice(0, 200))
    .filter(Boolean);
}

export function fireAndForgetDistill(sourceId: string): void {
  // Caller doesn't await — distillation runs in the background.
  // Failures are recorded by not setting distilledContentHash;
  // briefing builder falls back to raw content.
  void distillSource({ sourceId }).catch((e) => {
    console.warn(
      `[distill] ${sourceId} failed:`,
      e instanceof Error ? e.message : String(e),
    );
  });
}

// Helper for /api/sources/* POSTs that compute their own content hash and
// want to set distilledContentHash to null when content changes.
export function contentHash(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}
