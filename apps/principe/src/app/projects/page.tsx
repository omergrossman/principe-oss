// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { AppTopBar } from "@/components/app/AppTopBar";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Pill } from "@/components/ui/Pill";
import {
  ensureDefaultProject,
} from "@/lib/projects/bootstrap";
import { listProjects, type ProjectListItem } from "@/lib/projects/repo";
import { projectDisplayName } from "@/lib/projects/describe";
import { DeleteProjectControl } from "./DeleteProjectControl";
import { ArchiveProjectControl } from "./ArchiveProjectControl";

export const dynamic = "force-dynamic";

interface SearchParams {
  archived?: string;
}

export default async function ProjectsIndexPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireAuth("/projects");
  if (!session.firmId) {
    return <p className="p-8 text-ink-500">Organisation required.</p>;
  }
  // Ensure the current user has their own Default project. Admins get
  // theirs too — the org view below shows everyone's, including their
  // own.
  await ensureDefaultProject(session.firmId, session.userId);

  const params = await searchParams;
  const includeArchived = params.archived === "1";
  const isAdmin = session.role === "VC_ADMIN";

  // Admins read the whole organisation; members only their own projects.
  const projects = await listProjects(session.firmId, {
    includeArchived,
    ownerUserId: isAdmin ? undefined : session.userId,
  });

  const active = projects.filter((p) => p.status === "ACTIVE");
  const archived = projects.filter((p) => p.status === "ARCHIVED");

  // For the admin view, group projects by owner so the page is scannable.
  // Members see a flat grid (it's all theirs anyway).
  const activeGrouped = isAdmin ? groupByOwner(active, session.userId) : null;
  const archivedGrouped = isAdmin
    ? groupByOwner(archived, session.userId)
    : null;

  return (
    <>
      <AppTopBar />
      <main className="max-w-5xl mx-auto px-8 py-10">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div>
            <p className="text-[12px] text-flare-600 uppercase tracking-wide font-semibold mb-2">
              {isAdmin ? "Organisation projects" : "Projects"}
            </p>
            <h1 className="text-[36px] font-bold text-ink-900 tracking-tight">
              {isAdmin ? "All projects" : "Your projects"}
            </h1>
            <p className="text-ink-500 mt-2 max-w-2xl">
              {isAdmin
                ? "Read-only view of every member's projects. You can open and inspect them, but only the owner can edit, run asks, archive, or delete. Use /settings/members to manage who has access."
                : "Each project owns its own panel, knowledge sources, and ask history. Pick one to continue, or create a new one with a tailored panel composition."}
            </p>
          </div>
          <Button href="/projects/new" variant="primary" size="md">
            + New project
          </Button>
        </header>

        <SectionHeader
          title={`Active (${active.length})`}
          right={
            includeArchived ? (
              <Link
                href="/projects"
                className="text-[12px] text-ink-500 hover:text-ink-900 font-mono"
              >
                hide archived
              </Link>
            ) : archived.length > 0 ? (
              <Link
                href="/projects?archived=1"
                className="text-[12px] text-ink-500 hover:text-ink-900 font-mono"
              >
                show archived ({archived.length})
              </Link>
            ) : null
          }
        />

        {isAdmin && activeGrouped ? (
          <div className="space-y-8 mb-10">
            {activeGrouped.map((group) => (
              <OwnerGroup key={group.ownerUserId ?? "unowned"} group={group}>
                {group.projects.map((p) => (
                  <ProjectCard
                    key={p.id}
                    project={p}
                    readOnly={p.ownerUserId !== session.userId}
                  />
                ))}
              </OwnerGroup>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
            {active.map((p) => (
              <ProjectCard key={p.id} project={p} />
            ))}
          </div>
        )}

        {includeArchived && archived.length > 0 && (
          <>
            <SectionHeader title={`Archived (${archived.length})`} />
            {isAdmin && archivedGrouped ? (
              <div className="space-y-8">
                {archivedGrouped.map((group) => (
                  <OwnerGroup
                    key={group.ownerUserId ?? "unowned"}
                    group={group}
                  >
                    {group.projects.map((p) => (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        archived
                        readOnly={p.ownerUserId !== session.userId}
                      />
                    ))}
                  </OwnerGroup>
                ))}
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {archived.map((p) => (
                  <ProjectCard key={p.id} project={p} archived />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </>
  );
}

interface OwnerGroupShape {
  ownerUserId: string | null;
  ownerLabel: string;
  ownerSubtitle: string;
  projects: ProjectListItem[];
}

function groupByOwner(
  projects: ProjectListItem[],
  currentUserId: string,
): OwnerGroupShape[] {
  const map = new Map<string, OwnerGroupShape>();
  for (const p of projects) {
    const key = p.ownerUserId ?? "__unowned__";
    if (!map.has(key)) {
      const label = p.ownerDisplayName ?? p.ownerEmail ?? "(unassigned)";
      const subtitle =
        p.ownerUserId === currentUserId
          ? "you"
          : p.ownerEmail ?? "unassigned";
      map.set(key, {
        ownerUserId: p.ownerUserId,
        ownerLabel: label,
        ownerSubtitle: subtitle,
        projects: [],
      });
    }
    map.get(key)!.projects.push(p);
  }
  // Stable order: current user first, then by name.
  return Array.from(map.values()).sort((a, b) => {
    if (a.ownerUserId === currentUserId) return -1;
    if (b.ownerUserId === currentUserId) return 1;
    return a.ownerLabel.localeCompare(b.ownerLabel);
  });
}

function OwnerGroup({
  group,
  children,
}: {
  group: OwnerGroupShape;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="flex items-baseline gap-2 mb-3">
        <h3 className="text-[14px] font-semibold text-ink-700">
          {group.ownerLabel}
        </h3>
        <span className="text-[11px] font-mono text-ink-300">
          {group.ownerSubtitle} · {group.projects.length} project
          {group.projects.length === 1 ? "" : "s"}
        </span>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>
    </section>
  );
}

function SectionHeader({
  title,
  right,
}: {
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="flex items-baseline justify-between mb-3">
      <h2 className="text-[12px] uppercase tracking-wide font-semibold text-ink-500">
        {title}
      </h2>
      {right}
    </div>
  );
}

function ProjectCard({
  project,
  archived,
  readOnly = false,
}: {
  project: ProjectListItem;
  archived?: boolean;
  /** Phase E — admin viewing someone else's project: hide write actions. */
  readOnly?: boolean;
}) {
  const presetLabel =
    project.composition?.presetKey ?? (project.isDefault ? "global-default" : "custom");
  // Archived projects — and read-only ones (an admin viewing another member's
  // project) — open a read-only VIEW (history) rather than /select. /select
  // would (correctly) refuse to make someone else's project your active one
  // and bounce you to your own workspace, which reads as if you'd "entered"
  // their project. Only your own active projects link to /select.
  const primaryHref =
    archived || readOnly
      ? `/projects/${project.id}/history`
      : `/projects/${project.id}/select`;
  return (
    <div className={`block group ${archived ? "opacity-60" : ""}`}>
      <Card>
        <Link href={primaryHref} className="block">
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="flex-1 min-w-0">
              <h3 className="text-[16px] font-semibold text-ink-900 group-hover:text-flare-600 transition-colors truncate">
                {projectDisplayName(project)}
              </h3>
              <p className="text-[11px] text-ink-300 font-mono uppercase tracking-wide mt-0.5">
                {presetLabel}
              </p>
            </div>
            {project.isDefault && <Pill tone="accent">default</Pill>}
          </div>
          <div className="flex gap-4 text-[12px] text-ink-500 font-mono">
            <span>
              <span className="text-ink-700 font-semibold tabular-nums">
                {project.agentsCount}
              </span>{" "}
              agents
            </span>
            <span>
              <span className="text-ink-700 font-semibold tabular-nums">
                {project.asksCount}
              </span>{" "}
              asks
            </span>
            <span className="text-ink-300">
              created {relativeDate(project.createdAt)}
            </span>
          </div>
        </Link>
        {archived ? (
          <div className="mt-3 pt-3 border-t border-ink-100 flex items-center gap-4 text-[11px] font-mono">
            <Link
              href={`/projects/${project.id}/history`}
              className="text-ink-500 hover:text-ink-900"
            >
              History →
            </Link>
            {readOnly ? (
              <span className="text-ink-300">read-only</span>
            ) : (
              <>
                <ArchiveProjectControl
                  projectId={project.id}
                  projectName={project.name}
                  mode="restore"
                  variant="link"
                />
                {!project.isDefault && (
                  <DeleteProjectControl
                    projectId={project.id}
                    projectName={project.name}
                    variant="link"
                  />
                )}
              </>
            )}
          </div>
        ) : (
          <div className="mt-3 pt-3 border-t border-ink-100 flex items-center gap-4 text-[11px] font-mono">
            <Link
              href={`/projects/${project.id}/history`}
              className="text-ink-500 hover:text-ink-900"
            >
              History →
            </Link>
            {!readOnly && (
              <Link
                href={`/projects/${project.id}/sources`}
                className="text-ink-500 hover:text-ink-900"
              >
                Sources
              </Link>
            )}
            {!readOnly && !project.isDefault && (
              <Link
                href={`/projects/${project.id}/settings`}
                className="text-ink-500 hover:text-ink-900"
              >
                Settings
              </Link>
            )}
            {readOnly && (
              <span className="text-ink-300">read-only</span>
            )}
            {!readOnly && !project.isDefault && (
              <ArchiveProjectControl
                projectId={project.id}
                projectName={project.name}
                mode="archive"
                variant="link"
              />
            )}
            {!readOnly && !project.isDefault && (
              <DeleteProjectControl
                projectId={project.id}
                projectName={project.name}
                variant="link"
              />
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

function relativeDate(d: Date): string {
  const diff = Math.max(0, (Date.now() - d.getTime()) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  const days = Math.floor(diff / 86400);
  if (days < 30) return `${days}d ago`;
  return d.toISOString().slice(0, 10);
}
