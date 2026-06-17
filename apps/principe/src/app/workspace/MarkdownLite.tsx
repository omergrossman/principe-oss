// SPDX-License-Identifier: AGPL-3.0-or-later
import { Fragment } from "react";

/**
 * Renders markdown-style emphasis as bold <strong>. Handles BOTH **double**
 * and *single* asterisk spans — the model emits either, and the product's
 * emphasis convention is bold, so both render bold. Nothing else from
 * markdown — no links, no lists.
 *
 * Used wherever Claude's synthesized output lands in the UI (executive
 * summary, pros/cons, insight reasoning, theme descriptions, blind spot).
 * Without this, users see literal asterisks ("**sharply divided**" or
 * "*why*"). Don't fight the prompt — render at the leaf.
 */
export function MarkdownLite({ text }: { text: string }) {
  // Match **...** before *...* (alternation order) so a bold span isn't split
  // by its own asterisks; exclude newlines so a "* bullet\n* list" can't be
  // collapsed into one emphasis span. Non-greedy keeps separate spans separate.
  const parts = text.split(/(\*\*[^*\n]+?\*\*|\*[^*\n]+?\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.length > 4 && p.startsWith("**") && p.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-ink-900">
              {p.slice(2, -2)}
            </strong>
          );
        }
        if (p.length > 2 && p.startsWith("*") && p.endsWith("*")) {
          return (
            <strong key={i} className="font-semibold text-ink-900">
              {p.slice(1, -1)}
            </strong>
          );
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}
