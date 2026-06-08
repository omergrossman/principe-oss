// SPDX-License-Identifier: AGPL-3.0-or-later
/**
 * Per-agent color tokens for the Fable V2 storybook palette.
 *
 * Each entry exposes three colors:
 *   - `color` — the agent's saturated brand color (pill borders, dots, icons).
 *   - `light` — a soft pastel tint suitable for backgrounds / hover states.
 *   - `ink`   — a dark text color that clears WCAG AA (≥ 4.5:1) on `light`.
 *
 * The 5 characters explicitly named in the design handoff (Rex, Nimbus, Iris,
 * Patch, Sage) use the colors from that spec. The 6 V3 agents are designer-
 * extensions that complete the Hilda × Simpsons palette family — see the
 * inline notes for the rationale on each choice.
 *
 * Keyed by string so the @dp/theme package stays consumer-agnostic. Each
 * project narrows the index type at the consumption site (e.g. fable's
 * AgentId union).
 */
export interface AgentColor {
  /** Primary saturated color — borders, dots, icons. */
  color: string
  /** Pastel tint — backgrounds, hover surfaces. */
  light: string
  /** Dark text color used on `light` (passes AA). */
  ink: string
}

/** Record of agent slugs (e.g. "rex", "nimbus") → AgentColor. */
export type AgentColors = Record<string, AgentColor>

export const AGENT_COLORS: AgentColors = {
  // ── Spec'd characters ────────────────────────────────────────────────────
  rex:    { color: '#D63B36', light: '#FBE4E2', ink: '#7A1D1A' }, // red — Endpoint Guardian
  nimbus: { color: '#3F88C5', light: '#DCE9F4', ink: '#1A4A7A' }, // blue — Cloud Scout
  iris:   { color: '#7A5DC7', light: '#E7DEF6', ink: '#3A2A7A' }, // violet — Insider Risk
  patch:  { color: '#4FA56B', light: '#DDEEDF', ink: '#1F5A33' }, // green — 3rd Party + Response
  sage:   { color: '#E5B43A', light: '#FAEFCC', ink: '#8C6A2A' }, // amber — AI Copilot

  // ── V3 extensions (designer additions in the same palette family) ───────
  knox:   { color: '#C9923B', light: '#FAEFCF', ink: '#6E4F18' }, // mustard-bronze — Identity Keeper
  volt:   { color: '#5B7CDB', light: '#E0E6FA', ink: '#2A3A7C' }, // periwinkle — XDR / Threat
  stella: { color: '#D67BB2', light: '#FBDFEE', ink: '#6E2A4F' }, // rose-pink — Compliance Star
  swift:  { color: '#3DA89C', light: '#D8EEEA', ink: '#1F5A52' }, // sea-teal — Email Gateway
  atlas:  { color: '#9264C9', light: '#EADFF6', ink: '#4A2A7A' }, // deep violet — AI Security (cosmic)
  fox:    { color: '#E89854', light: '#FBE9D7', ink: '#7C4F1A' }, // orange — Continuous Pentest
}
