import Link from "next/link";
import { requireRole } from "@/lib/auth/require-auth";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { AppTopBar } from "@/components/app/AppTopBar";

// Sprint 4 — admin index. PRINCIPE_ADMIN-only entry to internal surfaces.
// Future admin pages register here so the namespace doesn't sprawl.

export const dynamic = "force-dynamic";

export default async function AdminIndexPage() {
  const session = await requireRole("PRINCIPE_ADMIN");

  return (
    <>
      <AppTopBar />
      <main className="max-w-3xl mx-auto px-8 py-10">
        <header className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Pill tone="ink">Principe admin</Pill>
          </div>
          <h1 className="text-[36px] font-bold text-ink-900 tracking-tight">
            Admin
          </h1>
          <p className="text-ink-500 mt-2">
            Internal surfaces. End users don&apos;t see anything under /admin.
          </p>
        </header>

        <div className="space-y-3">
          <AdminLink
            href="/admin/knowledge"
            title="Knowledge base"
            description="Curated industry sources + CISO transcripts that brief every panel response."
          />
          <AdminLink
            href="/admin/personas"
            title="Personas"
            description="Read-only view of all personas with their transcript-anchored depth (Sprint 5)."
          />
          <AdminLink
            href="/admin/validations"
            title="Validation traces"
            description="Statistician verdicts + reasoning traces, audit-ready."
          />
        </div>
      </main>
    </>
  );
}

function AdminLink({
  href,
  title,
  description,
}: {
  href: string;
  title: string;
  description: string;
}) {
  return (
    <Link href={href} className="block">
      <Card className="hover:border-flare-600/30 transition-colors">
        <h2 className="text-[16px] font-semibold text-ink-900 mb-1">{title}</h2>
        <p className="text-[13px] text-ink-500 leading-relaxed">{description}</p>
      </Card>
    </Link>
  );
}
