// SPDX-License-Identifier: AGPL-3.0-or-later
import Link from "next/link";
import { cookies } from "next/headers";
import { prisma } from "@/lib/db/prisma";
import { requireAuth } from "@/lib/auth/require-auth";
import { Pill } from "@/components/ui/Pill";
import { Button } from "@/components/ui/Button";
import { AppTopBar } from "@/components/app/AppTopBar";
import { PanelDisclaimer } from "@/components/app/PanelDisclaimer";
import { AskForm } from "./AskForm";
import { ProjectSwitcher } from "./ProjectSwitcher";
import {
  ensureDefaultProject,
  resolveCurrentProject,
} from "@/lib/projects/bootstrap";
import { listProjects } from "@/lib/projects/repo";
import {
  describeComposition,
  estimateRuntime,
  workspaceSubtitle,
  projectDisplayName,
} from "@/lib/projects/describe";
import type { PanelComposition } from "@/lib/projects/composition";

const PROJECT_COOKIE = "principe_project_id";

export default async function WorkspacePage() {
  const session = await requireAuth("/workspace");
  if (session.firmId) {
    await ensureDefaultProject(session.firmId, session.userId);
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { name: true, email: true },
  });

  const firm = session.firmId
    ? await prisma.firm.findUnique({
        where: { id: session.firmId },
        select: {
          name: true,
          anthropicKeyLast4: true,
        },
      })
    : null;

  const keyConnected = Boolean(firm?.anthropicKeyLast4);
  const isAdmin =
    session.role === "VC_ADMIN" || session.role === "PRINCIPE_ADMIN";

  const jar = await cookies();
  const cookieProjectId = jar.get(PROJECT_COOKIE)?.value ?? null;
  const currentProject = session.firmId
    ? await resolveCurrentProject(session.firmId, cookieProjectId, session.userId)
    : null;
  // Members see only their own projects in the workspace switcher;
  // admins see the whole organisation via /projects but keep the
  // workspace itself personal (they're asking from their own seat).
  const projects = session.firmId
    ? await listProjects(session.firmId, {
        includeArchived: false,
        ownerUserId: session.userId,
      })
    : [];

  const currentProjectMeta = currentProject
    ? projects.find((p) => p.id === currentProject.id) ?? null
    : null;
  const summary = describeComposition(
    (currentProject?.composition as PanelComposition | null) ?? null,
  );

  return (
    <>
      <AppTopBar />
      <main className="px-8 py-10 max-w-5xl mx-auto">
        <header className="mb-8 flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <Pill tone="accent">CISO panel · N={currentProject?.panelSize ?? 100}</Pill>
              <span className="text-[12px] text-ink-300 font-mono">
                {keyConnected ? "key connected" : "no key configured"}
              </span>
            </div>
            <h1 className="text-[36px] font-bold text-ink-900 tracking-tight">
              Ask the panel
            </h1>
            <p className="text-ink-500 mt-2">
              {currentProject?.panelSize ?? 100}{" "}
              <strong className="font-semibold text-ink-700">agentic</strong>{" "}
              CISOs — synthesized, not real — {workspaceSubtitle(summary)}.
              Responses in {estimateRuntime(currentProject?.panelSize ?? 100)}.
            </p>
            <p className="text-[12px] text-ink-300 mt-2 font-mono">
              Signed in as {user?.name ?? user?.email}
              {firm?.name ? ` · ${firm.name}` : ""}
              {currentProjectMeta
                ? ` · ${projectDisplayName(currentProjectMeta)}`
                : ""}
            </p>
          </div>
          {currentProject && projects.length > 0 && (
            <div className="shrink-0">
              <ProjectSwitcher
                currentId={currentProject.id}
                projects={projects.map((p) => ({
                  id: p.id,
                  name: p.name,
                  isDefault: p.isDefault,
                }))}
              />
            </div>
          )}
        </header>

        {!keyConnected && <KeyMissingBanner isAdmin={isAdmin} />}

        {/* Key by project id so switching projects fully remounts the
            ask form — clears stale history (and the "View all N responses"
            count from a previous project's last run). */}
        <AskForm
          key={currentProject?.id ?? "no-project"}
          disabled={!keyConnected}
          panelSize={currentProject?.panelSize ?? null}
        />

        <div className="mt-8 pt-6 border-t border-ink-100 text-[13px]">
          <p className="text-ink-500">
            {currentProject && (
              <Link
                href={`/projects/${currentProject.id}/history`}
                className="text-ink-700 hover:text-ink-900 underline underline-offset-4"
              >
                Past asks in this project →
              </Link>
            )}
          </p>
          <PanelDisclaimer className="mt-4" />
        </div>
      </main>
    </>
  );
}

function KeyMissingBanner({ isAdmin }: { isAdmin: boolean }) {
  return (
    <div className="mb-6 p-4 rounded-md bg-flare-100 border border-flare-600/30">
      <p className="text-[14px] text-ink-900 font-semibold mb-1">
        Anthropic key required
      </p>
      <p className="text-[13px] text-ink-700 mb-3 leading-relaxed">
        {isAdmin
          ? "The panel uses your Anthropic API key (BYO). Add it once in Settings — it's stored encrypted at rest."
          : "The panel needs an Anthropic API key for this workspace. Ask your workspace admin to add one — then you can run asks."}
      </p>
      {isAdmin && (
        <Button href="/settings" variant="primary" size="md">
          Open settings →
        </Button>
      )}
    </div>
  );
}

