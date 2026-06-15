// SPDX-License-Identifier: AGPL-3.0-or-later
//
// Tier 1.5 — the adversarial review pass. After the panel votes and the
// synthesiser ranks the objections, three reviewers (each a DISTINCT lens, so
// they don't converge) stress-test the result: which objection is strongest,
// what blind spot did the whole panel miss, and is the majority verdict even
// defensible? The output sharpens the objections-led card with a "what the
// panel almost missed" line and a minority-report flag.
//
// Design rules (mirrors the router): cheap model, runs in parallel, and NEVER
// throws — a reviewer failure degrades to the un-reviewed objections, it does
// not block the panel. Gated by the caller (on for directional/PITCH types).

import type Anthropic from "@anthropic-ai/sdk";
import { ANTHROPIC_MODELS } from "@/lib/anthropic/models";
import type { PanelAggregates } from "./ask";

export interface PanelReview {
  /** A risk / stakeholder / failure mode that no objection named — or null. */
  blindSpot: string | null;
  /** topCons re-ordered most-decision-blocking first (per the reviewers). */
  objectionsRanked: string[];
  /** True when a majority of reviewers judge the dissenting case the stronger one. */
  minorityStronger: boolean;
}

// Three deliberately different seats. Diversity is the point — identical
// reviewers would just agree with each other and surface nothing new.
const LENSES = [
  "a pragmatic operating CISO who cares most about whether this is executable with a real team and budget",
  "a deeply technical, ex-red-team CISO who cares most about whether a control actually works against a real attacker",
  "a board-facing, business-strategic CISO who cares most about risk ownership, stakeholders, and second-order consequences",
];

interface ReviewerVote {
  strongest: number; // 1-based index into the objections, 0 = none
  blindSpot: string;
  minorityStronger: boolean;
}

export async function reviewObjections(
  question: string,
  aggregates: PanelAggregates,
  topCons: string[],
  client: Anthropic,
): Promise<PanelReview> {
  const empty: PanelReview = {
    blindSpot: null,
    objectionsRanked: topCons,
    minorityStronger: false,
  };
  if (topCons.length === 0) return empty;

  const numbered = topCons.map((c, i) => `${i + 1}. ${c}`).join("\n");
  const split =
    `The panel split ${aggregates.proCount} in favour / ${aggregates.neutralCount} neutral / ` +
    `${aggregates.conCount} against.`;

  const votes = await Promise.all(
    LENSES.map((lens) => reviewerVote(question, split, numbered, topCons.length, lens, client)),
  );
  const ok = votes.filter((v): v is ReviewerVote => v !== null);
  if (ok.length === 0) return empty;

  // Re-rank objections by how many reviewers named each "strongest"; ties keep
  // the synthesiser's original order (stable).
  const score = new Array(topCons.length).fill(0);
  for (const v of ok) {
    if (v.strongest >= 1 && v.strongest <= topCons.length) score[v.strongest - 1] += 1;
  }
  const objectionsRanked = topCons
    .map((c, i) => ({ c, i, s: score[i] }))
    .sort((a, b) => b.s - a.s || a.i - b.i)
    .map((x) => x.c);

  // Blind spot: the first substantive one a reviewer surfaced (diverse seats →
  // any is a valid miss). Require a little length so "none" / "n/a" don't slip in.
  const blindSpot =
    ok.map((v) => v.blindSpot.trim()).find((b) => b.length >= 15) ?? null;

  const minorityStronger = ok.filter((v) => v.minorityStronger).length >= Math.ceil(ok.length / 2);

  return { blindSpot, objectionsRanked, minorityStronger };
}

async function reviewerVote(
  question: string,
  split: string,
  numbered: string,
  count: number,
  lens: string,
  client: Anthropic,
): Promise<ReviewerVote | null> {
  try {
    const res = await client.messages.create({
      model: ANTHROPIC_MODELS.panel,
      max_tokens: 220,
      system:
        `You are ${lens}. You are reviewing a synthetic CISO panel's answer — NOT answering the question yourself. ` +
        `Be specific and terse. Output ONLY this JSON, nothing else:\n` +
        `{"strongest": <the number of the single most decision-blocking objection, or 0 if none lands>, ` +
        `"blindSpot": "<one specific risk, stakeholder, or failure mode that NONE of the objections named — or '' if they were complete>", ` +
        `"minorityStronger": <true if the dissenting/minority case is actually the stronger one here, else false>}`,
      messages: [
        {
          role: "user",
          content: `QUESTION:\n${question}\n\n${split}\n\nThe panel's objections:\n${numbered}`,
        },
        { role: "assistant", content: "{" },
      ],
    });
    const raw = "{" + res.content.map((c) => (c.type === "text" ? c.text : "")).join("");
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    if (start === -1 || end <= start) return null;
    const parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
    const strongestRaw = parsed.strongest;
    const strongest =
      typeof strongestRaw === "number"
        ? Math.round(strongestRaw)
        : Number.parseInt(String(strongestRaw ?? "0"), 10) || 0;
    return {
      strongest: strongest >= 0 && strongest <= count ? strongest : 0,
      blindSpot: typeof parsed.blindSpot === "string" ? parsed.blindSpot : "",
      minorityStronger: parsed.minorityStronger === true,
    };
  } catch {
    return null; // never block on a reviewer failure
  }
}
