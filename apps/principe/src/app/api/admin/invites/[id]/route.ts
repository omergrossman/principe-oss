// SPDX-License-Identifier: AGPL-3.0-or-later
import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/require-auth";
import { revokeInvite } from "@/lib/invites/repo";

export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAdmin();
  if (!session.firmId) {
    return NextResponse.json({ error: "Organisation required" }, { status: 403 });
  }
  const { id } = await params;
  try {
    await revokeInvite(session.firmId, id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not revoke invite.";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
