// SPDX-License-Identifier: AGPL-3.0-or-later
import { makeDefaultTheme } from "@dp/theme";
import { PrincipeWordmark } from "@/components/brand/PrincipeWordmark";

/**
 * Principe's PlatformTheme. Built from DP's default tokens.
 *
 * The DP tokens (defined in @dp/theme/tokens) are Fable's canonical
 * reference. Principe overrides at the design-system level via
 * Tailwind 4 @theme tokens in globals.css (ink/flare/canvas/etc.),
 * which is the operator-grade pattern. The DP token object is consumed
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
