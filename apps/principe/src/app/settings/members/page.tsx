// SPDX-License-Identifier: AGPL-3.0-or-later
import { requireAdmin } from "@/lib/auth/require-auth";
import { prisma } from "@/lib/db/prisma";
import { listPendingInvites } from "@/lib/invites/repo";
import { getAdminQuota } from "@/lib/bootstrap/admin-quota";
import { AppTopBar } from "@/components/app/AppTopBar";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { MembersAdminClient } from "./MembersAdminClient";

export const dynamic = "force-dynamic";

export default async function MembersAdminPage() {
  const session = await requireAdmin("/settings/members");
  if (!session.firmId) {
    return <p className="p-8 text-ink-500">Organisation required.</p>;
  }

  const [firm, memberships, pendingInvites, quota] = await Promise.all([
    prisma.firm.findUnique({
      where: { id: session.firmId },
      select: { name: true },
    }),
    prisma.membership.findMany({
      where: { firmId: session.firmId },
      include: {
        user: {
          select: { id: true, email: true, name: true, lastSignInAt: true },
        },
      },
      orderBy: { createdAt: "asc" },
    }),
    listPendingInvites(session.firmId),
    getAdminQuota(session.firmId),
  ]);

  const members = memberships.map((m) => ({
    membershipId: m.id,
    userId: m.user.id,
    email: m.user.email,
    displayName: m.user.name ?? m.user.email.split("@")[0],
    role: m.role === "VC_ADMIN" ? ("ADMIN" as const) : ("MEMBER" as const),
    lastSignInAt: m.user.lastSignInAt?.toISOString() ?? null,
    isYou: m.user.id === session.userId,
  }));

  const invites = pendingInvites.map((i) => ({
    id: i.id,
    email: i.email,
    role: i.role === "VC_ADMIN" ? ("ADMIN" as const) : ("MEMBER" as const),
    expiresAt: i.expiresAt.toISOString(),
    createdAt: i.createdAt.toISOString(),
  }));

  return (
    <>
      <AppTopBar />
      <main className="max-w-4xl mx-auto px-8 py-10">
        <nav className="flex items-center gap-2 text-[13px] text-ink-300 mb-3 font-mono">
          <a href="/workspace" className="hover:text-ink-700">workspace</a>
          <span>›</span>
          <a href="/settings" className="hover:text-ink-700">settings</a>
          <span>›</span>
          <span className="text-ink-700">members</span>
        </nav>
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Pill tone="accent">admin</Pill>
            <span className="text-[12px] text-ink-300 font-mono">
              {firm?.name}
            </span>
          </div>
          <h1 className="text-[36px] font-bold text-ink-900 tracking-tight">
            Members
          </h1>
          <p className="text-ink-500 mt-2 max-w-2xl">
            Invite teammates and manage roles. Admins can invite others
            and see every project across the organisation. Members can
            only see and work on their own projects.
          </p>
        </header>

        <Card>
          <MembersAdminClient
            members={members}
            invites={invites}
            adminQuota={quota}
          />
        </Card>
      </main>
    </>
  );
}
