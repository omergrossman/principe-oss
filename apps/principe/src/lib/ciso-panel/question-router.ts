// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Tier 0 (router) + Tier 1 (skills) of the calibration architecture.
//
// Calibration showed the panel's error is FRAMING-DEPENDENT: it over-affirms
// "is X a priority?" questions (no scarcity model), over-hedges forecasts, and
// over-rejects bold pitches. A single global prompt can't fix all three. So we
// classify the question type first (cheap: heuristics, LLM only on ambiguity),
// then append a type-specific "skill" instruction to each persona's prompt.

import type Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_MODELS } from "@/lib/anthropic/models";

export type QuestionType =
  | "PITCH"
  | "STRATEGY"
  | "PRIORITY"
  | "FORECAST"
  | "FACTUAL";

const TYPES: QuestionType[] = [
  "PITCH",
  "STRATEGY",
  "PRIORITY",
  "FORECAST",
  "FACTUAL",
];

/** Cheap regex fast-path for the obvious cases. Null ⇒ fall through to the LLM. */
function heuristicType(q: string): QuestionType | null {
  const s = q.toLowerCase();
  if (
    /\bis\b[^?]*\bpriorit/i.test(q) ||
    /where (would|do) you (invest|focus|spend|prioriti)/i.test(q) ||
    /\b(top|highest) priorit(y|ies)\b/i.test(q) ||
    /\brank (these|the|your)\b/i.test(q)
  ) {
    return "PRIORITY";
  }
  if (
    /\bby (the )?(end of )?20\d\d\b/.test(s) ||
    /\bwithin (the next )?\d+ (months|years)\b/.test(s) ||
    /become (the )?standard/.test(s) ||
    /\bwill\b[^?]*\b(be|become|happen|reach)\b/.test(s)
  ) {
    return "FORECAST";
  }
  if (
    /would you (buy|adopt|replace|pay|deploy|move|switch|purchase|use|roll out)/i.test(
      q,
    )
  ) {
    return "PITCH";
  }
  if (
    /do you (currently|today|already|have|use|run|operate)\b/i.test(q) ||
    /what(?:'s| is| are) your\b/i.test(q)
  ) {
    return "FACTUAL";
  }
  return null;
}

/**
 * Classify a question into one of five types. Heuristic first; one cheap
 * model call only when the heuristics are inconclusive. Never throws — a
 * classifier failure must not block the panel, so it defaults to PITCH.
 */
export async function classifyQuestion(
  question: string,
  client: Anthropic,
): Promise<QuestionType> {
  const fast = heuristicType(question);
  if (fast) return fast;
  try {
    const res = await client.messages.create({
      model: ANTHROPIC_MODELS.panel, // cheapest available (haiku)
      max_tokens: 8,
      system:
        "Classify the question into ONE type. Reply with ONLY the single word, nothing else.\n" +
        "PITCH = would you buy/adopt a specific product or offering.\n" +
        "STRATEGY = should X be the approach/strategy (e.g. prevention vs detection).\n" +
        "PRIORITY = is X a priority / where would you invest / ranking among options.\n" +
        "FORECAST = will X happen or become standard by some time / a prediction.\n" +
        "FACTUAL = do you currently do X / a fact or metric about your own org.",
      messages: [{ role: "user", content: question.slice(0, 1000) }],
    });
    const out = res.content
      .map((c) => (c.type === "text" ? c.text : ""))
      .join("")
      .toUpperCase();
    return TYPES.find((t) => out.includes(t)) ?? "PITCH";
  } catch {
    return "PITCH"; // never block the panel on a classifier error
  }
}

/**
 * Tier 1 — the type-specific "skill": a prompt fragment appended to each
 * persona's prompt that fixes that framing's calibration bias. Empty string
 * for PITCH (the current behaviour is the baseline for that type).
 */
export function skillForType(type: QuestionType): string {
  switch (type) {
    case "PRIORITY":
      return (
        "This is a PRIORITISATION question. You have FINITE budget and attention — you cannot make everything a priority. " +
        "Weigh this honestly against your OTHER current concerns and active initiative: vote pro ONLY if you'd genuinely fund or prioritise it over the competing demands on your plate this year. " +
        "Many sensible, good ideas are NOT among your top priorities — saying 'worthwhile but not a priority for me' is a con or neutral, not a pro."
      );
    case "FORECAST":
      return (
        "This is a FORECAST question. Give your best-judgement prediction and COMMIT to it — a forecaster takes a position. " +
        "Do not hide in 'it depends'; vote neutral only if you genuinely have no lean either way."
      );
    case "STRATEGY":
      return (
        "This is a STRATEGY / claim question. Weigh it through your own seat, stance, and industry — the panel SHOULD disagree. " +
        "State plainly whether you back this direction (pro) or push back on it (con)."
      );
    case "FACTUAL":
      return (
        "This is a FACTUAL / behavioural question about your own organisation. Answer from your specific situation (region, industry, size, maturity): " +
        "pro = yes / true for you, con = no / false, neutral = genuinely not applicable."
      );
    case "PITCH":
    default:
      return "";
  }
}
