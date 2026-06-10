// SPDX-License-Identifier: AGPL-3.0-or-later
import type Anthropic from "@anthropic-ai/sdk";
import { renderAskHistorySection } from "./ask-history";
import type { AgenticPersona } from "@/lib/personas/generate100";
import {
  buildBriefingForAgent,
  loadEnabledSources,
  loadEnabledInsightsForFirm,
  loadAndRankPitchDeckReferences,
  isPitchShapedQuestion,
  projectHasPitchDeck,
  type PitchDeckReferenceRow,
} from "@/lib/sources/briefing";
import { ANTHROPIC_MODELS } from "@/lib/anthropic/models";
import { incrementPersona, startProgress } from "./progress";
import { loadProjectAgents, type RuntimePersona } from "@/lib/projects/load-agents";
import { classifyQuestionThreatTypes } from "@/lib/canon";

// Sprint 5 — caps for persona-prompt depth sections. AC: render only
// the 12 most-recent + most-relevant opinions to keep prompt size bounded.
const MAX_OPINIONS_IN_PROMPT = 12;
const MAX_VOCAB_IN_PROMPT = 10;

// Sprint 9.1 — Anthropic 429 retry knobs. Without backoff, Tier 1 users
// hit rate limits at the new Tier 2 defaults and the affected personas
// silently turn into apiError rows in the panel response. With backoff,
// Tier 1 just runs slower — every persona still lands.
const MAX_429_RETRIES = 3;
const BASE_429_DELAY_MS = 2000;

/**
 * Fan out one natural-language question to all 100 agentic CISO personas
 * AND aggregate the results into a structured summary.
 *
 * Each persona is prompted to return strict JSON. We parse it, fall back
 * to a neutral verdict if malformed, compute pro/con/sentiment aggregates
 * locally, then surface both per-response detail and panel-wide stats.
 *
 * One bad call (network, JSON parse) never aborts the panel —
 * Promise.allSettled keeps the other 99 running.
 */

export type Verdict = "pro" | "con" | "neutral";

export interface PanelResponse {
  index: number;
  agentKey: string;
  name: string;
  region: string;
  industry: string;
  companySize: string;
  tenure: string;
  stance: AgenticPersona["stance"];
  verdict: Verdict;
  sentiment: number;
  headline: string;
  reasoning: string;
  rawText: string | null;
  parseError: boolean;
  apiError: string | null;
  inputTokens: number;
  outputTokens: number;
}

export interface PanelAggregates {
  proCount: number;
  conCount: number;
  neutralCount: number;
  proPct: number;
  conPct: number;
  neutralPct: number;
  sentimentMean: number;
  sentimentStdDev: number;
  spreadLabel: "tight consensus" | "moderate spread" | "wide spread";
  byRegion: Record<string, { pro: number; con: number; neutral: number }>;
  byIndustry: Record<string, { pro: number; con: number; neutral: number }>;
  byStance: Record<string, { pro: number; con: number; neutral: number }>;
  parseFailures: number;
  apiFailures: number;
}

export interface PanelResult {
  responses: PanelResponse[];
  aggregates: PanelAggregates;
  totalInputTokens: number;
  totalOutputTokens: number;
  durationMs: number;
}

const MODEL = ANTHROPIC_MODELS.panel;

// Tier 1 Anthropic keys cap at ~50 RPM. Firing all 100 calls simultaneously
// means most get 429s. Two levers keep us under the cap:
//
//   1. PANEL_CONCURRENCY (default 4) caps how many calls are in flight at
//      once. Lower = slower, safer.
//   2. PANEL_MIN_DISPATCH_INTERVAL_MS (default 1500ms) enforces a minimum
//      gap between *starts*. With short responses, concurrency alone isn't
//      enough — fast returns would burst above 50 RPM. 1500ms ⇒ ~40 starts
//      per minute, comfortably under Tier 1.
//
// Defaults tuned for Anthropic Tier 2 (1000 RPM) — the standard ceiling
// for any account that's had real spend. Tier 1 (50 RPM, fresh accounts)
// users should override via env to PRINCIPE_PANEL_CONCURRENCY=4 +
// PRINCIPE_PANEL_MIN_DISPATCH_INTERVAL_MS=1500 to avoid 429s. Tier 3+
// can go faster (concurrency=24, interval=0).
const PANEL_CONCURRENCY = Math.max(
  1,
  Number(process.env.PRINCIPE_PANEL_CONCURRENCY) || 12,
);
const PANEL_MIN_DISPATCH_INTERVAL_MS = Math.max(
  0,
  Number(process.env.PRINCIPE_PANEL_MIN_DISPATCH_INTERVAL_MS) || 250,
);

