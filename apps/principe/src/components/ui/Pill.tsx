// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ReactNode } from "react";

interface PillProps {
  children: ReactNode;
  tone?: "default" | "accent" | "ink";
}

const toneClasses: Record<NonNullable<PillProps["tone"]>, string> = {
  default: "bg-subtle text-ink-700 border border-ink-100",
  accent: "bg-flare-100 text-flare-600 border border-flare-600/30",
  ink: "bg-ink-900 text-canvas border border-ink-900",
};

export function Pill({ children, tone = "default" }: PillProps) {
  return (
    <span
      className={`inline-flex items-center h-6 px-2.5 rounded-pill text-[12px] font-medium ${toneClasses[tone]}`}
    >
      {children}
    </span>
  );
}
