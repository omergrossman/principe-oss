// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { AppTopBar } from "@/components/app/AppTopBar";
import { Card } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { Pill } from "@/components/ui/Pill";
import { getProject } from "@/lib/projects/repo";
import { ProjectSettingsForm } from "./ProjectSettingsForm";

export const dynamic = "force-dynamic";

export default async function ProjectSettingsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await requireAuth(`/projects/${id}/settings`);
  if (!session.firmId) {
    return <p className="p-8 text-ink-500">Organisation required.</p>;
  }
  const project = await getProject(session.firmId, id);
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
      <main className="max-w-3xl mx-auto px-8 py-10">
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
          <span className="text-ink-700">settings</span>
        </nav>

        <header className="mb-8">
          <div className="flex items-center gap-2 mb-2">
            <Pill tone="accent">project settings</Pill>
            {project.isDefault && <Pill tone="default">default</Pill>}
            {project.status === "ARCHIVED" && (
              <Pill tone="ink">archived</Pill>
            )}
          </div>
          <h1 className="text-[36px] font-bold text-ink-900 tracking-tight">
            {project.name}
          </h1>
          <p className="text-ink-500 mt-2">
            {project.agentsCount} agents · {project.asksCount} asks
          </p>
        </header>

        <Card>
          <ProjectSettingsForm
            projectId={project.id}
            currentName={project.name}
            isDefault={project.isDefault}
            isArchived={project.status === "ARCHIVED"}
          />
        </Card>
      </main>
    </>
  );
}
