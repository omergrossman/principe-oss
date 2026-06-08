// SPDX-License-Identifier: AGPL-3.0-or-later
import { redirect } from "next/navigation";
import { getSession, isReAuthFresh, type Session } from "@/lib/session";

/**
 * Server-side auth guards for Principe.
 *
 * Usage in a server component or route handler:
 *
 *   const session = await requireAuth();           // any signed-in user
 *   const session = await requireRole("VC_ADMIN"); // role-scoped
 *   const session = await requireFreshReAuth();    // sensitive action
 */

/** Redirects to /login if no valid session. Returns the session. */
export async function requireAuth(returnTo = ""): Promise<Session> {
  const session = await getSession();
  if (!session) {
    const next = encodeURIComponent(returnTo || "");
    redirect(`/login${next ? `?next=${next}` : ""}`);
  }
  return session;
}

/**
 * Requires the session's role to match one of the allowed roles.
 * 403-equivalent: redirect to /workspace (the safe authenticated landing).
 */
export async function requireRole(
  ...allowed: Session["role"][]
): Promise<Session> {
  const session = await requireAuth();
  if (!allowed.includes(session.role)) {
    redirect("/workspace");
  }
  return session;
}

/**
 * Convenience guard: a tenant admin (V1 admin/member model).
 * VC_ADMIN is the customer's tenant admin in the schema. PRINCIPE_ADMIN
 * (internal operator) is intentionally not included — that's platform
 * staff, not the customer's admin.
 */
export async function requireAdmin(returnTo = ""): Promise<Session> {
  const session = await requireAuth(returnTo);
  if (session.role !== "VC_ADMIN") {
    redirect("/workspace");
  }
  return session;
}

/**
 * Requires re-authentication within the last 5 minutes. If not fresh,
 * redirect to /re-auth?next=<current> — the page runs a passkey ceremony
 * and bounces the user back when stamped.
 */
export async function requireFreshReAuth(
  returnTo: string,
): Promise<Session> {
  const session = await requireAuth();
  if (!isReAuthFresh(session)) {
    redirect(`/re-auth?next=${encodeURIComponent(returnTo)}`);
  }
  return session;
}
