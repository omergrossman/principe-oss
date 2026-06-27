// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, getSession } from "@/lib/session";
import { prisma } from "@/lib/db/prisma";

/**
 * POST /api/auth/login/password — email + password sign-in.
 *
 * The password-based alternative to the passkey assertion at
 * /api/auth/login. Resolves the user by email, verifies the scrypt hash,
 * and issues a session bound to their most recent membership (same shape
 * the passkey path produces).
 *
 * Returns a single generic error for "no such user", "no password set", and
 * "wrong password" so the endpoint can't be used to enumerate accounts.
 */

const GENERIC = "Incorrect email or password.";

export async function POST(req: NextRequest) {
  let body: { email?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!email || !password) {
    return NextResponse.json({ error: GENERIC }, { status: 401 });
  }

  try {
    const dbUser = await prisma.user.findUnique({
      where: { email },
      include: { memberships: { orderBy: { createdAt: "desc" } } },
    });

    // Always run the hash comparison (verifyPassword tolerates a null hash)
    // so the response time doesn't reveal whether the email exists.
    const ok = await verifyPassword(password, dbUser?.passwordHash);
    if (!dbUser || !ok) {
      return NextResponse.json({ error: GENERIC }, { status: 401 });
    }

    if (dbUser.memberships.length === 0) {
      return NextResponse.json(
        { error: "No workspace found", redirect: "/signup" },
        { status: 409 },
      );
    }

    // Prefer the prior active membership if still valid; else most-recent.
    const prior = await getSession();
    const priorMembership =
      prior?.userId === dbUser.id
        ? dbUser.memberships.find((m) => m.id === prior.membershipId)
        : undefined;
    const activeMembership = priorMembership ?? dbUser.memberships[0];

    await prisma.user.update({
      where: { id: dbUser.id },
      data: { lastSignInAt: new Date() },
    });

    await createSession({
      userId: dbUser.id,
      membershipId: activeMembership.id,
      firmId: activeMembership.firmId ?? "",
      portcoId: activeMembership.portcoId,
      role: activeMembership.role,
    });

    return NextResponse.json({ verified: true });
  } catch (e) {
    console.error("[auth/login/password] failed", e);
    return NextResponse.json({ error: "Authentication error" }, { status: 500 });
  }
}
