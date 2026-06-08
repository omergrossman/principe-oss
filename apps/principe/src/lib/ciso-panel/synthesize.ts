// SPDX-License-Identifier: AGPL-3.0-or-later
import type Anthropic from "@anthropic-ai/sdk";
import type { PanelResponse, PanelAggregates } from "./ask";
import { ANTHROPIC_MODELS } from "@/lib/anthropic/models";

/**
 * One synthesis call that turns the 100 structured responses into an
 * executive summary — what a VC or founder should walk away with.
 *
 * Inputs: the question + 100 PanelResponses + aggregate stats.
 * Output: { summary, topPros[], topCons[], insights[] } — the structured
 *         payload the dashboard renders.
 */

export interface ThemeCluster {
  title: string;
  description: string;
  // Agent names from the LLM, ONLY used server-side for verdictMix
  // computation. Never rendered in the UI or exports — the user-facing
  // attribute breakdown lives in `segments`.
  supportingAgents: string[];
  // Computed server-side from the lookup: pro/con/neutral within the theme.
  verdictMix: { pro: number; con: number; neutral: number; total: number };
  // Sprint 7 — human-readable attribute breakdown of the cluster:
  // top regions and top industries by count. Replaces the names line
  // in the UI so we never show synthetic agent names to readers.
  segments: { regions: string[]; industries: string[]; stances: string[] };
}

export interface ExecSummary {
  summary: string;
  topPros: string[];
  topCons: string[];
  insights: { title: string; reasoning: string }[];
  // Sprint 7 — "Strongest signals" section. LLM provides title +
  // description + supporting agent names; verdictMix is computed
  // server-side from the actual responses for reliability.
  themes: ThemeCluster[];
  inputTokens: number;
  outputTokens: number;
  durationMs: number;
}

const SYNTH_MODEL = ANTHROPIC_MODELS.synthesis;

const SYSTEM = `You are the analyst layer of a synthetic CISO panel.

You receive a founder's question, 100 structured responses from agentic CISOs (each with verdict / sentiment / headline / reasoning), plus aggregate stats. Your job is to produce an EXECUTIVE summary that a VC or founder reads in 60 seconds and walks away with conviction.

Output EXACTLY this JSON shape, no prose around it:
{
  "summary": "<3-4 short sentences. Lead with the verdict. State the split. State what the strongest signal is. Don't waffle.>",
  "topPros": ["<5 distinct, specific pro arguments drawn from the actual responses. Each is one sentence, specific. NOT 'CISOs like the speed.' YES 'EU banking CISOs would adopt because the DORA evidence pipeline maps to their existing audit cadence.'>"],
  "topCons": ["<5 distinct, specific con arguments. Same specificity bar.>"],
  "insights": [
    {"title": "<short pattern name>", "reasoning": "<2-3 sentences explaining the pattern AND citing the segments (regions / industries / sizes / stances) that drove it>"},
    {"title": "...", "reasoning": "..."},
    {"title": "...", "reasoning": "..."}
  ],
  "themes": [
    {"title": "<3-4 word theme name>", "description": "<1 sentence describing the shared pattern across these agents — NO names>", "supportingAgents": ["<exact persona name from input>", "<another>", "..."]},
    {"title": "...", "description": "...", "supportingAgents": [...]},
    {"title": "...", "description": "...", "supportingAgents": [...]}
  ]
}

Rules:
- Output a bare JSON object starting with { and ending with }. NO markdown code fences (no \`\`\`json), NO preamble, NO explanation after.
- **NEVER use agent names in summary, topPros, topCons, insights.reasoning, or theme.description.** The agents are synthetic personas — naming them is irrelevant to the reader and noisy in exports. Cite SEGMENTS instead: regions ("EU-west banks"), industries ("healthcare"), sizes ("Series A-B"), stances ("contrarian voices").
- The supportingAgents array on themes IS allowed to contain exact names because the server uses them internally to compute verdict mixes — they never reach the user-facing text.
- The 3 insights are the most important — they should reveal non-obvious patterns (e.g. "buying intent flips at 5k employees," "EU vs US split is driven by compliance not value perception," "fintech and healthcare diverge while everyone else agrees").
- Themes are 3-5 GROUPS of agents who share a common reason or stance (e.g. "Compliance-driven EU pro", "ROI-skeptic mid-market", "Vendor-fatigue Series B+"). Each agent should appear in AT MOST one theme. List 4-12 supporting agents per theme using their EXACT names from the input — but DESCRIBE the theme by its shared attribute pattern, never by naming agents.
- Pros and cons should be sortable from STRONGEST to weakest.
- If the panel is sharply split, say so in summary. Don't paper over divisions.
- Never invent persona names or quotes that aren't in the input.`;

