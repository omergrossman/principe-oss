import { prisma } from "@/lib/db/prisma";
import { frameworksOverlap } from "./framework-fit";
import { classifyQuestionThreatTypes, type ThreatType } from "@/lib/canon";

/**
 * Per-agent briefing builder.
 *
 * Each of the 100 agents gets a tailored briefing: sources relevant to
 * their region rank first; global sources fill the rest of the budget;
 * region-mismatched sources are demoted but still included if there's
 * room. Within a relevance tier, newer reports come before older ones.
 *
 * Token economics: an old "shared briefing × 100 personas" approach
 * cost ~$0.07/question. Per-agent filtering with a tighter budget
 * (3600 chars per agent — bumped from 2400 when project sources got
 * their own larger quota) keeps cost in the same band while letting
 * a deck or company-site dump anchor the agent's reasoning.
 */

// Total budget for the per-agent briefing. Bumped from 2400 → 3600 so a
// project deck or company-site dump can sit alongside curated industry
// sources without crowding them out.
const MAX_BRIEFING_CHARS = 3600;

// Per-source quotas. Project sources (decks, founder-supplied reports,
// company site) get ~3× the room because the agent is meant to study
// them, not skim them. Firm-wide sources stay terse — they're the
// industry backdrop, not the subject. Sprint 4 adds three knowledge-
// moat card types with their own budgets — vendor cards highest
// because buying-behaviour reasoning leans heavily on positioning text.
const PER_SOURCE_CHARS_PROJECT = 1200;
const PER_SOURCE_CHARS_FIRM = 420;
const PER_SOURCE_CHARS_FRAMEWORK = 800;
const PER_SOURCE_CHARS_REGULATION = 700;
const PER_SOURCE_CHARS_VENDOR = 900;

// Sprint 5 — insights are short by construction. Cap each at 300 chars
// in the rendered briefing; insights are atomic positions, not source
// summaries, so no header-meta overhead like the sources section.
const PER_INSIGHT_CHARS = 300;
const MAX_INSIGHTS_PER_BRIEFING = 8;

export interface BriefingSourceRow {
  id: string;
  title: string;
  url: string | null;
  filename: string | null;
  category: string | null;
  region: string | null;
  // Null = firm-wide source from Settings. Non-null = pinned to a project.
  // Project-scoped sources outrank firm-wide ones at briefing time.
  projectId: string | null;
  content: string | null;
  // Structured card produced by `distillSource` on upload. When present,
  // the briefing renders this instead of slicing raw `content`.
  distilled: unknown;
  // Sprint 4 — knowledge-moat routing tags. Sources with these set are
  // weighted up against personas matching by industry / framework set.
  applicableIndustries: unknown;
  applicableFrameworks: unknown;
  // Sprint 5 KB expansion — license posture gates attribution wording.
  // LICENSED_REPORT sources render with a "summarized from" prefix so the
  // agent never quotes them as if they were public-domain content.
  licensePosture: "OPEN" | "PUBLIC_PAGE" | "LICENSED_REPORT" | "VENDOR_REPRINT";
  publishedAt: Date | null;
  lastFetchedAt: Date | null;
}

export interface BriefingPersona {
  region: string;
  industry: string | null | undefined;
}

export interface BriefingInsightRow {
  id: string;
  insightText: string;
  routingScope: "UNIVERSAL" | "TARGETED";
  applicableIndustries: string[];
  applicableRegions: string[];
  applicableThreatTypes: string[];
  vocabularyAnchors: string[];
  speakerName: string;
  speakerIndustry: string;
  speakerRegion: string;
}

/**
 * Sprint 5 — load all enabled TranscriptInsights for a firm.
 * Pre-flattens speaker context onto each insight row so the briefing
 * builder doesn't need a join lookup per render.
 */
