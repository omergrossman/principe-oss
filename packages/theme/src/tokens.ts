/**
 * Fable V2 design tokens.
 *
 * Cream paper canvas, dusty teal primary, warm coral accent, simpsons yellow
 * sun. Storybook + Hilda × Simpsons cartoon energy. NOT a dark dashboard.
 *
 * The deprecated re-exports at the bottom of this file (GLASS_CARD, GRADIENT_BG,
 * GLOW, TEXT) are intentional — they let existing pages keep compiling while
 * Phases 2–5 migrate call sites to the new tokens. Without them every page
 * would break at once. New code MUST use the FABLE / SHADOW / RADIUS / FONT
 * exports below.
 */

export const FABLE = {
  // Brand
  primary: '#2C7E7D',
  primaryLight: '#DAEAE7',
  accent: '#E8896A',
  accentLight: '#FAE4D9',
  sun: '#F5C518',
  sunLight: '#FFEDA8',

  // Ink + surface
  ink: '#1B2A3A',
  inkSecondary: '#5B6B7E',
  inkTertiary: '#9AA5B4',
  surface: '#FCF8F0',
  canvas: '#F4EDDE',
  border: '#E5DBC8',
  borderSoft: '#EFE7D5',
  borderBold: '#1B2A3A',
} as const

export const SHADOW = {
  sm: '0 1px 2px rgba(27,42,58,0.06)',
  md: '0 6px 16px rgba(27,42,58,0.08)',
  lg: '0 14px 40px rgba(27,42,58,0.14)',
  paper: '0 2px 0 #E5DBC8, 0 10px 24px rgba(27,42,58,0.07)',
} as const

export const RADIUS = {
  sm: 6,
  md: 10,
  lg: 16,
  xl: 20,
  '2xl': 24,
  full: 9999,
} as const

// Typography (loaded via next/font/google in /src/app/layout.tsx — these
// strings reference the CSS variables exposed there, with sensible fallbacks
// for environments where the variables aren't injected.)
export const FONT = {
  display: 'var(--font-display, "Bricolage Grotesque"), system-ui, sans-serif',
  body: 'var(--font-body, Inter), system-ui, sans-serif',
  mono: 'var(--font-mono, "JetBrains Mono"), monospace',
  logo: 'var(--font-logo, Fredoka), system-ui, sans-serif',
} as const

// ─────────────────────────────────────────────────────────────────────────────
// Deprecated re-exports — kept so existing pages compile during the redesign.
// Phases 2–5 will replace each call site with FABLE / SHADOW directly, then
// these can be deleted.
// ─────────────────────────────────────────────────────────────────────────────

/** @deprecated Use FABLE.canvas + FABLE.surface + FABLE.ink directly. */
export const GRADIENT_BG = FABLE.canvas

/** @deprecated Use FABLE.ink / FABLE.inkSecondary / FABLE.inkTertiary. */
export const TEXT = {
  primary: FABLE.ink,
  secondary: FABLE.inkSecondary,
  muted: FABLE.inkTertiary,
} as const

/** @deprecated Use new card styling with FABLE.surface + SHADOW.paper. */
export const GLASS_CARD = {
  background: FABLE.surface,
  backdropFilter: 'none',
  border: `1px solid ${FABLE.border}`,
  borderRadius: `${RADIUS.lg}px`,
} as const

/** @deprecated Storybook palette doesn't use neon glows. */
export const GLOW = {
  amber: '0 0 0 transparent',
  purple: '0 0 0 transparent',
  teal: '0 0 0 transparent',
} as const
