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
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth("/projects");
  if (!session.firmId) {
    return NextResponse.redirect(new URL("/login", req.url), 303);
  }
  const { id } = await params;
  const project = await prisma.project.findFirst({
    where: { id, firmId: session.firmId, status: "ACTIVE" },
    select: { id: true },
  });
  if (!project) {
    return NextResponse.redirect(new URL("/projects", req.url), 303);
  }
  const jar = await cookies();
  jar.set(PROJECT_COOKIE, project.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SEC,
  });
  return NextResponse.redirect(new URL("/workspace", req.url), 303);
}