export async function synthesizePanel(
  question: string,
  responses: PanelResponse[],
  aggregates: PanelAggregates,
  client: Anthropic,
): Promise<ExecSummary> {
  const started = Date.now();
  const compact = responses.map((r) => ({
    name: r.name,
    region: r.region,
    industry: r.industry,
    size: r.companySize,
    stance: r.stance,
    verdict: r.verdict,
    sentiment: r.sentiment,
    headline: r.headline,
    reasoning: r.reasoning,
  }));

  const userPayload = [
    `FOUNDER'S QUESTION:`,
    question,
    ``,
    `AGGREGATE STATS:`,
    `- pro: ${aggregates.proCount} (${aggregates.proPct}%)`,
    `- con: ${aggregates.conCount} (${aggregates.conPct}%)`,
    `- neutral: ${aggregates.neutralCount} (${aggregates.neutralPct}%)`,
    `- sentiment: mean ${aggregates.sentimentMean} / 10 · σ ${aggregates.sentimentStdDev} · ${aggregates.spreadLabel}`,
    `- by region: ${JSON.stringify(aggregates.byRegion)}`,
    `- by stance: ${JSON.stringify(aggregates.byStance)}`,
    ``,
    `100 RESPONSES (JSON):`,
    JSON.stringify(compact),
  ].join("\n");

  const res = await client.messages.create({
    model: SYNTH_MODEL,
    // 4096 gives the model comfortable headroom: ~120 tokens of summary
    // + 5×30-token pros + 5×30-token cons + 3×~70-token insights + JSON
    // structure totals ~1000 tokens. 1800 was tight enough that JSON
    // could truncate mid-string, producing unparseable output.
    max_tokens: 4096,
    system: SYSTEM,
    messages: [{ role: "user", content: userPayload }],
  });

  const text = res.content
    .map((c) => (c.type === "text" ? c.text : ""))
    .join("")
    .trim();

  const block = extractJson(text);
  if (!block) {
    return fallback(text, res.usage.input_tokens, res.usage.output_tokens, Date.now() - started);
  }
  try {
    const parsed = JSON.parse(block) as Record<string, unknown>;
    return {
      summary:
        typeof parsed.summary === "string"
          ? parsed.summary
          : "Synthesis returned without summary.",
      topPros: arrayOfStrings(parsed.topPros).slice(0, 5),
      topCons: arrayOfStrings(parsed.topCons).slice(0, 5),
      insights: arrayOfInsights(parsed.insights).slice(0, 3),
      // Sprint 7 — themes from LLM, verdictMix computed server-side from
      // the actual response set for reliability (LLM-self-reported counts
      // would drift).
      themes: arrayOfThemes(parsed.themes, responses).slice(0, 5),
      inputTokens: res.usage.input_tokens,
      outputTokens: res.usage.output_tokens,
      durationMs: Date.now() - started,
    };
  } catch {
    return fallback(text, res.usage.input_tokens, res.usage.output_tokens, Date.now() - started);
  }
}

/**
 * Sprint 7 — parse LLM-supplied themes and compute each theme's verdict
 * mix from the actual responses (matched by agent name). The LLM gives
 * us cluster membership; we own the counting so the numbers can't drift
 * from the underlying truth.
 */