/**
 * Classify an Anthropic failure. A failure is "fatal" when retrying or trying
 * other personas can't help — a bad key, no credit, a permission/model issue.
 * Those are deterministic across all ~100 calls, so the circuit breaker aborts
 * the fan-out on the FIRST one instead of waiting minutes for every call to
 * fail identically. Transient ones (429/5xx/network) are not fatal.
 */
export interface ClassifiedAnthropicError {
  fatal: boolean;
  code:
    | "auth" | "credit" | "permission" | "model" | "bad_request"
    | "rate_limit" | "overloaded" | "server" | "network" | "unknown";
  httpStatus: number; // suggested status for the /api/ask response
  userMessage: string;
}

export function classifyAnthropicError(e: unknown): ClassifiedAnthropicError {
  const status =
    typeof (e as { status?: unknown })?.status === "number"
      ? (e as { status: number }).status
      : 0;
  const raw = e instanceof Error ? e.message : String(e ?? "");
  const m = raw.toLowerCase();
  // Credit/billing first, matched by message — the status varies (400/403),
  // and `models.list()` (used by the setup/settings key check) never trips it,
  // so a real messages.create call is the only place this surfaces.
  if (
    m.includes("credit balance is too low") ||
    m.includes("plans & billing") ||
    m.includes("purchase credits")
  ) {
    return {
      fatal: true, code: "credit", httpStatus: 402,
      userMessage:
        "Your Anthropic account is out of credit. Add credit in the Anthropic console (Plans & Billing), then try again.",
    };
  }
  if (
    status === 401 || m.includes("authentication") ||
    m.includes("invalid x-api-key") || m.includes("invalid api key")
  ) {
    return {
      fatal: true, code: "auth", httpStatus: 401,
      userMessage:
        "Anthropic rejected the API key (authentication failed). Update it in Settings.",
    };
  }
  if (status === 403) {
    return {
      fatal: true, code: "permission", httpStatus: 403,
      userMessage:
        "This API key isn't permitted to use the panel model — check its permissions in the Anthropic console.",
    };
  }
  if (status === 404) {
    return {
      fatal: true, code: "model", httpStatus: 502,
      userMessage: "The configured Claude model isn't available to this API key.",
    };
  }
  if (status === 400) {
    return {
      fatal: true, code: "bad_request", httpStatus: 400,
      userMessage: `Anthropic rejected the request: ${raw.slice(0, 140)}`,
    };
  }
  if (status === 429) {
    return {
      fatal: false, code: "rate_limit", httpStatus: 429,
      userMessage:
        "Anthropic rate-limited the panel. Try again shortly, or lower PRINCIPE_PANEL_CONCURRENCY.",
    };
  }
  if (status === 529) {
    return {
      fatal: false, code: "overloaded", httpStatus: 503,
      userMessage: "Anthropic is overloaded right now — try again in a moment.",
    };
  }
  if (status >= 500) {
    return {
      fatal: false, code: "server", httpStatus: 502,
      userMessage: "Anthropic returned a server error — try again shortly.",
    };
  }
  return {
    fatal: false, code: status === 0 ? "network" : "unknown", httpStatus: 502,
    userMessage: `Couldn't reach Anthropic: ${raw.slice(0, 140)}`,
  };
}

/**
 * Thrown by runPanelAsk when the fan-out is aborted early because the panel
 * cannot succeed (a fatal error, or a burst of failures with no successes).
 * Carries a user-facing message + how many calls were attempted before bailing.
 */
export class PanelAbortedError extends Error {
  constructor(
    public readonly classified: ClassifiedAnthropicError,
    public readonly attempted: number,
  ) {
    super(classified.userMessage);
    this.name = "PanelAbortedError";
  }
}

/** With zero successes, this many failures means the API is systemically down
 *  (outage/overload) — bail instead of grinding through all ~100 personas. */
const EARLY_ABORT_FAILURES = 6;

