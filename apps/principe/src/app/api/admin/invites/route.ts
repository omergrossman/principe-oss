import { NextRequest, NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-auth";
import { createInvite, listPendingInvites } from "@/lib/invites/repo";
import { sendEmail } from "@/lib/email/send";
import { prisma } from "@/lib/db/prisma";

/** Resolve the user-facing accept URL from the request origin. */
function acceptUrl(req: NextRequest, token: string): string {
  const proto = req.headers.get("x-forwarded-proto") ?? "https";
  const host =
    req.headers.get("x-forwarded-host") ??
    req.headers.get("host") ??
    "localhost:3000";
  return `${proto}://${host}/accept-invite?token=${token}`;
}

export async function GET() {
  const session = await requireAdmin();
  if (!session.firmId) {
    return NextResponse.json({ error: "Organisation required" }, { status: 403 });
  }
  const invites = await listPendingInvites(session.firmId);
  return NextResponse.json({
    invites: invites.map((i) => ({
      id: i.id,
      email: i.email,
      role: i.role === "VC_ADMIN" ? "ADMIN" : "MEMBER",
      expiresAt: i.expiresAt.toISOString(),
      createdAt: i.createdAt.toISOString(),
    })),
  });
}

export async function POST(req: NextRequest) {
  const session = await requireAdmin();
  if (!session.firmId) {
    return NextResponse.json({ error: "Organisation required" }, { status: 403 });
  }

  const body = await req.json().catch(() => ({}));
  const email = typeof body?.email === "string" ? body.email : "";
  const role =
    body?.role === "ADMIN" || body?.role === "MEMBER" ? body.role : "MEMBER";

  try {
    const invite = await createInvite({
      firmId: session.firmId,
      invitedById: session.userId,
      email,
      role,
    });

    const link = acceptUrl(req, invite.token);

    // Fire-and-await the email; non-fatal if it fails — link is always
    // returned to the admin so they can share manually.
    const firm = await prisma.firm.findUnique({
      where: { id: session.firmId },
      select: { name: true },
    });
    const inviter = await prisma.user.findUnique({
      where: { id: session.userId },
      select: { name: true, email: true },
    });
    const orgName = firm?.name ?? "your organisation";
    const inviterName = inviter?.name ?? inviter?.email ?? "your admin";
    const roleLabel = role === "ADMIN" ? "admin" : "member";
    const subject = `${inviterName} invited you to ${orgName} on Principe`;
    const text = [
      `${inviterName} added you as a ${roleLabel} on Principe — ${orgName}.`,
      "",
      `Accept your invite: ${link}`,
      "",
      "This link expires in 7 days.",
    ].join("\n");
    const html = `
      <div style="font-family:Inter,system-ui,sans-serif;color:#0a1430;max-width:520px">
        <h2 style="margin:0 0 12px;font-size:20px;font-weight:700">You're invited to ${escapeHtml(orgName)} on Príncipe</h2>
        <p style="margin:0 0 16px;font-size:14px;line-height:1.55">
          <strong>${escapeHtml(inviterName)}</strong> added you as a <strong>${roleLabel}</strong>.
          Click below to accept and set up your account.
        </p>
        <p style="margin:0 0 24px">
          <a href="${link}" style="display:inline-block;background:#0a1430;color:#fff;padding:10px 18px;border-radius:6px;text-decoration:none;font-size:14px;font-weight:600">Accept invite</a>
        </p>
        <p style="margin:0;font-size:12px;color:#7a8294">This link expires in 7 days.</p>
      </div>
    `;
    const delivery = await sendEmail({
      to: invite.email,
      subject,
      html,
      text,
    });

    return NextResponse.json({
      ok: true,
      invite: {
        id: invite.id,
        email: invite.email,
        role,
        expiresAt: invite.expiresAt.toISOString(),
      },
      link,
      delivery,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create invite.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
