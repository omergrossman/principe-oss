// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from "next/server";
import {
  hashPassword,
  verifyPassword,
  MIN_PASSWORD_LENGTH,
} from "@/lib/auth/password";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db/prisma";

/**
 * POST /api/account/password — set or change the signed-in user's password.
 *
 * Lets a passkey-first user opt into a password (alternative sign-in), and
 * lets an existing password be rotated. Requires a valid session. When a
 * password is already set, the current one must be supplied; setting the
 * first password only needs the session (you're already authenticated, via
 * passkey or an existing session).
 *
 * Body: { newPassword: string, currentPassword?: string }
 *   { ok: true, hadPassword }  — hadPassword tells the UI whether this was a
 *                                change (true) or a first set (false).
 */

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }

  let body: { newPassword?: unknown; currentPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const newPassword =
    typeof body.newPassword === "string" ? body.newPassword : "";
  const currentPassword =
    typeof body.currentPassword === "string" ? body.currentPassword : "";

  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` },
      { status: 400 },
    );
  }

  try {
    const user = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { passwordHash: true },
    });
    if (!user) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }

    // Changing an existing password requires proving you know it.
    if (user.passwordHash) {
      const ok = await verifyPassword(currentPassword, user.passwordHash);
      if (!ok) {
        return NextResponse.json(
          { error: "Current password is incorrect." },
          { status: 401 },
        );
      }
    }

    const passwordHash = await hashPassword(newPassword);
    await prisma.user.update({
      where: { id: session.userId },
      data: { passwordHash },
    });

    return NextResponse.json({ ok: true, hadPassword: Boolean(user.passwordHash) });
  } catch (e) {
    console.error("[account/password] failed", e);
    return NextResponse.json(
      { error: "Could not update password." },
      { status: 500 },
    );
  }
}