export async function runPanelAsk(
  question: string,
  client: Anthropic,
  firmId: string,
  projectId: string,
): Promise<PanelResult> {
  const personas = await loadProjectAgents(projectId);
  const sources = await loadEnabledSources(firmId, projectId);
  // Sprint 5 — load enabled CISO-talk insights once per panel run.
  // Single firm-scoped query; routing happens per agent in the builder.
  const insights = await loadEnabledInsightsForFirm(firmId);
  // Sprint 5.5 — pitch-deck references load only when both conditions
  // hold: project has a deck source AND the question is pitch-shaped.
  // Computed once per panel run, passed to every agent's briefing.
  let pitchDeckReferences: PitchDeckReferenceRow[] = [];
  if (isPitchShapedQuestion(question) && projectHasPitchDeck(sources)) {
    const deckSource = sources.find(
      (s) =>
        s.projectId &&
        /\bdeck\b|\bpitch\b/i.test(`${s.title ?? ""} ${s.filename ?? ""}`),
    );
    const userDeckText = deckSource?.content ?? "";
    pitchDeckReferences = await loadAndRankPitchDeckReferences(
      firmId,
      userDeckText,
      8,
    );
  }
  const questionThreats = classifyQuestionThreatTypes(question);
  const startedAt = Date.now();

  startProgress(firmId, personas.length);

  // Circuit breaker: abort the whole fan-out the moment it's clear the panel
  // can't succeed — a fatal error (bad key, no credit, permission/model) on
  // ANY call, or a burst of failures with zero successes (API outage). Turns a
  // multi-minute wait-for-all-100-to-fail into a couple of seconds.
  const controller = new AbortController();
  let successes = 0;
  let failures = 0;
  let abortInfo: ClassifiedAnthropicError | null = null;

  const settled = await runWithConcurrency(
    personas,
    PANEL_CONCURRENCY,
    (p, signal) =>
      askOne(
        p,
        question,
        client,
        buildBriefingForAgent(
          sources,
          { region: p.region, industry: p.industry },
          { insights, question, pitchDeckReferences },
        ),
        questionThreats,
        signal,
      ),
    (result, _i, ctrl) => {
      incrementPersona(firmId, result.status === "rejected");
      if (result.status === "fulfilled") {
        successes++;
        return;
      }
      if (ctrl.signal.aborted) return; // our own cancellation, not a real failure
      failures++;
      const cls = classifyAnthropicError(result.reason);
      if (
        !abortInfo &&
        (cls.fatal || (successes === 0 && failures >= EARLY_ABORT_FAILURES))
      ) {
        abortInfo = cls;
        ctrl.abort();
      }
    },
    PANEL_MIN_DISPATCH_INTERVAL_MS,
    controller,
  );

  // Nothing useful can come back — surface the specific reason fast instead of
  // returning a panel of 100 identical failures.
  if (abortInfo) {
    throw new PanelAbortedError(abortInfo, successes + failures);
  }

  let totalInput = 0;
  let totalOutput = 0;
  const responses: PanelResponse[] = settled.map((r, i) => {
    const p = personas[i];
    const base = {
      index: i,
      agentKey: p.key,
      name: p.name,
      region: p.region,
      industry: p.industry,
      companySize: p.companySize,
      tenure: p.tenure,
      stance: p.stance,
    };
    if (r.status === "rejected") {
      return {
        ...base,
        verdict: "neutral" as const,
        sentiment: 5,
        headline: "[response failed]",
        reasoning: "",
        rawText: null,
        parseError: false,
        apiError: r.reason instanceof Error ? r.reason.message.slice(0, 200) : "unknown",
        inputTokens: 0,
        outputTokens: 0,
      };
    }
    totalInput += r.value.inputTokens;
    totalOutput += r.value.outputTokens;
    const parsed = parseStructured(r.value.text);
    return {
      ...base,
      verdict: parsed.verdict,
      sentiment: parsed.sentiment,
      headline: parsed.headline,
      reasoning: parsed.reasoning,
      rawText: r.value.text,
      parseError: parsed.parseError,
      apiError: null,
      inputTokens: r.value.inputTokens,
      outputTokens: r.value.outputTokens,
    };
  });

  const aggregates = computeAggregates(responses);
  const durationMs = Date.now() - startedAt;

  // One-line server-side log so the dev console reflects panel health.
  console.log(
    `[panel] ${responses.length - aggregates.apiFailures - aggregates.parseFailures}/${responses.length} ok` +
      ` · ${aggregates.apiFailures} api · ${aggregates.parseFailures} parse` +
      ` · ${(durationMs / 1000).toFixed(1)}s` +
      ` · ${totalInput.toLocaleString()} in / ${totalOutput.toLocaleString()} out`,
  );
  if (aggregates.apiFailures > responses.length * 0.2) {
    const sample = responses
      .filter((r) => r.apiError)
      .slice(0, 3)
      .map((r) => `${r.name}: ${r.apiError}`)
      .join("  |  ");
    console.warn(`[panel] high api-failure rate. sample: ${sample}`);
  }

  return {
    responses,
    aggregates,
    totalInputTokens: totalInput,
    totalOutputTokens: totalOutput,
    durationMs,
  };
}

