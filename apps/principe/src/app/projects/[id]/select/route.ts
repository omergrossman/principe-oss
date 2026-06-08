// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth/require-auth";
import { prisma } from "@/lib/db/prisma";

const PROJECT_COOKIE = "principe_project_id";
const ONE_YEAR_SEC = 60 * 60 * 24 * 365;

/**
 * GET /projects/[id]/select
 *
 * Set the active project cookie and redirect to /workspace. Used as
 * the click target on project cards in /projects so the card both
 * switches the active project and lands the user in its workspace
 * in one navigation.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth("/projects");
  if (!session.firmId) {
    // Relative Location: the browser resolves it against the page's own
    // origin. Building it from `req.url` is wrong behind Docker port-mapping
    // (the container listens on :3000 internally) — it would redirect to the
    // wrong port.
    return new NextResponse(null, {
      status: 303,
      headers: { Location: "/login" },
    });
  }
  const { id } = await params;
  const project = await prisma.project.findFirst({
    // Owner-scoped: selecting makes a project the active ask context, which
    // is always your own. Admins inspect members' projects via the read-only
    // history/settings pages, not by selecting them.
    where: {
      id,
      firmId: session.firmId,
      ownerUserId: session.userId,
      status: "ACTIVE",
    },
    select: { id: true },
  });
  if (!project) {
    return new NextResponse(null, {
      status: 303,
      headers: { Location: "/projects" },
    });
  }
  const jar = await cookies();
  jar.set(PROJECT_COOKIE, project.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SEC,
  });
  return new NextResponse(null, {
    status: 303,
    headers: { Location: "/workspace" },
  });
}
