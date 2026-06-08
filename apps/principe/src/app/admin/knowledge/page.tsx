// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link";
import { prisma } from "@/lib/db/prisma";
import { requireRole } from "@/lib/auth/require-auth";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { AppTopBar } from "@/components/app/AppTopBar";
import { KnowledgeSources } from "@/app/settings/KnowledgeSources";
import { VendorCardForm } from "./VendorCardForm";

// Sprint 4 — admin-only knowledge base curation.
//
// Why this surface exists, and why it's *not* under /settings: the
// firm-wide knowledge base is Principe's competitive moat — the curated
// content that informs the CISO panel. End users see panel responses;
// they do not see the recipe. Project-specific materials (founder's
// pitch deck etc.) remain user-facing at /projects/[id]/sources. This
// surface is gated to PRINCIPE_ADMIN.

export const dynamic = "force-dynamic";

export default async function AdminKnowledgePage() {
  const session = await requireRole("PRINCIPE_ADMIN");
  const firm = await prisma.firm.findUnique({
    where: { id: session.firmId },
    select: { name: true, region: true },
  });

  return (
    <>
      <AppTopBar />
      <main className="max-w-4xl mx-auto px-8 py-10">
        <nav className="flex items-center gap-2 text-[13px] text-ink-300 mb-3 font-mono">
          <Link href="/admin" className="hover:text-ink-700">admin</Link>
          <span>›</span>
          <span className="text-ink-700">knowledge</span>
        </nav>

        <header className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Pill tone="ink">Principe admin</Pill>
            <span className="text-[12px] text-ink-300 font-mono">
              {firm?.name} · region {firm?.region}
            </span>
          </div>
          <h1 className="text-[36px] font-bold text-ink-900 tracking-tight">
            Knowledge base
          </h1>
          <p className="text-ink-500 mt-2 max-w-2xl">
            Curated industry intelligence that informs every CISO panel
            response. End users don&apos;t see this list — they see panel
            output. Project-specific materials live under each project&apos;s
            own sources page.
          </p>
        </header>

        <Card className="mb-6 hover:border-flare-600/30 transition-colors">
          <Link href="/admin/knowledge/transcripts" className="block group">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-[16px] font-semibold text-ink-900 group-hover:text-flare-600 transition-colors mb-1">
                  CISO transcripts →
                </h2>
                <p className="text-[13px] text-ink-500 leading-relaxed">
                  Sprint 5 — curated talks from public CISO presentations.
                  Distillation extracts typed insights that route into agent
                  briefings and anchor matching personas&apos; opinions. The
                  moat content.
                </p>
              </div>
            </div>
          </Link>
        </Card>

        <Card>
          <KnowledgeSources />
        </Card>

        <Card className="mt-6">
          <div className="mb-3">
            <h2 className="text-[18px] font-semibold text-ink-900 mb-1">
              Vendor cards
            </h2>
            <p className="text-[13px] text-ink-500 leading-relaxed max-w-2xl">
              Handcrafted vendor metadata that briefs agents on buying
              decisions. Distinct from URL or file sources — these are
              structured by Principe, then distilled into a vendor card
              for routing into industry-relevant briefings.
            </p>
          </div>
          <VendorCardForm />
        </Card>
      </main>
    </>
  );
}
