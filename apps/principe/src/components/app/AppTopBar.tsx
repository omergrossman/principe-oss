// SPDX-License-Identifier: AGPL-3.0-or-later
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
  const isAdmin =
    session.role === "VC_ADMIN" || session.role === "PRINCIPE_ADMIN";
  return (
    <TopBar displayName={display.displayName} isAdmin={isAdmin} signedIn />
  );
}
