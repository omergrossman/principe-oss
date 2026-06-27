// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from "next/server";
import { verifyPassword } from "@/lib/auth/password";
import { getSession, markReAuth } from "@/lib/session";
import { prisma } from "@/lib/db/prisma";

/**
 * POST /api/auth/re-auth/password — password re-auth for sensitive actions.
 *
 * The password-based alternative to the passkey re-auth at
 * /api/auth/re-auth. Verifies the signed-in user's password and stamps
 * `reAuthAt` on the existing session (no new session is issued).
 */

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  let body: { password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const password = typeof body.password === "string" ? body.password : "";
  if (!password) {
    return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { passwordHash: true },
    });
    if (!user?.passwordHash) {
      return NextResponse.json(
        { error: "No password is set on this account." },
        { status: 400 },
      );
    }

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) {
      return NextResponse.json({ error: "Incorrect password." }, { status: 401 });
    }

    await markReAuth();
    return NextResponse.json({ verified: true });
  } catch (e) {
    console.error("[auth/re-auth/password] failed", e);
    return NextResponse.json({ error: "Re-auth error" }, { status: 500 });
  }
}
