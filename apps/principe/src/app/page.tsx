import { LaunchSplash } from "./LaunchSplash";

/**
 * Application root — the launch splash.
 *
 * Shows the Príncipe eclipse mark with an animated counter that ticks
 * "0 → 100 CISO agents created" while POST /api/launch/init seeds the
 * panel + pings the user's Anthropic key (if configured). After a
 * minimum 3-second window AND the init completing, the page redirects
 * to /workspace (authed) or /login (unauthed).
 */

export default function RootPage() {
  return <LaunchSplash />;
}
