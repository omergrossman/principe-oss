import { prisma } from "@/lib/db/prisma";
import type { Session } from "@/lib/session";

/**
 * Server-side resolver for the display info shown in the TopBar and
 * elsewhere in the UI. The product never shows email — only the display
 * name. If `User.name` is null (legacy row or a freshly-bootstrapped
 * admin without an explicit name set), we derive it from the email's
 * local-part on first read and persist it so subsequent reads are stable.
 */
export interface UserDisplay {
  userId: string;
  email: string;
  displayName: string;
  initials: string;
}

function deriveDisplayName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return (
    local
      .split(/[._-]+/)
      .filter(Boolean)
      .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
      .join(" ") || email
  );
}

export function initialsFor(displayName: string): string {
  const cleaned = displayName.trim();
  if (!cleaned) return "??";
  const parts = cleaned.split(/\s+/).slice(0, 2);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }
  return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
}

export async function resolveUserDisplay(
  session: Session,
): Promise<UserDisplay> {
  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { id: true, email: true, name: true },
  });
  if (!user) {
    // Should not happen in practice — guards make sure session.userId
    // points to a real row — but a stale cookie could trigger this.
    return {
      userId: session.userId,
      email: "",
      displayName: "User",
      initials: "??",
    };
  }
  let displayName = user.name?.trim() || "";
  if (!displayName) {
    displayName = deriveDisplayName(user.email);
    await prisma.user
      .update({ where: { id: user.id }, data: { name: displayName } })
      .catch(() => undefined);
  }
  return {
    userId: user.id,
    email: user.email,
    displayName,
    initials: initialsFor(displayName),
  };
}
