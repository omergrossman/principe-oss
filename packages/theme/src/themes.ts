// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ComponentType } from 'react'
import type { PlatformTheme } from './types'
import { FABLE, FONT, RADIUS, SHADOW } from './tokens'
import { AGENT_COLORS } from './agent-colors'
import { SEVERITY_CONFIG } from './severity'

/**
 * Default theme that ships with DP. Currently composed of Fable's tokens
 * since fable is the canonical reference project. New projects can use
 * this as-is during scaffolding, then override fields (especially
 * brand.Wordmark and colors) as their brand identity emerges.
 *
 * Callers provide brand.Wordmark — DP doesn't ship a wordmark itself.
 */
export function makeDefaultTheme(brand: {
  name: string
  Wordmark: ComponentType<{ size?: number }>
  favicon?: string
  tagline?: string
}): PlatformTheme {
  return {
    brand,
    colors: {
      canvas: FABLE.canvas,
      surface: FABLE.surface,
      primary: FABLE.primary,
      primaryLight: FABLE.primaryLight,
      accent: FABLE.accent,
      accentLight: FABLE.accentLight,
      sun: FABLE.sun,
      sunLight: FABLE.sunLight,
      ink: FABLE.ink,
      inkSecondary: FABLE.inkSecondary,
      inkTertiary: FABLE.inkTertiary,
      border: FABLE.border,
      borderSoft: FABLE.borderSoft,
      borderBold: FABLE.borderBold,
    },
    severity: SEVERITY_CONFIG,
    agents: AGENT_COLORS,
    fonts: FONT,
    radius: RADIUS,
    shadow: SHADOW,
  }
}