function arrayOfThemes(
  v: unknown,
  responses: PanelResponse[],
): ThemeCluster[] {
  if (!Array.isArray(v)) return [];
  const responseByName = new Map<string, PanelResponse>();
  for (const r of responses) responseByName.set(r.name, r);
  return v
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map((x) => {
      const supportingAgents = Array.isArray(x.supportingAgents)
        ? (x.supportingAgents as unknown[]).filter(
            (a): a is string => typeof a === "string",
          )
        : [];
      const verdictMix = { pro: 0, con: 0, neutral: 0, total: 0 };
      const matchedNames: string[] = [];
      const matchedResponses: PanelResponse[] = [];
      for (const name of supportingAgents) {
        const r = responseByName.get(name);
        if (!r) continue; // LLM hallucinated a name — drop
        matchedNames.push(name);
        matchedResponses.push(r);
        verdictMix.total += 1;
        if (r.verdict === "pro") verdictMix.pro += 1;
        else if (r.verdict === "con") verdictMix.con += 1;
        else verdictMix.neutral += 1;
      }
      return {
        title: typeof x.title === "string" ? x.title : "Theme",
        description: typeof x.description === "string" ? x.description : "",
        supportingAgents: matchedNames,
        verdictMix,
        // Compute the attribute breakdown — top regions/industries/stances
        // by frequency so the user-facing UI never has to surface names.
        segments: summariseSegments(matchedResponses),
      };
    })
    // Drop themes with no matched agents (LLM hallucinated all names) or
    // empty descriptions (low-signal).
    .filter((t) => t.verdictMix.total >= 2 && t.description.length > 0);
}

/**
 * Sprint 7 — compute the top regions / industries / stances within a
 * theme's matched responses. Used in the UI to describe the cluster
 * without naming individual synthetic agents.
 */
function summariseSegments(rs: PanelResponse[]): {
  regions: string[];
  industries: string[];
  stances: string[];
} {
  const tally = (key: "region" | "industry" | "stance") => {
    const counts = new Map<string, number>();
    for (const r of rs) {
      const v = String(r[key] ?? "").trim();
      if (!v) continue;
      counts.set(v, (counts.get(v) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([label, n]) => `${n}× ${label}`);
  };
  return {
    regions: tally("region"),
    industries: tally("industry"),
    stances: tally("stance"),
  };
}

function extractJson(text: string): string | null {
  let trimmed = text.trim();
  // Strip a leading markdown code fence (``` or ```json or ```javascript).
  // Some Claude responses still wrap JSON in fences despite the
  // "no code fences" instruction. The trailing ``` is stripped too.
  const fenceMatch = trimmed.match(/^```[a-z]*\n?([\s\S]*?)\n?```$/i);
  if (fenceMatch) trimmed = fenceMatch[1].trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) return trimmed;
  const m = trimmed.match(/\{[\s\S]*\}/);
  return m ? m[0] : null;
}

function arrayOfStrings(v: unknown): string[] {
  if (!Array.isArray(v)) return [];
  return v.filter((x): x is string => typeof x === "string");
}

function arrayOfInsights(v: unknown): { title: string; reasoning: string }[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Record<string, unknown> => typeof x === "object" && x !== null)
    .map((x) => ({
      title: typeof x.title === "string" ? x.title : "Insight",
      reasoning: typeof x.reasoning === "string" ? x.reasoning : "",
    }))
    .filter((x) => x.reasoning.length > 0);
}

function fallback(
  text: string,
  inputTokens: number,
  outputTokens: number,
  durationMs: number,
): ExecSummary {
  return {
    summary: text.slice(0, 600) || "Synthesis output could not be parsed.",
    topPros: [],
    topCons: [],
    insights: [],
    themes: [],
    inputTokens,
    outputTokens,
    durationMs,
  };
}
