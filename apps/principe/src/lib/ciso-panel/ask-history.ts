// SPDX-License-Identifier: AGPL-3.0-or-later
import { prisma } from "@/lib/db/prisma";
import type { PanelResponse, Verdict } from "./ask";

/**
 * Persona memory across asks. After every /api/ask, this appends a
 * compact entry to each persona's `askHistory` JSON array on
 * ProjectAgent, capped at the most recent N entries. Read by
 * lib/ciso-panel/ask.ts's buildPersonaDepthSection to inject "Your
 * recent panel positions" into the runtime prompt so the persona
 * stays consistent across questions and can explicitly evolve when
 * new evidence warrants.
 */

const MAX_HISTORY_ENTRIES = 10;
const MAX_QUESTION_CHARS = 120;
const MAX_HEADLINE_CHARS = 160;

export interface AskHistoryEntry {
  askId: string;
  q: string; // question gist, trimmed
  v: Verdict;
  h: string; // headline, trimmed
  askedAt: string; // ISO date
}

function isAskHistoryEntry(x: unknown): x is AskHistoryEntry {
  if (!x || typeof x !== "object") return false;
  const e = x as Record<string, unknown>;
  return (
    typeof e.askId === "string" &&
    typeof e.q === "string" &&
    (e.v === "pro" || e.v === "con" || e.v === "neutral") &&
    typeof e.h === "string" &&
    typeof e.askedAt === "string"
  );
}

export function parseAskHistory(json: unknown): AskHistoryEntry[] {
  if (!Array.isArray(json)) return [];
  return json.filter(isAskHistoryEntry);
}

/**
 * Append the latest panel responses to each persona's askHistory.
 * One DB update per persona — runs after the ProjectAsk row is
 * already saved, so any failure here doesn't roll back the ask.
 */
export async function appendAskHistory(
  askId: string,
  question: string,
  askedAt: Date,
  responses: PanelResponse[],
): Promise<void> {
  const truncQ =
    question.length > MAX_QUESTION_CHARS
      ? question.slice(0, MAX_QUESTION_CHARS - 1) + "…"
      : question;
  const askedAtIso = askedAt.toISOString();

  // Update each persona in parallel. apiError + parseError responses
  // are skipped — we only record entries where the persona actually
  // expressed a verdict.
  await Promise.all(
    responses
      .filter((r) => !r.apiError && !r.parseError)
      .map(async (r) => {
        const agent = await prisma.projectAgent.findFirst({
          where: { name: r.name },
          select: { id: true, askHistory: true },
        });
        if (!agent) return;

        const prior = parseAskHistory(agent.askHistory);
        const truncH =
          r.headline.length > MAX_HEADLINE_CHARS
            ? r.headline.slice(0, MAX_HEADLINE_CHARS - 1) + "…"
            : r.headline;
        const next: AskHistoryEntry = {
          askId,
          q: truncQ,
          v: r.verdict,
          h: truncH,
          askedAt: askedAtIso,
        };
        // Newest first, cap at MAX_HISTORY_ENTRIES.
        const updated = [next, ...prior].slice(0, MAX_HISTORY_ENTRIES);
        await prisma.projectAgent.update({
          where: { id: agent.id },
          data: { askHistory: updated as unknown as object },
        });
      }),
  );
}

/**
 * Render askHistory as a prompt-ready section. Empty string if no
 * history. Called from lib/ciso-panel/ask.ts when building each
 * persona's runtime system prompt.
 */
export function renderAskHistorySection(entries: AskHistoryEntry[]): string {
  if (entries.length === 0) return "";
  const lines = entries.map((e) => {
    const date = e.askedAt.slice(0, 10); // YYYY-MM-DD
    return `- ${date} · ${e.v.toUpperCase()} on "${e.q}" — ${e.h}`;
  });
  return [
    "Your recent panel positions (most recent first):",
    ...lines,
    "",
    "Use these to stay consistent across questions, but evolve your position when new evidence warrants — explicitly acknowledge the shift in your headline if you change verdict on a similar topic.",
  ].join("\n");
}
