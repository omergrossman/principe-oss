import { cookies } from "next/headers";
import { encodeSession, decodeSession } from "@dp/rbac";

const SESSION_COOKIE = "principe_session";
const SESSION_MAX_AGE = 60 * 60 * 8; // 8h sliding (per ADR + spec)

/**
 * Principe session payload.
 *
 * Workspaces are two-tier: Firm (top) + Portco (sub). A user is either
 * a VC admin (firmId set, portcoId null) or a portco founder (both set).
 * Principe admins (internal) flag as `isAdmin`.
 *
 * The session carries the resolved active membership so every API route
 * can do tenant filtering server-side without re-resolving on every request.
 *
 * `createdAt` powers the 8h sliding window — decodeSession enforces maxAge,
 * and getSession refreshes the cookie on each call (sliding).
 */
export interface Session {
  userId: string;
  membershipId: string;
  firmId: string;
  portcoId: string | null; // null = VC-admin session
  role: "VC_ADMIN" | "PORTCO_FOUNDER" | "PRINCIPE_ADMIN";
  createdAt: number;
  // Re-auth marker — set when the user re-authenticated for a sensitive
  // action. Compared against an action's required-recency threshold.
  reAuthAt?: number;
}

function isSession(value: unknown): value is Session {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Partial<Session>;
  return (
    typeof v.userId === "string" &&
    typeof v.membershipId === "string" &&
    typeof v.firmId === "string" &&
    (v.portcoId === null || typeof v.portcoId === "string") &&
    typeof v.role === "string" &&
    typeof v.createdAt === "number"
  );
}

export async function getSession(): Promise<Session | null> {
  const store = await cookies();
  const raw = store.get(SESSION_COOKIE)?.value;
  return decodeSession<Session>(raw, {
    validate: isSession,
    maxAgeSec: SESSION_MAX_AGE,
  });
}

export async function createSession(
  payload: Omit<Session, "createdAt">,
): Promise<void> {
  const store = await cookies();
  const session: Session = { ...payload, createdAt: Date.now() };
  store.set(SESSION_COOKIE, encodeSession(session), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_MAX_AGE,
    path: "/",
  });
}

export async function destroySession(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
}

/**
 * Stamp the session with reAuthAt = now. Called after a successful passkey
 * re-auth before a sensitive action (force-override, billing, de-provision).
 */
export async function markReAuth(): Promise<void> {
  const current = await getSession();
  if (!current) return;
  await createSession({ ...current, reAuthAt: Date.now() });
}

const RE_AUTH_FRESHNESS_MS = 5 * 60 * 1000; // 5 minutes

/** True if the session was re-authenticated in the last 5 minutes. */
export function isReAuthFresh(session: Session): boolean {
  if (!session.reAuthAt) return false;
  return Date.now() - session.reAuthAt < RE_AUTH_FRESHNESS_MS;
}
