// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { AppTopBar } from "@/components/app/AppTopBar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { prisma } from "@/lib/db/prisma";
import { getProject } from "@/lib/projects/repo";
import { SavedAskDashboard } from "@/app/workspace/SavedAskDashboard";
import { ReuseActions } from "./ReuseActions";

export const dynamic = "force-dynamic";

export default async function SavedAskPage({
  params,
}: {
  params: Promise<{ id: string; askId: string }>;
}) {
  const { id, askId } = await params;
  const session = await requireAuth(`/projects/${id}/history/${askId}`);
  if (!session.firmId) {
    return <p className="p-8 text-ink-500">Organisation required.</p>;
  }

  const isAdminViewer =
    session.role === "VC_ADMIN" || session.role === "PRINCIPE_ADMIN";
  const project = await getProject(
    session.firmId,
    id,
    isAdminViewer ? undefined : session.userId,
  );
  if (!project) {
    return (
      <main className="max-w-3xl mx-auto px-8 py-16 text-center">
        <h1 className="text-[28px] font-bold text-ink-900 mb-2">
          Project not found
        </h1>
        <Button href="/projects" variant="primary" size="md">
          Back to projects
        </Button>
      </main>
    );
  }

  const ask = await prisma.projectAsk.findFirst({
    where: { id: askId, projectId: id },
    select: {
      id: true,
      question: true,
      panelResult: true,
      aggregates: true,
      summary: true,
      validation: true,
      tokensIn: true,
      tokensOut: true,
      costUsd: true,
      durationMs: true,
      createdAt: true,
    },
  });
  if (!ask) {
    return (
      <main className="max-w-3xl mx-auto px-8 py-16 text-center">
        <h1 className="text-[28px] font-bold text-ink-900 mb-2">Ask not found</h1>
        <Button href={`/projects/${id}/history`} variant="primary" size="md">
          Back to history
        </Button>
      </main>
    );
  }

  return (
    <>
      <AppTopBar />
      <main className="max-w-5xl mx-auto px-8 py-10">
        <Link
          href={`/projects/${id}/history`}
          className="inline-flex items-center gap-1.5 text-[13px] text-ink-500 hover:text-ink-900 transition-colors mb-3 font-medium"
        >
          <span aria-hidden>←</span>
          Back to {project.name}
        </Link>
        <nav className="flex items-center gap-2 text-[13px] text-ink-300 mb-3 font-mono">
          <Link href="/projects" className="hover:text-ink-700">
            projects
          </Link>
          <span>›</span>
          <Link href={`/projects/${id}/history`} className="hover:text-ink-700">
            {project.name}
          </Link>
          <span>›</span>
          <span className="text-ink-700">
            {ask.createdAt.toISOString().slice(0, 10)}
          </span>
        </nav>

        <Card className="mb-6">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <h3 className="text-[14px] font-semibold text-ink-900">
              Export
            </h3>
            <div className="flex items-center gap-2 flex-wrap">
              <a
                href={`/api/asks/${askId}/export.pdf`}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-ink-100 bg-canvas h-9 px-4 text-[13px] font-medium text-ink-700 transition-colors hover:border-flare-600 hover:text-flare-600 hover:bg-flare-100/40"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
                aria-hidden
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M9 15h6" />
                <path d="M9 11h2" />
              </svg>
              Executive PDF
            </a>
            <a
              href={`/api/asks/${askId}/export.csv`}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-md border border-ink-100 bg-canvas h-9 px-4 text-[13px] font-medium text-ink-700 transition-colors hover:border-flare-600 hover:text-flare-600 hover:bg-flare-100/40"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
                aria-hidden
              >
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M3 9h18" />
                <path d="M3 15h18" />
                <path d="M9 3v18" />
                <path d="M15 3v18" />
              </svg>
              Spreadsheet (CSV)
            </a>
            </div>
          </div>
        </Card>

        <SavedAskDashboard
          question={ask.question}
          responses={ask.panelResult as never}
          aggregates={ask.aggregates as never}
          summary={ask.summary as never}
          durationMs={ask.durationMs}
          tokensIn={ask.tokensIn}
          tokensOut={ask.tokensOut}
          costUsd={Number(ask.costUsd)}
          validation={ask.validation as never}
          questionActions={<ReuseActions question={ask.question} />}
        />
      </main>
    </>
  );
}
