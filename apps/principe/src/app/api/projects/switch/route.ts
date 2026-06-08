import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { requireAuth } from "@/lib/auth/require-auth";
import { prisma } from "@/lib/db/prisma";

const PROJECT_COOKIE = "principe_project_id";
const ONE_YEAR_SEC = 60 * 60 * 24 * 365;

/**
 * POST { projectId } — set the active project for the current
 * session. The cookie is read by /api/ask and the workspace page
 * to resolve which project's panel + history to surface.
 */
export async function POST(req: Request) {
  const session = await requireAuth("/workspace");
  if (!session.firmId) {
    return NextResponse.json({ error: "Organisation required" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const projectId = typeof body.projectId === "string" ? body.projectId : "";
  if (!projectId) {
    return NextResponse.json({ error: "projectId required" }, { status: 400 });
  }
  const project = await prisma.project.findFirst({
    where: { id: projectId, firmId: session.firmId, status: "ACTIVE" },
    select: { id: true, name: true },
  });
  if (!project) {
    return NextResponse.json(
      { error: "Project not found or archived." },
      { status: 404 },
    );
  }
  const jar = await cookies();
  jar.set(PROJECT_COOKIE, project.id, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: ONE_YEAR_SEC,
  });
  return NextResponse.json({ ok: true, project });
}
