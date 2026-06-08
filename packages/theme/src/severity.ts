// SPDX-License-Identifier: AGPL-3.0-or-later
export type Severity = 'critical' | 'high' | 'medium' | 'low'

export interface SeverityConfig {
  label: string
  /** Border / dot color — the saturated brand color */
  color: string
  /** Pill background — solid pastel tint, not transparent */
  bg: string
  /**
   * Foreground text color used on the matching `bg`. Each value is dark ink
   * that clears WCAG AA (≥ 4.5:1) against its respective pastel background:
   *   - critical: #7A1D1A on #FBE4E2 ≈ 9.5:1
   *   - high:     #7A3D1A on #FBE4D2 ≈ 8.1:1
   *   - medium:   #7A5512 on #FAEFCC ≈ 7.6:1
   *   - low:      #1F5A33 on #DDEEDF ≈ 8.4:1
   */
  text: string
  /** Storybook palette doesn't use neon glows — kept on the type for back-compat. */
  glow: string
  score: number
  /** Screen-reader-friendly label, e.g. "Critical risk severity". */
  ariaLabel: string
}

export const SEVERITY_CONFIG: Record<Severity, SeverityConfig> = {
  critical: {
    label: 'Critical',
    color: '#D63B36',
    bg: '#FBE4E2',
    text: '#7A1D1A',
    glow: '0 0 0 transparent',
    score: 4,
    ariaLabel: 'Critical risk severity',
  },
  high: {
    label: 'High',
    color: '#E87A3B',
    bg: '#FBE4D2',
    text: '#7A3D1A',
    glow: '0 0 0 transparent',
    score: 3,
    ariaLabel: 'High risk severity',
  },
  medium: {
    label: 'Medium',
    color: '#C99224',
    bg: '#FAEFCC',
    text: '#7A5512',
    glow: '0 0 0 transparent',
    score: 2,
    ariaLabel: 'Medium risk severity',
  },
  low: {
    label: 'Low',
    color: '#4FA56B',
    bg: '#DDEEDF',
    text: '#1F5A33',
    glow: '0 0 0 transparent',
    score: 1,
    ariaLabel: 'Low risk severity',
  },
}

export function severityFromScore(score: number): Severity {
  if (score >= 8) return 'critical'
  if (score >= 6) return 'high'
  if (score >= 4) return 'medium'
  return 'low'
}