interface ParsedResponse {
  verdict: Verdict;
  sentiment: number;
  headline: string;
  reasoning: string;
  parseError: boolean;
}

export function parseStructured(text: string): ParsedResponse {
  // Try strict parse first.
  const candidate = extractJsonBlock(text);
  if (candidate) {
    const parsed = tryParseObject(candidate);
    if (parsed) return parsed;
  }

  // Sprint 6 fallback: the response was probably truncated mid-string
  // (LLM hit max_tokens before closing the JSON) OR was wrapped in
  // unexpected markdown structure. Salvage verdict / headline /
  // reasoning via regex from the partial text instead of dumping the
  // raw JSON into the UI fields.
  const salvaged = salvageFromPartialJson(text);
  return {
    verdict: salvaged.verdict,
    sentiment: salvaged.sentiment,
    headline: salvaged.headline || "[response was truncated]",
    reasoning: salvaged.reasoning || "[the model's response was malformed; see the raw text in the export if needed]",
    parseError: true,
  };
}

function tryParseObject(candidate: string): ParsedResponse | null {
  try {
    const obj = JSON.parse(candidate) as Record<string, unknown>;
    const verdict = normaliseVerdict(obj.verdict);
    const sentimentRaw = Number(obj.sentiment);
    const sentiment =
      Number.isFinite(sentimentRaw) && sentimentRaw >= 1 && sentimentRaw <= 10
        ? Math.round(sentimentRaw)
        : 5;
    return {
      verdict,
      sentiment,
      headline:
        typeof obj.headline === "string"
          ? obj.headline.slice(0, 220)
          : "[no headline]",
      reasoning:
        typeof obj.reasoning === "string"
          ? obj.reasoning.slice(0, 800)
          : "",
      parseError: false,
    };
  } catch {
    return null;
  }
}

/**
 * Sprint 6 — strip markdown code fences + try to repair truncated JSON
 * before handing off to JSON.parse. Models sometimes ignore the
 * "no code fences" instruction and sometimes get cut off mid-string by
 * max_tokens. Both produce parse failures that we can recover from.
 */
