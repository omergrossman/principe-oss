// SPDX-License-Identifier: AGPL-3.0-or-later
import { makeDefaultTheme } from "@principe/theme";
import { PrincipeWordmark } from "@/components/brand/PrincipeWordmark";

/**
 * Principe's PlatformTheme. Built from the default design tokens.
 *
 * The design tokens (defined in @principe/theme/tokens) are the canonical
 * reference. Principe overrides at the design-system level via
 * Tailwind 4 @theme tokens in globals.css (ink/flare/canvas/etc.),
 * which is the operator-grade pattern. The token object is consumed
 * primarily for runtime theming (component-level overrides) and
 * for brand metadata (Wordmark, favicon, tagline).
 *
 * Brand promise reflected in the tagline:
 *   "Prove what's coming before reality runs the experiment."
 */
export const principeTheme = makeDefaultTheme({
  name: "principe",
  Wordmark: PrincipeWordmark,
  favicon: "/favicon.ico",
  tagline: "Prove what's coming before reality runs the experiment.",
});
