// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { requireAuth } from "@/lib/auth/require-auth";
import {
  archiveProject,
  assertProjectWriteAccess,
  deleteProject,
  renameProject,
  restoreProject,
} from "@/lib/projects/repo";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth("/projects");
  if (!session.firmId) {
    return NextResponse.json({ error: "Organisation required" }, { status: 403 });
  }
  const { id } = await params;
  try {
    await assertProjectWriteAccess(session.firmId, id, session.userId);
    await deleteProject(session.firmId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not delete project.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuth("/projects");
  if (!session.firmId) {
    return NextResponse.json({ error: "Organisation required" }, { status: 403 });
  }
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  try {
    await assertProjectWriteAccess(session.firmId, id, session.userId);
    if (body.action === "archive") {
      await archiveProject(session.firmId, id);
      return NextResponse.json({ ok: true });
    }
    if (body.action === "restore") {
      await restoreProject(session.firmId, id);
      return NextResponse.json({ ok: true });
    }
    if (typeof body.name === "string") {
      await renameProject(session.firmId, id, body.name);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json(
      { error: "Unsupported patch body." },
      { status: 400 },
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not update project.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
