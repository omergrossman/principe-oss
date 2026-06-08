// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { AppTopBar } from "@/components/app/AppTopBar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { getProject } from "@/lib/projects/repo";
import { ProjectSources } from "./ProjectSources";

export const dynamic = "force-dynamic";

export default async function ProjectSourcesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth(`/projects/${id}/sources`);
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

  return (
    <>
      <AppTopBar />
      <main className="max-w-4xl mx-auto px-8 py-10">
        <nav className="flex items-center gap-2 text-[13px] text-ink-300 mb-3 font-mono">
          <Link href="/projects" className="hover:text-ink-700">
            projects
          </Link>
          <span>›</span>
          <Link
            href={`/projects/${id}/history`}
            className="hover:text-ink-700"
          >
            {project.name}
          </Link>
          <span>›</span>
          <span className="text-ink-700">sources</span>
        </nav>

        <header className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Pill tone="accent">project sources</Pill>
            {project.isDefault && <Pill tone="default">default project</Pill>}
          </div>
          <h1 className="text-[36px] font-bold text-ink-900 tracking-tight">
            Sources for {project.name}
          </h1>
          <p className="text-ink-500 mt-2 max-w-2xl">
            Pitch decks, company sites, specific threat reports — anything
            that should anchor this project&apos;s panel.{" "}
            <strong className="text-ink-700">
              Project sources rank above firm-wide sources
            </strong>{" "}
            at fan-out time, so the panel reads them first when building
            each agent&apos;s briefing.
          </p>
        </header>

        <Card>
          <ProjectSources projectId={id} />
        </Card>

        <p className="text-[12px] text-ink-300 mt-4 leading-relaxed">
          Looking for firm-wide sources (the 28 curated feeds + global
          uploads)? They&apos;re in{" "}
          <Link
            href="/settings"
            className="text-flare-600 hover:text-flare-500 underline underline-offset-4"
          >
            Settings
          </Link>{" "}
          and apply to every project automatically.
        </p>
      </main>
    </>
  );
}