function extractJsonBlock(text: string): string | null {
  let s = text.trim();

  // Strip markdown code fence wrapper if present (```json ... ``` or
  // ``` ... ```). Handle the rare double-fence case from the screenshot
  // by stripping repeatedly.
  while (true) {
    const fenceStart = s.match(/^```(?:json)?\s*\n/i);
    if (!fenceStart) break;
    s = s.slice(fenceStart[0].length).trimStart();
  }
  s = s.replace(/\n```\s*$/, "").trim();

  // Direct shape — full object.
  if (s.startsWith("{") && s.endsWith("}")) return s;

  // Find the outermost {...} via brace balance (handles nested braces
  // in strings better than a greedy regex would).
  const start = s.indexOf("{");
  if (start === -1) return null;
  let depth = 0;
  let end = -1;
  let inString = false;
  let escaped = false;
  for (let i = start; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (ch === "{") depth += 1;
    else if (ch === "}") {
      depth -= 1;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }
  if (end !== -1) return s.slice(start, end + 1);

  // Truncated JSON — try to repair by closing the open string + braces.
  let repaired = s.slice(start);
  if (inString) {
    // Close the dangling string. The truncation almost certainly hit
    // mid-word in the `reasoning` field; appending a quote preserves
    // the partial reasoning text.
    repaired += '"';
  }
  // Add the matching number of closing braces.
  for (let i = 0; i < depth; i++) repaired += "}";
  return repaired;
}

/**
 * Sprint 6 — last-resort salvage when even the repaired JSON won't
 * parse. Pull verdict / headline / sentiment / reasoning via regex from
 * the partial text so the UI shows useful content instead of a wall of
 * raw JSON.
 */
function salvageFromPartialJson(text: string): {
  verdict: Verdict;
  sentiment: number;
  headline: string;
  reasoning: string;
} {
  const verdictMatch = text.match(/"verdict"\s*:\s*"([^"]+)"/i);
  const sentimentMatch = text.match(/"sentiment"\s*:\s*(\d+)/);
  const headlineMatch = text.match(/"headline"\s*:\s*"([^"]*?)"/);
  // For reasoning we accept either a closed string or a partial string
  // (truncation cut off the closing quote).
  const reasoningMatch =
    text.match(/"reasoning"\s*:\s*"([\s\S]*?)"\s*[},]/) ||
    text.match(/"reasoning"\s*:\s*"([\s\S]*)$/);

  const sentRaw = sentimentMatch ? Number(sentimentMatch[1]) : NaN;
  return {
    verdict: normaliseVerdict(verdictMatch?.[1] ?? ""),
    sentiment:
      Number.isFinite(sentRaw) && sentRaw >= 1 && sentRaw <= 10
        ? Math.round(sentRaw)
        : 5,
    headline: (headlineMatch?.[1] ?? "").slice(0, 220),
    reasoning: (reasoningMatch?.[1] ?? "").slice(0, 800),
  };
}

function normaliseVerdict(v: unknown): Verdict {
  if (typeof v !== "string") return "neutral";
  const lower = v.toLowerCase().trim();
  if (lower === "pro" || lower === "yes" || lower === "positive") return "pro";
  if (lower === "con" || lower === "no" || lower === "negative") return "con";
  return "neutral";
}

export function computeAggregates(responses: PanelResponse[]): PanelAggregates {
  const total = responses.length;
  let pro = 0,
    con = 0,
    neutral = 0;
  let parseFailures = 0,
    apiFailures = 0;
  const sentiments: number[] = [];
  const byRegion: Record<string, { pro: number; con: number; neutral: number }> = {};
  const byIndustry: Record<string, { pro: number; con: number; neutral: number }> = {};
  const byStance: Record<string, { pro: number; con: number; neutral: number }> = {};

  for (const r of responses) {
    if (r.apiError) {
      apiFailures++;
      continue;
    }
    if (r.parseError) parseFailures++;
    sentiments.push(r.sentiment);
    if (r.verdict === "pro") pro++;
    else if (r.verdict === "con") con++;
    else neutral++;
    bump(byRegion, r.region, r.verdict);
    bump(byIndustry, r.industry, r.verdict);
    bump(byStance, r.stance, r.verdict);
  }

  const mean =
    sentiments.length > 0
      ? sentiments.reduce((a, b) => a + b, 0) / sentiments.length
      : 5;
  const variance =
    sentiments.length > 0
      ? sentiments.reduce((acc, s) => acc + (s - mean) * (s - mean), 0) /
        sentiments.length
      : 0;
  const stdDev = Math.sqrt(variance);
  const spreadLabel: PanelAggregates["spreadLabel"] =
    stdDev < 1.2
      ? "tight consensus"
      : stdDev < 2.2
        ? "moderate spread"
        : "wide spread";

  return {
    proCount: pro,
    conCount: con,
    neutralCount: neutral,
    proPct: total > 0 ? Math.round((pro / total) * 100) : 0,
    conPct: total > 0 ? Math.round((con / total) * 100) : 0,
    neutralPct: total > 0 ? Math.round((neutral / total) * 100) : 0,
    sentimentMean: Number(mean.toFixed(2)),
    sentimentStdDev: Number(stdDev.toFixed(2)),
    spreadLabel,
    byRegion,
    byIndustry,
    byStance,
    parseFailures,
    apiFailures,
  };
}

function bump(
  acc: Record<string, { pro: number; con: number; neutral: number }>,
  key: string,
  verdict: Verdict,
) {
  if (!acc[key]) acc[key] = { pro: 0, con: 0, neutral: 0 };
  acc[key][verdict] += 1;
}

