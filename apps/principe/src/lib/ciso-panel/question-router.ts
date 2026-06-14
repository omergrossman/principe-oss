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
 *
 * CRITICAL: each persona's baked system prompt defines pro/con in PITCH terms
 * ("pro = you'd commit / buy / champion the founder's direction"). For every
 * other type that definition is WRONG and, left unchallenged, dominates — it's
 * why a FACTUAL "does your org use AI?" returned ~2% pro when 89% of real orgs
 * do. So a non-PITCH skill must FIRST revoke the baked pitch definition, then
 * install the correct one. The OVERRIDE preamble does that revocation.
 */
const OVERRIDE =
  "⚠️ VERDICT OVERRIDE — read carefully. The pro/con/neutral definitions in your " +
  "instructions above are written for evaluating a FOUNDER'S PITCH. This question is " +
  "NOT a pitch, so those definitions DO NOT APPLY. Ignore them and use ONLY the verdict " +
  "definitions below. You are not deciding whether to buy or champion anything.";

export function skillForType(type: QuestionType): string {
  switch (type) {
    case "PRIORITY":
      return (
        OVERRIDE +
        "\n\nThis is a PRIORITISATION question — 'is X a priority for you / would you fund X?'. " +
        "Verdict definitions for THIS question:\n" +
        "- pro = YES, given my finite budget and attention this genuinely is (or would be) one of my priorities this year.\n" +
        "- con = NO, it's not a priority for me — worthwhile or not, it loses to the competing demands already on my plate.\n" +
        "- neutral = I truly can't say without more context.\n" +
        "Answer from YOUR seat only (your region, industry, size, current concerns and active initiative) — not what CISOs in general would say. " +
        "You cannot prioritise everything; many good ideas are still a 'no' for you. Be willing to land on either side."
      );
    case "FORECAST":
      return (
        OVERRIDE +
        "\n\nThis is a FORECAST question — 'will X happen / become standard / be true by some time?'. " +
        "Verdict definitions for THIS question:\n" +
        "- pro = YES, my best prediction is this will happen / is true.\n" +
        "- con = NO, my best prediction is it won't.\n" +
        "- neutral = a genuine coin-flip with no lean either way.\n" +
        "Give your best-judgement prediction from your own vantage point. Lean to whichever side you actually believe — don't force false certainty, but don't reflexively hedge either."
      );
    case "STRATEGY":
      return (
        OVERRIDE +
        "\n\nThis is a STRATEGY / claim question — 'should the approach be X / do you agree with this claim?'. " +
        "Verdict definitions for THIS question:\n" +
        "- pro = YES, I back this direction / agree with this claim for my organisation.\n" +
        "- con = NO, I'd push back on this direction / disagree with the claim.\n" +
        "- neutral = genuinely undecided or not applicable to me.\n" +
        "Weigh it through your own seat, stance, and industry — the panel SHOULD disagree with each other here. Don't converge on the 'safe' consensus answer."
      );
    case "FACTUAL":
      return (
        OVERRIDE +
        "\n\nThis is a FACTUAL / behavioural question about YOUR OWN organisation — 'do you currently do X / is X true of you?'. " +
        "Verdict definitions for THIS question:\n" +
        "- pro = YES, this is true of / happens at my organisation.\n" +
        "- con = NO, this is not true of my organisation.\n" +
        "- neutral = genuinely not applicable to my context.\n" +
        "Answer ONLY for your specific organisation (your region, industry, size, maturity, budget) — report what is actually true where you sit, not what's good practice or what the industry should do. " +
        "Most mainstream practices ARE in place at well-run orgs — don't default to skeptical 'no' out of caution."
      );
    case "PITCH":
    default:
      return "";
  }
}
