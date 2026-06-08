import { getSession } from "@/lib/session";
import { resolveUserDisplay } from "@/lib/user/display";
import { TopBar } from "./TopBar";

/**
 * Server-component wrapper. Resolves the current session + display name
 * once so individual pages don't repeat the user-fetch boilerplate.
 *
 * Pages that already gate with requireAuth() can render <AppTopBar />
 * with no props; pages reachable while unauthenticated render a stub
 * (signed-out TopBar) if no session is present.
 */
export async function AppTopBar() {
  const session = await getSession();
  if (!session) {
    return <TopBar displayName="Signed out" />;
  }
  const display = await resolveUserDisplay(session);
  return <TopBar displayName={display.displayName} />;
}
