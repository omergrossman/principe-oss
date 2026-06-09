// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

/**
 * Principe's wordmark — lowercase typographic mark with the eclipse glyph.
 * Per the design system: ink-900 wordmark + flare-600 corona ring.
 * Marked "use client" because the Wordmark function is passed through
 * PrincipeThemeProvider's theme prop, which crosses a server-to-client boundary.
 */

interface PrincipeWordmarkProps {
  className?: string;
  /** Size of the eclipse glyph in px; the wordmark text scales accordingly */
  size?: number;
}

// Hand-placed corona streamers — non-uniform angles, asymmetric lengths.
// Cardinal directions (0/90/180/270) get the longest rays — mirrors how
// the real 1919 plate's corona clusters along the ecliptic axis.
const CORONA_STREAMERS: { deg: number; len: number }[] = [
  { deg: 0, len: 4.0 },
  { deg: 20, len: 2.4 },
  { deg: 40, len: 3.4 },
  { deg: 64, len: 2.0 },
  { deg: 90, len: 4.2 },
  { deg: 114, len: 2.5 },
  { deg: 138, len: 3.6 },
  { deg: 162, len: 2.1 },
  { deg: 180, len: 4.0 },
  { deg: 202, len: 2.7 },
  { deg: 224, len: 3.4 },
  { deg: 250, len: 2.0 },
  { deg: 270, len: 4.2 },
  { deg: 296, len: 2.6 },
  { deg: 320, len: 3.5 },
  { deg: 344, len: 2.3 },
];

export function PrincipeWordmark({
  className = "",
  size = 24,
}: PrincipeWordmarkProps) {
  const fontSize = Math.round(size * 0.95);
  const inner = 7.4;
  const rays = CORONA_STREAMERS.map((s) => {
    const a = (s.deg * Math.PI) / 180;
    return {
      x1: 12 + Math.cos(a) * inner,
      y1: 12 + Math.sin(a) * inner,
      x2: 12 + Math.cos(a) * (inner + s.len),
      y2: 12 + Math.sin(a) * (inner + s.len),
    };
  });
  return (
    <span
      className={`inline-flex items-center gap-2 font-semibold tracking-tight ${className}`}
      style={{ color: "var(--color-ink-900)" }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        fill="none"
        aria-hidden
      >
        <circle cx="12" cy="12" r="11.5" fill="var(--color-flare-100)" opacity="0.55" />
        <circle cx="12" cy="12" r="9" fill="var(--color-flare-100)" opacity="0.7" />
        <g
          stroke="var(--color-ink-700)"
          strokeWidth="0.5"
          strokeLinecap="round"
          opacity="0.85"
        >
          {rays.map((r, i) => (
            <line key={i} x1={r.x1} y1={r.y1} x2={r.x2} y2={r.y2} />
          ))}
        </g>
        <circle cx="12" cy="12" r="7" fill="currentColor" />
        <circle
          cx="12"
          cy="12"
          r="7.25"
          stroke="var(--color-flare-600)"
          strokeWidth="0.4"
          opacity="0.9"
        />
      </svg>
      <span style={{ fontSize, lineHeight: 1 }}>Príncipe</span>
    </span>
  );
}