export async function loadEnabledInsightsForFirm(
  firmId: string,
): Promise<BriefingInsightRow[]> {
  const rows = await prisma.transcriptInsight.findMany({
    where: {
      enabled: true,
      transcript: { firmId, distillationStatus: "COMPLETE" },
    },
    include: {
      transcript: {
        select: { speakerName: true, speakerIndustry: true, speakerRegion: true },
      },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    insightText: r.insightText,
    routingScope: r.routingScope,
    applicableIndustries: r.applicableIndustries,
    applicableRegions: r.applicableRegions,
    applicableThreatTypes: r.applicableThreatTypes,
    vocabularyAnchors: r.vocabularyAnchors,
    speakerName: r.transcript.speakerName,
    speakerIndustry: r.transcript.speakerIndustry,
    speakerRegion: r.transcript.speakerRegion,
  }));
}

/**
 * Load all enabled, non-empty sources for a firm in one query. Caller
 * then passes this set to buildBriefingForAgent N times — single DB
 * round-trip per panel run instead of per agent.
 */
/**
 * Load sources for a given (firm, project) pair. Includes:
 *   - All firm-wide sources (projectId IS NULL)
 *   - Plus the project-scoped sources (projectId = the given project)
 *
 * Both are merged and ranked by recency at fan-out time.
 */
export async function loadEnabledSources(
  firmId: string,
  projectId?: string,
): Promise<BriefingSourceRow[]> {
  const where: Parameters<typeof prisma.knowledgeSource.findMany>[0] = {
    where: {
      firmId,
      enabled: true,
      removedByFirm: false,
      // Phase 5+ baseline sync — when DP master removes a source we
      // stamp baselineRemovedAt and stop including it in briefings.
      baselineRemovedAt: null,
      content: { not: null },
      // Sprint 5.5 — pitch deck references are a 206-entry reference DB
      // for the comparable-decks injection path. They must NOT flow into
      // every briefing or they'd pollute every question with unrelated
      // startup descriptions. The pitch-deck-injection path loads them
      // separately when the project has a deck source AND the question
      // is pitch-shaped.
      category: { not: "pitch_deck_reference" },
      OR: projectId
        ? [{ projectId: null }, { projectId }]
        : [{ projectId: null }],
    },
    select: {
      id: true,
      title: true,
      url: true,
      filename: true,
      category: true,
      region: true,
      projectId: true,
      content: true,
      distilled: true,
      applicableIndustries: true,
      applicableFrameworks: true,
      licensePosture: true,
      publishedAt: true,
      lastFetchedAt: true,
    },
  };
  return prisma.knowledgeSource.findMany(where);
}

export interface BriefingOptions {
  insights?: BriefingInsightRow[];
  question?: string;
  // Sprint 5.5 — the 8 most-relevant pitch-deck reference rows for this
  // project's deck, pre-ranked by `loadAndRankPitchDeckReferences`. The
  // caller decides when to compute these (only when a project deck +
  // pitch-shaped question are both present) and passes them in here.
  pitchDeckReferences?: PitchDeckReferenceRow[];
}

export interface PitchDeckReferenceRow {
  companyName: string;
  description: string;
  fundingRound: string | null;
  fundingAmount: string | null;
  url: string;
}

/**
 * Sprint 5.5 — keywords that flag a question as pitch/fundraising-shaped.
 * Used by the ask path to decide whether to load + inject pitch deck
 * references into the briefing. Conservative on purpose; better to miss
 * a borderline case than pollute every briefing.
 */
const PITCH_QUESTION_KEYWORDS = [
  "pitch",
  "deck",
  "raise",
  "raising",
  "fundrais",
  "investor",
  "vc",
  "venture",
  "seed",
  "series a",
  "series b",
  "series c",
  "series d",
  "valuation",
  "term sheet",
  "round",
  "burn rate",
  "runway",
  "captable",
  "cap table",
  "founder",
  "positioning",
  "narrative",
];

export function isPitchShapedQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return PITCH_QUESTION_KEYWORDS.some((kw) => q.includes(kw));
}

/**
 * Sprint 5.5 — does this project have a pitch-deck-shaped source? Used
 * to decide whether to compute + inject the COMPARABLE PITCH DECKS
 * section. Heuristic: filename or title contains "deck" or "pitch".
 */
export function projectHasPitchDeck(sources: BriefingSourceRow[]): boolean {
  return sources.some((s) => {
    if (!s.projectId) return false;
    const hay = `${s.title ?? ""} ${s.filename ?? ""}`.toLowerCase();
    return /\bdeck\b|\bpitch\b/.test(hay);
  });
}

