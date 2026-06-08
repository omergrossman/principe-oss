// SPDX-License-Identifier: AGPL-3.0-or-later
import { requireAuth } from "@/lib/auth/require-auth";
import { prisma } from "@/lib/db/prisma";
import { resolveUserDisplay } from "@/lib/user/display";
import { AppTopBar } from "@/components/app/AppTopBar";
import { Card } from "@/components/ui/Card";
import { ProfileForm } from "./ProfileForm";

export const dynamic = "force-dynamic";

export default async function ProfilePage() {
  const session = await requireAuth("/profile");
  const display = await resolveUserDisplay(session);

  const firm = session.firmId
    ? await prisma.firm.findUnique({
        where: { id: session.firmId },
        select: { name: true },
      })
    : null;

  return (
    <>
      <AppTopBar />
      <main className="max-w-2xl mx-auto px-8 py-10">
        <nav className="flex items-center gap-2 text-[13px] text-ink-300 mb-3 font-mono">
          <a href="/workspace" className="hover:text-ink-700">workspace</a>
          <span>›</span>
          <span className="text-ink-700">profile</span>
        </nav>
        <header className="mb-8">
          <h1 className="text-[36px] font-bold text-ink-900 tracking-tight">
            Your profile
          </h1>
          <p className="text-ink-500 mt-2">
            Your display name appears across Principe — in the top bar,
            on asks you create, and in shared views. Email and organisation
            are managed by your admin and can&apos;t be changed here.
          </p>
        </header>

        <Card>
          <ProfileForm
            initialDisplayName={display.displayName}
            email={display.email}
            organisationName={firm?.name ?? "—"}
          />
        </Card>
      </main>
    </>
  );
}
