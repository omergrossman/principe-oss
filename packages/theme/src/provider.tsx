// SPDX-License-Identifier: AGPL-3.0-or-later
'use client'

import { createContext, useContext, type ReactNode } from 'react'
import type { PlatformTheme } from './types'

const ThemeContext = createContext<PlatformTheme | null>(null)

export function PrincipeThemeProvider({
  theme,
  children,
}: {
  theme: PlatformTheme
  children: ReactNode
}) {
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
}

/**
 * Read the active theme. Must be called inside a <PrincipeThemeProvider>.
 * Components that pre-render server-side and want theme can either
 * (a) accept the theme as a prop from a client wrapper, or
 * (b) import the static tokens (PRINCIPE / AGENT_COLORS / SEVERITY_CONFIG)
 *     directly from @principe/theme.
 */
export function useTheme(): PlatformTheme {
  const theme = useContext(ThemeContext)
  if (!theme) {
    throw new Error(
      '[@principe/theme] useTheme() called outside <PrincipeThemeProvider>. ' +
        'Wrap your app root with <PrincipeThemeProvider theme={…}>.',
    )
  }
  return theme
}
