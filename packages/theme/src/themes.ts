// SPDX-License-Identifier: AGPL-3.0-or-later
import type { ComponentType } from 'react'
import type { PlatformTheme } from './types'
import { PRINCIPE, FONT, RADIUS, SHADOW } from './tokens'
import { AGENT_COLORS } from './agent-colors'
import { SEVERITY_CONFIG } from './severity'

/**
 * Default theme that ships with DP. Currently the default DP tokens
 * since they are the canonical reference set. New projects can use
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
      canvas: PRINCIPE.canvas,
      surface: PRINCIPE.surface,
      primary: PRINCIPE.primary,
      primaryLight: PRINCIPE.primaryLight,
      accent: PRINCIPE.accent,
      accentLight: PRINCIPE.accentLight,
      sun: PRINCIPE.sun,
      sunLight: PRINCIPE.sunLight,
      ink: PRINCIPE.ink,
      inkSecondary: PRINCIPE.inkSecondary,
      inkTertiary: PRINCIPE.inkTertiary,
      border: PRINCIPE.border,
      borderSoft: PRINCIPE.borderSoft,
      borderBold: PRINCIPE.borderBold,
    },
    severity: SEVERITY_CONFIG,
    agents: AGENT_COLORS,
    fonts: FONT,
    radius: RADIUS,
    shadow: SHADOW,
  }
}