/**
 * Sprint 5.5 — load the 206 pitch-deck references and rank by keyword
 * overlap with the user's deck text. Returns the top N. When no deck
 * text is available (project deck has no content yet), returns a diverse
 * stage-spread mix so the section still adds signal.
 */
export async function loadAndRankPitchDeckReferences(
  firmId: string,
  userDeckText: string,
  n = 8,
): Promise<PitchDeckReferenceRow[]> {
  const refs = await prisma.knowledgeSource.findMany({
    where: {
      firmId,
      enabled: true,
      removedByFirm: false,
      category: "pitch_deck_reference",
    },
    select: {
      title: true,
      content: true,
      url: true,
      richMetadata: true,
    },
  });

  const parsed: (PitchDeckReferenceRow & { score: number })[] = refs.map(
    (r) => {
      const meta = (r.richMetadata ?? {}) as {
        company_name?: string;
        funding_round?: string | null;
        funding_amount?: string | null;
      };
      const description = r.content ?? "";
      return {
        companyName: meta.company_name ?? r.title,
        description,
        fundingRound: meta.funding_round ?? null,
        fundingAmount: meta.funding_amount ?? null,
        url: r.url ?? "",
        score: scoreByOverlap(userDeckText, description),
      };
    },
  );

  // If the user deck has no text yet (fresh upload, distillation pending),
  // every score is 0 — fall back to a diverse stage mix so the section
  // still adds signal.
  const hasScores = parsed.some((p) => p.score > 0);
  if (!hasScores) {
    return diverseStageMix(parsed, n);
  }

  parsed.sort((a, b) => b.score - a.score);
  return parsed.slice(0, n).map(({ score: _s, ...row }) => row);
}

const STOP_WORDS = new Set([
  "the",
  "a",
  "an",
  "and",
  "or",
  "of",
  "to",
  "in",
  "for",
  "is",
  "are",
  "with",
  "by",
  "on",
  "at",
  "from",
  "that",
  "this",
  "be",
  "their",
  "our",
  "we",
  "as",
  "company",
  "platform",
  "service",
  "product",
  "business",
  "users",
  "customers",
]);

function tokenize(s: string): Set<string> {
  return new Set(
    s
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 3 && !STOP_WORDS.has(w)),
  );
}

function scoreByOverlap(a: string, b: string): number {
  if (!a || !b) return 0;
  const ta = tokenize(a);
  const tb = tokenize(b);
  let overlap = 0;
  for (const t of tb) if (ta.has(t)) overlap += 1;
  return overlap;
}

function diverseStageMix(
  refs: { fundingRound: string | null; companyName: string; description: string; fundingAmount: string | null; url: string; score: number }[],
  n: number,
): PitchDeckReferenceRow[] {
  const stages = ["seed", "series-a", "series-b", "series-c", "series-d"];
  const out: PitchDeckReferenceRow[] = [];
  let i = 0;
  while (out.length < n && i < stages.length * 3) {
    const stage = stages[i % stages.length];
    const candidate = refs.find(
      (r) => r.fundingRound === stage && !out.some((o) => o.companyName === r.companyName),
    );
    if (candidate) {
      const { score: _s, ...row } = candidate;
      out.push(row);
    }
    i += 1;
  }
  // Pad with any if still short
  for (const r of refs) {
    if (out.length >= n) break;
    if (out.some((o) => o.companyName === r.companyName)) continue;
    const { score: _s, ...row } = r;
    out.push(row);
  }
  return out;
}

