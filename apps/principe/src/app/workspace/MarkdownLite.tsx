import { Fragment } from "react";

/**
 * Renders a string with **bold** segments converted to <strong>. Nothing
 * else from markdown — no italics, no links, no lists. Just bold.
 *
 * Used wherever Claude's synthesized output lands in the UI (executive
 * summary, pros/cons bullets, insight reasoning). Claude's
 * synthesis prompts produce markdown-style emphasis by default; without
 * this, users see literal asterisks in the UI ("**sharply divided**").
 */
export function MarkdownLite({ text }: { text: string }) {
  // Split on **...** preserving the matched groups in the output array.
  // The non-greedy quantifier prevents collapsing two separate bolds
  // into one span when they share a line.
  const parts = text.split(/(\*\*[^*]+?\*\*)/g);
  return (
    <>
      {parts.map((p, i) => {
        if (p.startsWith("**") && p.endsWith("**")) {
          return (
            <strong key={i} className="font-semibold text-ink-900">
              {p.slice(2, -2)}
            </strong>
          );
        }
        return <Fragment key={i}>{p}</Fragment>;
      })}
    </>
  );
}
