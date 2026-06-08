// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db/prisma";
import { createSession } from "@/lib/session";
import { encryptSecret, last4 } from "@/lib/secrets";

/**
 * POST /api/setup
 *
 * First-run wizard endpoint. Creates the workspace + admin user +
 * stores the Anthropic key, all in one transaction. Only callable
 * when the user table is empty — any subsequent call returns 409.
 *
 * Request body:
 *   workspaceName  string  (≥2 chars)
 *   adminName      string  (≥2 chars)
 *   adminEmail     string  (valid email)
 *   anthropicKey   string  (starts with sk-ant-)
 *
 * Response 200:  { ok: true, redirectTo: "/onboarding/enroll-passkey" }
 * Errors:        400 invalid input · 409 already set up · 502 anthropic key rejected
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SetupBody {
  workspaceName?: unknown;
  adminName?: unknown;
  adminEmail?: unknown;
  anthropicKey?: unknown;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "workspace"
  );
}

function randomSuffix(len: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++)
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

export async function POST(req: NextRequest) {
  // Guard: only callable while the box is unset.
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    return NextResponse.json(
      { error: "Setup has already been completed." },
      { status: 409 },
    );
  }

  let body: SetupBody;
  try {
    body = (await req.json()) as SetupBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const workspaceName =
    typeof body.workspaceName === "string" ? body.workspaceName.trim() : "";
  const adminName =
    typeof body.adminName === "string" ? body.adminName.trim() : "";
  const adminEmail =
    typeof body.adminEmail === "string"
      ? body.adminEmail.trim().toLowerCase()
      : "";
  const anthropicKey =
    typeof body.anthropicKey === "string" ? body.anthropicKey.trim() : "";

  if (workspaceName.length < 2) {
    return NextResponse.json(
      { error: "Workspace name must be at least 2 characters." },
      { status: 400 },
    );
  }
  if (adminName.length < 2) {
    return NextResponse.json(
      { error: "Your display name must be at least 2 characters." },
      { status: 400 },
    );
  }
  if (!EMAIL_RE.test(adminEmail)) {
    return NextResponse.json(
      { error: "Please enter a valid email." },
      { status: 400 },
    );
  }
  if (!anthropicKey.startsWith("sk-ant-")) {
    return NextResponse.json(
      { error: "Anthropic keys start with sk-ant-…" },
      { status: 400 },
    );
  }

  // Validate the Anthropic key with a cheap real API call before
  // persisting. Bad keys fail loudly instead of silently breaking the
  // first panel run.
  try {
    const client = new Anthropic({ apiKey: anthropicKey });
    await client.models.list({ limit: 1 });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown";
    return NextResponse.json(
      {
        error:
          msg.toLowerCase().includes("401") || msg.toLowerCase().includes("auth")
            ? "Key rejected by Anthropic (auth failure)."
            : `Key validation failed: ${msg.slice(0, 120)}`,
      },
      { status: 502 },
    );
  }

  const slug = slugify(workspaceName);
  const ciphertext = encryptSecret(anthropicKey);

  try {
    const { user, membership, firm } = await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: { email: adminEmail, name: adminName },
        });
        const firm = await tx.firm.create({
          data: {
            name: workspaceName,
            slug: `${slug}-${randomSuffix(4)}`,
            region: "us",
            anthropicKeyCiphertext: ciphertext,
            anthropicKeyLast4: last4(anthropicKey),
          },
        });
        const membership = await tx.membership.create({
          data: { userId: user.id, firmId: firm.id, role: "VC_ADMIN" },
        });
        return { user, membership, firm };
      },
    );

    await createSession({
      userId: user.id,
      membershipId: membership.id,
      firmId: firm.id,
      portcoId: null,
      role: "VC_ADMIN",
    });

    return NextResponse.json({
      ok: true,
      redirectTo: "/onboarding/enroll-passkey",
    });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002") {
        return NextResponse.json(
          { error: "An account already exists with this email." },
          { status: 409 },
        );
      }
    }
    console.error("[api/setup] failed", e);
    return NextResponse.json(
      { error: "Setup failed. Please try again." },
      { status: 500 },
    );
  }
}