export function buildBriefingForAgent(
  sources: BriefingSourceRow[],
  agent: BriefingPersona,
  options: BriefingOptions = {},
): string {
  // Sprint 5 — pre-classify the question into threat types so insights
  // matching threat tags score higher. Empty array if no question/match.
  const questionThreats = options.question
    ? classifyQuestionThreatTypes(options.question)
    : [];

  const insights = options.insights ?? [];
  const insightSection = buildInsightsSection(insights, agent, questionThreats);

  if (sources.length === 0 && !insightSection) return "";

  const scored = sources
    .map((s) => ({ src: s, score: scoreSource(s, agent) }))
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      const ad = (a.src.publishedAt ?? a.src.lastFetchedAt)?.getTime() ?? 0;
      const bd = (b.src.publishedAt ?? b.src.lastFetchedAt)?.getTime() ?? 0;
      return bd - ad;
    });

  const lines: string[] = [
    "CURRENT INTELLIGENCE BRIEFING",
    "",
    "Items tagged [PROJECT] come from the founder's own materials — pitch decks,",
    "company site, product specs, founder-supplied threat reports. Treat [PROJECT]",
    "items as AUTHORITATIVE about the company's product, GTM, positioning, and",
    "target customer. When the founder's question is product-specific, ground your",
    "answer in the [PROJECT] content first; use other sources for general industry",
    "context only.",
    "",
    "Untagged items are general industry intelligence. They take priority over your",
    "training data when up-to-date. When sources conflict, prefer the newer report.",
    "",
    "Sources are weighted by relevance — region match, your industry's typical",
    "frameworks (e.g. DORA + NIS2 for financial-services in EU, HIPAA for US",
    "healthcare), and recency. Lean on the items ranked highest.",
    "",
    "Sources, most relevant first:",
    "",
  ];
  let used = 0;
  for (const { src } of scored) {
    const date = src.publishedAt ?? src.lastFetchedAt;
    const dateStr = date ? date.toISOString().slice(0, 10) : "undated";
    const label = src.url ?? src.filename ?? "source";
    const meta = [src.category, src.region].filter(Boolean).join(" · ");
    const tag = src.projectId ? "[PROJECT] " : "";
    // Sprint 5 KB — licensed analyst reports get an attribution prefix so
    // the agent treats them as paraphrased market framing, not quotable
    // primary source material. Avoids accidental copyright surface in
    // agent output.
    const attribution =
      src.licensePosture === "LICENSED_REPORT" ||
      src.licensePosture === "VENDOR_REPRINT"
        ? "[SUMMARIZED — do not quote] "
        : "";
    const header = `— ${attribution}${tag}${src.title} (${dateStr}${meta ? " · " + meta : ""}) ${label}`;
    const distilledBody = formatDistilled(src.distilled);
    const perSourceCap = perSourceCapFor(src.projectId, src.distilled);
    const body = distilledBody
      ? distilledBody.slice(0, perSourceCap)
      : (src.content ?? "").slice(0, perSourceCap).replace(/\s+/g, " ").trim();
    const entry = `${header}\n${body}`;
    if (used + entry.length > MAX_BRIEFING_CHARS) break;
    lines.push(entry);
    used += entry.length;
  }

  // Sprint 5 — append insights as a distinct section so the agent treats
  // them as ground-truth patterns from real CISO talks, not as fungible
  // source material. Renders only if any insights match this agent.
  if (insightSection) {
    lines.push("", insightSection);
  }

  // Sprint 5.5 — pitch-deck references as a distinct section. Only
  // present when the caller decided this is a pitch-shaped question on
  // a project that has a deck (computed and passed in via
  // options.pitchDeckReferences).
  const pitchSection = buildPitchDeckSection(options.pitchDeckReferences ?? []);
  if (pitchSection) {
    lines.push("", pitchSection);
  }

  return lines.join("\n");
}

function buildPitchDeckSection(refs: PitchDeckReferenceRow[]): string {
  if (refs.length === 0) return "";
  const lines: string[] = [
    "COMPARABLE PITCH DECKS",
    "",
    "These are real, funded pitch decks from VC-backed startups. The founder",
    "has uploaded their own deck to this project — these references give you",
    "comparable examples to ground your feedback. When commenting on the",
    "founder's positioning, narrative, ask size, or stage-appropriate scope,",
    "anchor in concrete patterns from these comparables rather than generic",
    "pitch advice.",
    "",
  ];
  for (const r of refs) {
    const stage = r.fundingRound ? r.fundingRound.replace(/-/g, " ") : "unknown stage";
    const amount = r.fundingAmount ? ` · raised $${r.fundingAmount}` : "";
    lines.push(
      `— ${r.companyName} (${stage}${amount})`,
      `  ${r.description}`,
    );
  }
  return lines.join("\n");
}

