// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link";
import { requireRole } from "@/lib/auth/require-auth";
import { AppTopBar } from "@/components/app/AppTopBar";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import { NewTranscriptForm } from "./NewTranscriptForm";

export const dynamic = "force-dynamic";

export default async function NewTranscriptPage() {
  const session = await requireRole("PRINCIPE_ADMIN");
  return (
    <>
      <AppTopBar />
      <main className="max-w-4xl mx-auto px-8 py-10">
        <nav className="flex items-center gap-2 text-[13px] text-ink-300 mb-3 font-mono">
          <Link href="/admin" className="hover:text-ink-700">admin</Link>
          <span>›</span>
          <Link href="/admin/knowledge" className="hover:text-ink-700">knowledge</Link>
          <span>›</span>
          <Link href="/admin/knowledge/transcripts" className="hover:text-ink-700">transcripts</Link>
          <span>›</span>
          <span className="text-ink-700">new</span>
        </nav>

        <header className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Pill tone="ink">Principe admin</Pill>
          </div>
          <h1 className="text-[32px] font-bold text-ink-900 tracking-tight">
            Add a CISO transcript
          </h1>
          <p className="text-ink-500 mt-2 max-w-2xl">
            Paste a transcript from a public CISO talk (conference, podcast,
            interview). Distillation extracts 5–20 typed insights tagged for
            routing. Personas matching the speaker&apos;s industry + region
            auto-accumulate the insights as core opinions and vocabulary.
          </p>
        </header>

        <Card>
          <NewTranscriptForm />
        </Card>
      </main>
    </>
  );
}