/**
 * Process `items` with at most `concurrency` workers in flight, AND a
 * minimum gap between dispatch starts (token-bucket style). Returns one
 * PromiseSettledResult per input, in input order, matching Promise.allSettled
 * so the caller's downstream code is unchanged.
 *
 * The dispatch interval matters because concurrency alone doesn't bound
 * RPM: fast responses re-fill the pool faster than the API allows. The
 * interval enforces a hard floor on time-between-starts globally across
 * workers.
 */
async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  worker: (item: T, signal: AbortSignal) => Promise<R>,
  onSettle?: (
    result: PromiseSettledResult<R>,
    index: number,
    controller: AbortController,
  ) => void,
  minDispatchIntervalMs = 0,
  controller: AbortController = new AbortController(),
): Promise<PromiseSettledResult<R>[]> {
  const results: PromiseSettledResult<R>[] = new Array(items.length);
  let cursor = 0;
  let nextDispatchAt = Date.now();

  async function acquire(): Promise<void> {
    if (minDispatchIntervalMs <= 0) return;
    const now = Date.now();
    const waitMs = Math.max(0, nextDispatchAt - now);
    nextDispatchAt = Math.max(now, nextDispatchAt) + minDispatchIntervalMs;
    if (waitMs > 0) {
      await new Promise<void>((r) => setTimeout(r, waitMs));
    }
  }

  async function pump() {
    while (true) {
      if (controller.signal.aborted) return;
      const i = cursor++;
      if (i >= items.length) return;
      await acquire();
      if (controller.signal.aborted) return;
      try {
        const value = await worker(items[i], controller.signal);
        results[i] = { status: "fulfilled", value };
      } catch (reason) {
        results[i] = { status: "rejected", reason };
      }
      onSettle?.(results[i], i, controller);
    }
  }
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    pump,
  );
  await Promise.all(runners);
  // Early-abort leaves trailing items unprocessed — backfill so callers that
  // map over the array never hit `undefined`. (runPanelAsk throws on a real
  // abort before reaching its own map, but stay defensive.)
  for (let i = 0; i < items.length; i++) {
    if (!results[i]) {
      results[i] = { status: "rejected", reason: new Error("cancelled") };
    }
  }
  return results;
}

async function askOne(
  persona: RuntimePersona,
  question: string,
  client: Anthropic,
  briefing: string,
  questionThreats: string[] = [],
  signal?: AbortSignal,
): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
  // Sprint 5 — inject persona depth sections from coreOpinions +
  // signatureVocabulary. These sit between the base systemPrompt and
  // the briefing so the agent reads "who you are + what you believe"
  // before the situational intelligence for this question.
  const depthSection = buildPersonaDepthSection(persona, questionThreats);
  // Sprint 9.1 — recent ask history. Lets the persona stay consistent
  // across questions AND evolve when new evidence warrants.
  const historySection = renderAskHistorySection(persona.askHistory);

  const sections = [persona.systemPrompt, depthSection, historySection].filter(
    (s) => s && s.length > 0,
  );
  const head = sections.join("\n\n");
  const base = briefing ? `${head}\n\n${briefing}` : head;
  // Final, emphatic format + brevity rule. Placed LAST so it's the most
  // salient instruction to the model, and appended at ask time so it applies
  // to every project — including agents materialised before this rule existed.
  // Keeps each response short enough to finish valid JSON inside max_tokens
  // and suppresses prose preambles/refusals that break the parser.
  const system = `${base}\n\nRESPONSE FORMAT — STRICT: Reply AS this persona with ONLY the single JSON object you were instructed to produce (verdict, sentiment, headline, reasoning) — nothing before or after it, no code fences, no preamble, no plain prose. Even if the question is open-ended, vague, a direct query, or not a product pitch, still answer in character with a real verdict and reasoning — NEVER refuse, never reply that you only evaluate pitches, never break format. Keep "reasoning" to 2-3 short sentences (~50 words maximum); be decisive, not exhaustive.`;
  const res = await callAnthropicWithBackoff(client, system, question, signal);
  // We prefilled the assistant turn with "{" (see callAnthropicWithBackoff) to
  // force JSON; the API returns only the continuation, so prepend it back to
  // reconstruct the full object before the parser sees it.
  const continuation = res.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("");
  const text = `{${continuation}`.trim();
  return {
    text,
    inputTokens: res.usage.input_tokens,
    outputTokens: res.usage.output_tokens,
  };
}