/**
 * Sprint 5 — build the "INSIGHTS FROM REAL CISO TALKS" section.
 * Returns "" if no insights apply to this agent (AC: no empty header).
 *
 * Scoring (additive):
 *   +5  UNIVERSAL routing scope
 *   +6  TARGETED + industry match against this agent
 *   +4  TARGETED + region match against this agent
 *   +3  TARGETED + any applicableThreatType matches questionThreats
 */
function buildInsightsSection(
  insights: BriefingInsightRow[],
  agent: BriefingPersona,
  questionThreats: ThreatType[],
): string {
  if (insights.length === 0) return "";
  const agentIndustry = agent.industry?.trim() ?? "";
  const questionThreatSet = new Set<string>(questionThreats);

  const scored = insights
    .map((i) => {
      let score = 0;
      if (i.routingScope === "UNIVERSAL") {
        score += 5;
      } else {
        // TARGETED — at least one tag dimension should match to score
        if (
          agentIndustry &&
          i.applicableIndustries.some(
            (x) => x.trim().toLowerCase() === agentIndustry.toLowerCase(),
          )
        ) {
          score += 6;
        }
        if (i.applicableRegions.includes(agent.region)) {
          score += 4;
        }
        if (
          questionThreatSet.size > 0 &&
          i.applicableThreatTypes.some((t) => questionThreatSet.has(t))
        ) {
          score += 3;
        }
      }
      return { ins: i, score };
    })
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return "";

  const lines: string[] = [
    "INSIGHTS FROM REAL CISO TALKS (observed patterns from named practitioners;",
    "cite their specific positions when relevant; reuse their vocabulary):",
    "",
  ];
  let count = 0;
  for (const { ins } of scored) {
    if (count >= MAX_INSIGHTS_PER_BRIEFING) break;
    const text = ins.insightText.slice(0, PER_INSIGHT_CHARS);
    const vocab =
      ins.vocabularyAnchors.length > 0
        ? `  (phrases: ${ins.vocabularyAnchors.slice(0, 4).map((v) => `"${v}"`).join(", ")})`
        : "";
    lines.push(`— ${ins.speakerName} (${ins.speakerIndustry}, ${ins.speakerRegion}): ${text}${vocab}`);
    count += 1;
  }
  return lines.join("\n");
}

/**
 * Render the distilled card as prompt-friendly markdown. Returns null if
 * the value isn't a recognised card shape — caller falls back to raw
 * content slicing.
 */
function formatDistilled(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  switch (v.kind) {
    case "project": {
      const lines: string[] = [];
      pushField(lines, "Product", v.productName);
      pushField(lines, "Problem", v.problemStatement);
      pushField(lines, "Solution", v.solution);
      pushField(lines, "ICP", v.icp);
      pushField(lines, "GTM", v.gtm);
      pushField(lines, "Moat", v.competitiveMoat);
      pushField(lines, "Pricing", v.pricing);
      pushField(lines, "Traction", v.traction);
      pushList(lines, "Key assertions", v.keyAssertions);
      pushList(lines, "Open questions", v.openQuestions);
      return lines.length > 0 ? lines.join("\n") : null;
    }
    case "firm": {
      const lines: string[] = [];
      pushField(lines, "TL;DR", v.tldr);
      pushList(lines, "Key findings", v.keyFindings);
      pushList(lines, "Applicable regions", v.applicableRegions);
      pushList(lines, "Applicable categories", v.applicableQuestionCategories);
      pushList(lines, "Statistical citations", v.statisticalCitations);
      return lines.length > 0 ? lines.join("\n") : null;
    }
    case "framework": {
      const lines: string[] = [];
      pushField(lines, "Framework", v.frameworkName);
      pushField(lines, "Function", v.function);
      pushField(lines, "Scope", v.scope);
      pushList(lines, "Control IDs", v.controlIds);
      pushList(lines, "Applicable industries", v.applicableIndustries);
      if (Array.isArray(v.keyControls) && v.keyControls.length > 0) {
        lines.push("  Key controls:");
        for (const kc of v.keyControls) {
          if (kc && typeof kc === "object") {
            const e = kc as Record<string, unknown>;
            const id = typeof e.id === "string" ? e.id : "";
            const desc = typeof e.description === "string" ? e.description : "";
            if (id || desc) lines.push(`    - ${id ? `${id}: ` : ""}${desc}`);
          }
        }
      }
      return lines.length > 0 ? lines.join("\n") : null;
    }
    case "regulation": {
      const lines: string[] = [];
      pushField(lines, "Regulation", v.regulationName);
      pushList(lines, "Jurisdiction", v.jurisdiction);
      pushList(lines, "Applicable industries", v.applicableIndustries);
      pushList(lines, "Key obligations", v.keyObligations);
      pushList(lines, "Deadlines", v.deadlines);
      pushField(lines, "Penalty framework", v.penaltyFramework);
      return lines.length > 0 ? lines.join("\n") : null;
    }
    case "vendor": {
      const lines: string[] = [];
      pushField(lines, "Product", v.productName);
      pushField(lines, "Category", v.category);
      pushList(lines, "Capabilities", v.capabilities);
      pushField(lines, "Pricing tier", v.pricingTier);
      pushList(lines, "Integrations", v.integrations);
      pushField(lines, "Market position", v.marketPosition);
      pushField(lines, "Primary critique", v.primaryCritique);
      pushList(lines, "Alternatives to consider", v.alternativesToConsider);
      return lines.length > 0 ? lines.join("\n") : null;
    }
    default:
      return null;
  }
}

