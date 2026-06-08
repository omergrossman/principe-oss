import type { ReactNode } from "react";

type Verdict = "pass" | "warn" | "fail" | "directional";
type Sentiment = "positive" | "neutral" | "negative";

interface StatusPillProps {
  variant: Verdict | Sentiment;
  children: ReactNode;
  size?: "sm" | "md";
}

const variantClasses: Record<Verdict | Sentiment, string> = {
  // verdict
  pass: "bg-verdict-pass/12 text-verdict-pass border-verdict-pass/30",
  warn: "bg-verdict-warn/12 text-verdict-warn border-verdict-warn/30",
  fail: "bg-verdict-fail/12 text-verdict-fail border-verdict-fail/30",
  directional:
    "bg-verdict-directional/12 text-verdict-directional border-verdict-directional/30",
  // sentiment
  positive: "bg-sentiment-positive/12 text-sentiment-positive border-sentiment-positive/30",
  neutral: "bg-sentiment-neutral/12 text-sentiment-neutral border-sentiment-neutral/30",
  negative: "bg-sentiment-negative/12 text-sentiment-negative border-sentiment-negative/30",
};

const sizeClasses: Record<"sm" | "md", string> = {
  sm: "h-5 px-2 text-[11px]",
  md: "h-6 px-2.5 text-[12px]",
};

const glyph: Record<Verdict | Sentiment, string> = {
  pass: "●",
  warn: "▲",
  fail: "✕",
  directional: "◌",
  positive: "▲",
  neutral: "—",
  negative: "▼",
};

export function StatusPill({ variant, children, size = "md" }: StatusPillProps) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-pill border font-medium ${variantClasses[variant]} ${sizeClasses[size]}`}
    >
      <span aria-hidden className="text-[0.85em]">{glyph[variant]}</span>
      {children}
    </span>
  );
}
