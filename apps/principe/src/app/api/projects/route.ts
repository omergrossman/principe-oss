// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import { createProject, listProjects } from "@/lib/projects/repo";
import { normaliseComposition } from "@/lib/projects/composition";

export async function GET(req: Request) {
  const session = await requireAuth("/workspace");
  if (!session.firmId) {
    return NextResponse.json({ error: "Organisation required" }, { status: 403 });
  }
  const url = new URL(req.url);
  const includeArchived = url.searchParams.get("archived") === "1";
  const projects = await listProjects(session.firmId, { includeArchived });
  return NextResponse.json({ projects });
}

export async function POST(req: Request) {
  const session = await requireAuth("/workspace");
  if (!session.firmId) {
    return NextResponse.json({ error: "Organisation required" }, { status: 403 });
  }
  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name : "";
  if (!body.composition || typeof body.composition !== "object") {
    return NextResponse.json(
      { error: "composition is required" },
      { status: 400 },
    );
  }
  try {
    const composition = normaliseComposition(body.composition);
    // Sprint 7 — panel size, range 30-200. Defaults to 100 if omitted
    // (legacy callers + wizard preview). Server clamps in createProject.
    const panelSize =
      typeof body.panelSize === "number" ? body.panelSize : undefined;
    const result = await createProject({
      firmId: session.firmId,
      ownerUserId: session.userId,
      name,
      composition,
      panelSize,
    });
    return NextResponse.json({ project: result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not create project.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