async function callAnthropicWithBackoff(
  client: Anthropic,
  system: string,
  question: string,
  signal?: AbortSignal,
): Promise<Anthropic.Messages.Message> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    try {
      return await client.messages.create({
        model: MODEL,
        // The persona prompt + the ask-time rule ask for a small JSON (verdict
        // + sentiment + 18-word headline + 2-3 sentences). 320 was too tight:
        // an overrun cut the JSON off mid-`reasoning`, failed to parse, and
        // degraded to a neutral "[response was truncated]" fallback. max_tokens
        // is a CAP, not a target — compliant short responses still stop early
        // and cost the same; this just buys headroom so the rare overrun still
        // finishes valid JSON instead of being lost.
        max_tokens: 700,
        system,
        // Prefill the assistant turn with "{" so the model MUST continue as
        // JSON — this hard-blocks the prose refusals ("I only evaluate founder
        // pitches…") that the defensive parser can only flag as malformed. The
        // returned text omits the prefilled "{"; the caller prepends it back.
        messages: [
          { role: "user", content: question },
          { role: "assistant", content: "{" },
        ],
      }, { signal });
    } catch (e) {
      lastErr = e;
      // The circuit breaker aborted the fan-out — stop now, don't retry.
      if (signal?.aborted) throw e;
      // Anthropic SDK exposes .status on its APIError class. 429 is
      // the only retriable case here — 4xx other than 429 is a client
      // bug we shouldn't paper over with retries.
      const status =
        typeof (e as { status?: unknown })?.status === "number"
          ? (e as { status: number }).status
          : 0;
      if (status !== 429 || attempt === MAX_429_RETRIES) throw e;
      // Exponential backoff with jitter: 2s, 4s, 8s + up to 1s jitter.
      const delay =
        BASE_429_DELAY_MS * Math.pow(2, attempt) + Math.floor(Math.random() * 1000);
      await new Promise((r) => setTimeout(r, delay));
    }
  }
  throw lastErr;
}

/**
 * Sprint 5 — build the persona-depth section injected into the agent's
 * system prompt. Empty string when the persona has no transcript-derived
 * opinions/vocabulary (AC: no empty placeholders).
 *
 * Ranking:
 *   - Opinions whose `applicableThreatTypes` intersect with the question's
 *     classified threats score higher.
 *   - Within a score tier, more recent (by createdAt) wins.
 *   - Cap at MAX_OPINIONS_IN_PROMPT (12 per AC).
 */
function buildPersonaDepthSection(
  persona: RuntimePersona,
  questionThreats: string[],
): string {
  if (persona.coreOpinions.length === 0 && persona.signatureVocabulary.length === 0) {
    return "";
  }
  const threatSet = new Set(questionThreats);
  const ranked = [...persona.coreOpinions]
    .map((op) => {
      const relevance = op.applicableThreatTypes.some((t) => threatSet.has(t))
        ? 1
        : 0;
      const ts = Date.parse(op.createdAt) || 0;
      return { op, relevance, ts };
    })
    .sort((a, b) => {
      if (a.relevance !== b.relevance) return b.relevance - a.relevance;
      return b.ts - a.ts;
    })
    .slice(0, MAX_OPINIONS_IN_PROMPT)
    .map((x) => x.op);

  const lines: string[] = [];
  if (ranked.length > 0) {
    lines.push(
      "YOUR ESTABLISHED POSITIONS (from CISO talks that shaped this persona — these are commitments you've made publicly; reason from them):",
    );
    for (const op of ranked) {
      lines.push(`- [${op.topic}] ${op.position}`);
    }
  }
  const vocab = persona.signatureVocabulary.slice(0, MAX_VOCAB_IN_PROMPT);
  if (vocab.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push("PHRASES YOU USE (reuse this vocabulary where natural):");
    lines.push(vocab.map((v) => `"${v}"`).join(", "));
  }
  return lines.join("\n");
}

// Quiet the unused import warning if AgenticPersona is not directly
// referenced anywhere else in this file (RuntimePersona extends it).
void ({} as AgenticPersona | undefined);
