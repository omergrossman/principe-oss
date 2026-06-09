// SPDX-License-Identifier: AGPL-3.0-or-later
// Static tokens — importable in server components, client components, anywhere
export * from './tokens'
export * from './agent-colors'
export * from './severity'

// Theme contract
export type { PlatformTheme, ThemeContextValue } from './types'

// Default theme builder + ready-made theme defaults
export { makeDefaultTheme } from './themes'

// React Context glue (client-only)
export { PrincipeThemeProvider, useTheme } from './provider'
