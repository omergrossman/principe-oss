import type { ComponentType } from 'react'
import type { AgentColors } from './agent-colors'
import type { SeverityConfig, Severity } from './severity'

/**
 * The contract every project's theme must satisfy.
 *
 * Each project (Fable, Product 2, …) provides one of these at mount time
 * via `<DPThemeProvider theme={projectTheme}>`. DP-shipped components
 * read from it via `useTheme()`.
 */
export interface PlatformTheme {
  /** Brand identity */
  brand: {
    /** Short display name, e.g. "fable". */
    name: string
    /** Lowercase wordmark React component (project supplies). */
    Wordmark: ComponentType<{ size?: number }>
    /** Path to favicon. */
    favicon?: string
    /** Short tagline (optional). */
    tagline?: string
  }
  /**
   * Color palette. The shape mirrors the canonical fable token set; new
   * projects override the values they care about and keep the slot names.
   */
  colors: {
    canvas: string
    surface: string
    primary: string
    primaryLight: string
    accent: string
    accentLight: string
    sun: string
    sunLight: string
    ink: string
    inkSecondary: string
    inkTertiary: string
    border: string
    borderSoft: string
    borderBold: string
  }
  /** Severity scale (typically same across projects — semantic, not brand) */
  severity: Record<Severity, SeverityConfig>
  /** Per-agent palette (relevant for Fable; other projects may omit or override) */
  agents?: AgentColors
  /** Type system */
  fonts: {
    display: string
    body: string
    mono: string
    logo: string
  }
  /** Radius scale */
  radius: {
    sm: number
    md: number
    lg: number
    xl: number
    '2xl': number
    full: number
  }
  /** Shadow scale */
  shadow: {
    sm: string
    md: string
    lg: string
    paper: string
  }
  /** Voice / copy patterns (optional) */
  voice?: {
    welcomeHeadline?: string
    emptyState?: string
  }
}

/** What DPThemeProvider exposes via context. */
export type ThemeContextValue = PlatformTheme
