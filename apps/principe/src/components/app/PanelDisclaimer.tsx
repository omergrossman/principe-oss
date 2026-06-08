// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Standing caveat shown wherever the panel is used or its output is read.
 * Keep the wording in sync with the README "Disclaimer" section. The panel is
 * a simulation of synthetic AI personas — this makes that explicit at the
 * point of use so no one mistakes it for real people or professional advice.
 */
export function PanelDisclaimer({ className = "" }: { className?: string }) {
  return (
    <p
      className={`text-[11px] leading-relaxed text-ink-300 ${className}`}
      role="note"
    >
      <span className="font-semibold text-ink-500">A note on the panel:</span>{" "}
      Príncipe&apos;s CISOs are <strong>synthetic, AI-generated personas</strong>{" "}
      — not real people, customers, or professional advisers. Every response is
      a model-generated simulation. Use it to explore and pressure-test ideas,
      not as advice; treat the output as one input among many, validate
      important decisions with real research, and decide for yourself.
    </p>
  );
}
