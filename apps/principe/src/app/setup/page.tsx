// SPDX-License-Identifier: AGPL-3.0-or-later
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db/prisma";
import { SetupForm } from "./SetupForm";

export const dynamic = "force-dynamic";

/**
 * First-run setup wizard.
 *
 * Reachable only when the database has zero users. Once any user exists,
 * this page 404s via redirect — the rest of the app takes over and the
 * setup flow becomes inaccessible (forever, modulo a database reset).
 */
export default async function SetupPage() {
  const userCount = await prisma.user.count();
  if (userCount > 0) {
    redirect("/login");
  }

  return (
    <main className="min-h-screen bg-canvas flex items-center justify-center px-6 py-12">
      <div className="w-full max-w-lg">
        <header className="mb-8 text-center">
          <p className="text-flare-600 uppercase tracking-wide font-semibold text-[11px] mb-2">
            First-run setup
          </p>
          <h1 className="text-[32px] font-bold text-ink-900 tracking-tight leading-[1.1]">
            Welcome to Príncipe.
          </h1>
          <p className="text-[14px] text-ink-500 mt-3 leading-relaxed">
            Three things and you&apos;re running. Your data and keys stay on
            this box — nothing is sent home.
          </p>
        </header>

        <SetupForm />

        <p className="mt-6 text-[11px] text-ink-300 text-center font-mono">
          AGPL-3.0 · self-hosted · v0.1.0-pre
        </p>
      </div>
    </main>
  );
}
