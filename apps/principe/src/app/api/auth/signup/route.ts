import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db/prisma";
import { createSession } from "@/lib/session";

/**
 * POST /api/auth/signup
 *
 * Creates a User + Firm + VC-admin Membership in one transaction and
 * issues a session. Used by VC partners signing up their firm.
 *
 * Portco founders DO NOT use this endpoint — they accept invitations via
 * /api/auth/accept-invite (Story 02.2).
 *
 * Request body:  { email, name, firmName }
 * Response 200:  { ok: true, redirectTo: "/onboarding/enroll-passkey" }
 * Errors:        400 invalid input · 409 email already in use
 */

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface SignupBody {
  email?: unknown;
  name?: unknown;
  firmName?: unknown;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

function randomSuffix(len: number): string {
  const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
  let out = "";
  for (let i = 0; i < len; i++)
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

async function uniqueVcFirmSlug(name: string): Promise<string> {
  const base = slugify(name) || "firm";
  for (let attempt = 0; attempt < 6; attempt++) {
    const candidate = attempt === 0 ? base : `${base}-${randomSuffix(4)}`;
    const existing = await prisma.firm.findUnique({
      where: { slug: candidate },
    });
    if (!existing) return candidate;
  }
  return `${base}-${randomSuffix(8)}`;
}

export async function POST(req: NextRequest) {
  let body: SignupBody;
  try {
    body = (await req.json()) as SignupBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const firmName =
    typeof body.firmName === "string" ? body.firmName.trim() : "";

  if (!email || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { error: "Please enter a valid email." },
      { status: 400 },
    );
  }
  if (!name) {
    return NextResponse.json(
      { error: "Please enter your name." },
      { status: 400 },
    );
  }
  if (!firmName) {
    return NextResponse.json(
      { error: "Please enter your firm name." },
      { status: 400 },
    );
  }

  const slug = await uniqueVcFirmSlug(firmName);

  try {
    const { user, membership, firm } = await prisma.$transaction(
      async (tx) => {
        const user = await tx.user.create({
          data: { email, name },
        });
        const firm = await tx.firm.create({
          data: { name: firmName, slug, region: "us" },
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

    // OSS distribution: no billing, go straight to passkey enrollment.
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
    console.error("[auth/signup] failed", e);
    return NextResponse.json(
      { error: "Signup failed. Please try again." },
      { status: 500 },
    );
  }
}