function perSourceCapFor(
  projectId: string | null,
  distilled: unknown,
): number {
  if (projectId) return PER_SOURCE_CHARS_PROJECT;
  if (distilled && typeof distilled === "object") {
    const k = (distilled as Record<string, unknown>).kind;
    if (k === "framework") return PER_SOURCE_CHARS_FRAMEWORK;
    if (k === "regulation") return PER_SOURCE_CHARS_REGULATION;
    if (k === "vendor") return PER_SOURCE_CHARS_VENDOR;
  }
  return PER_SOURCE_CHARS_FIRM;
}

function pushField(lines: string[], label: string, value: unknown) {
  if (typeof value !== "string" || !value.trim()) return;
  lines.push(`  ${label}: ${value.trim()}`);
}

function pushList(lines: string[], label: string, value: unknown) {
  if (!Array.isArray(value) || value.length === 0) return;
  const items = value.filter((x): x is string => typeof x === "string" && x.trim().length > 0);
  if (items.length === 0) return;
  lines.push(`  ${label}:`);
  for (const item of items) {
    lines.push(`    - ${item.trim()}`);
  }
}

/**
 * Relevance score. Higher = surfaces earlier in the agent's briefing.
 *  +10  project-scoped (pitch deck / company site / specific report —
 *       always outranks firm-wide briefing material)
 *   +5  source.region matches agent.region exactly
 *   +4  source.applicableIndustries contains agent.industry (Sprint 4)
 *   +3  source.applicableFrameworks overlaps agent.industry's typical
 *       framework set (Sprint 4; see lib/sources/framework-fit.ts)
 *   +2  source is global / unspecified region (broadly applicable)
 *   +1  source is a regulator / cert / threat-intel (operational signal)
 *   +0  source.region differs from agent.region (no demotion for
 *       industry/framework non-match — Sprint 4 design call)
 */
function scoreSource(s: BriefingSourceRow, agent: BriefingPersona): number {
  let score = 0;
  if (s.projectId) score += 10;
  if (s.region && s.region === agent.region) score += 5;
  else if (!s.region || s.region === "global") score += 2;
  if (agent.industry && Array.isArray(s.applicableIndustries)) {
    const industries = s.applicableIndustries as unknown[];
    const target = agent.industry.trim().toLowerCase();
    if (
      industries.some(
        (i) => typeof i === "string" && i.trim().toLowerCase() === target,
      )
    ) {
      score += 4;
    }
  }
  if (
    Array.isArray(s.applicableFrameworks) &&
    frameworksOverlap(s.applicableFrameworks as string[], agent.industry)
  ) {
    score += 3;
  }
  if (
    s.category === "regulator" ||
    s.category === "cert" ||
    s.category === "threat-intel"
  ) {
    score += 1;
  }
  return score;
}
