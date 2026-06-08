// SPDX-License-Identifier: AGPL-3.0-or-later
import { prisma } from "@/lib/db/prisma";
import { Prisma } from "@prisma/client";
import {
  normaliseComposition,
  type PanelComposition,
} from "./composition";
import { materialiseProjectAgents } from "./materialise";

/**
 * Project CRUD helpers used by the API routes + page-level server
 * components. All functions assume the caller has already validated
 * firmId ownership.
 */

export interface ProjectListItem {
  id: string;
  name: string;
  isDefault: boolean;
  status: "ACTIVE" | "ARCHIVED";
  createdAt: Date;
  composition: PanelComposition | null;
  asksCount: number;
  agentsCount: number;
  // Phase E (2026-06-06) — admin org view shows project owner.
  ownerUserId: string | null;
  ownerDisplayName: string | null;
  ownerEmail: string | null;
}

export async function listProjects(
  firmId: string,
  options: {
    includeArchived?: boolean;
    /** Scope to a single owner. Omit to list the whole firm (admin view). */
    ownerUserId?: string | null;
  } = {},
): Promise<ProjectListItem[]> {
  const rows = await prisma.project.findMany({
    where: {
      firmId,
      ...(options.includeArchived ? {} : { status: "ACTIVE" }),
      ...(options.ownerUserId !== undefined
        ? { ownerUserId: options.ownerUserId }
        : {}),
    },
    orderBy: [{ isDefault: "desc" }, { createdAt: "desc" }],
    select: {
      id: true,
      name: true,
      isDefault: true,
      status: true,
      createdAt: true,
      composition: true,
      ownerUserId: true,
      owner: { select: { name: true, email: true } },
      _count: { select: { asks: true, agents: true } },
    },
  });
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    isDefault: r.isDefault,
    status: r.status,
    createdAt: r.createdAt,
    composition: (r.composition as PanelComposition | null) ?? null,
    asksCount: r._count.asks,
    agentsCount: r._count.agents,
    ownerUserId: r.ownerUserId,
    ownerDisplayName: r.owner?.name ?? null,
    ownerEmail: r.owner?.email ?? null,
  }));
}

export async function getProject(
  firmId: string,
  projectId: string,
): Promise<ProjectListItem | null> {
  const r = await prisma.project.findFirst({
    where: { id: projectId, firmId },
    select: {
      id: true,
      name: true,
      isDefault: true,
      status: true,
      createdAt: true,
      composition: true,
      ownerUserId: true,
      owner: { select: { name: true, email: true } },
      _count: { select: { asks: true, agents: true } },
    },
  });
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    isDefault: r.isDefault,
    status: r.status,
    createdAt: r.createdAt,
    composition: (r.composition as PanelComposition | null) ?? null,
    asksCount: r._count.asks,
    agentsCount: r._count.agents,
    ownerUserId: r.ownerUserId,
    ownerDisplayName: r.owner?.name ?? null,
    ownerEmail: r.owner?.email ?? null,
  };
}

export interface CreateProjectInput {
  firmId: string;
  // Phase E (2026-06-06) — every new project belongs to one user.
  ownerUserId: string;
  name: string;
  composition: PanelComposition;
  // Sprint 7 — variable panel size at create time. Defaults to 100 if
  // omitted. Range 30-200 (clamped in generatePersonas).
  panelSize?: number;
}

export async function createProject(
  input: CreateProjectInput,
): Promise<{ id: string }> {
  const name = input.name.trim();
  if (name.length < 2 || name.length > 80) {
    throw new Error("Project name must be 2-80 characters.");
  }
  const composition = normaliseComposition(input.composition);
  const panelSize = Math.max(30, Math.min(200, Math.round(input.panelSize ?? 100)));

  const project = await prisma.project.create({
    data: {
      firmId: input.firmId,
      ownerUserId: input.ownerUserId,
      name,
      isDefault: false,
      status: "ACTIVE",
      composition: composition as unknown as Prisma.InputJsonValue,
      panelSize,
    },
    select: { id: true },
  });

  await materialiseProjectAgents(project.id, composition, panelSize);
  return { id: project.id };
}

export async function renameProject(
  firmId: string,
  projectId: string,
  name: string,
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, firmId },
    select: { id: true, isDefault: true },
  });
  if (!project) throw new Error("Project not found.");
  if (project.isDefault) {
    throw new Error("The Default project cannot be renamed.");
  }
  const trimmed = name.trim();
  if (trimmed.length < 2 || trimmed.length > 80) {
    throw new Error("Project name must be 2-80 characters.");
  }
  await prisma.project.update({
    where: { id: projectId },
    data: { name: trimmed },
  });
}

export async function archiveProject(
  firmId: string,
  projectId: string,
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, firmId },
    select: { id: true, isDefault: true },
  });
  if (!project) throw new Error("Project not found.");
  if (project.isDefault) {
    throw new Error("The Default project cannot be archived.");
  }
  await prisma.project.update({
    where: { id: projectId },
    data: { status: "ARCHIVED", archivedAt: new Date() },
  });
}

export async function restoreProject(
  firmId: string,
  projectId: string,
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, firmId },
    select: { id: true },
  });
  if (!project) throw new Error("Project not found.");
  await prisma.project.update({
    where: { id: projectId },
    data: { status: "ACTIVE", archivedAt: null },
  });
}

/**
 * Phase E (2026-06-06) — write authorization for project mutations.
 *
 * In multi-user organisations, members can only mutate their own
 * projects. Admins read everything in the org (see [[admin-org-view]])
 * but per the V1 decision they are read-only on other members' work —
 * member management is the admin's edit surface, not member content.
 *
 * Throws if the project doesn't exist in the firm, or if it does but is
 * not owned by `actingUserId`. Returns the project's owner id on
 * success so callers can attribute the action.
 */
export async function assertProjectWriteAccess(
  firmId: string,
  projectId: string,
  actingUserId: string,
): Promise<{ ownerUserId: string | null }> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, firmId },
    select: { id: true, ownerUserId: true },
  });
  if (!project) throw new Error("Project not found.");
  // Legacy rows with ownerUserId=null (pre-backfill edge case) — treat
  // as not-owned-by-anyone; nobody but the bootstrap admin can edit.
  if (project.ownerUserId && project.ownerUserId !== actingUserId) {
    throw new Error(
      "You can only edit projects you own. Ask the project owner to make this change.",
    );
  }
  return { ownerUserId: project.ownerUserId };
}

/**
 * Sprint 7 — hard-delete a project + all its dependents. The default
 * project cannot be deleted (legacy users + bootstrap fallback rely on
 * it). The caller is responsible for confirming with the user; the UI
 * uses a typed-project-name modal as a second verification step.
 *
 * Cascade behaviour comes from the schema:
 *   - ProjectAgent.projectId → Cascade
 *   - ProjectAsk.projectId → Cascade
 *   - KnowledgeSource.projectId → Cascade (project-scoped sources only)
 *   - Hypothesis.projectId → SetNull (hypotheses survive; lose link)
 */
export async function deleteProject(
  firmId: string,
  projectId: string,
): Promise<void> {
  const project = await prisma.project.findFirst({
    where: { id: projectId, firmId },
    select: { id: true, isDefault: true },
  });
  if (!project) throw new Error("Project not found.");
  if (project.isDefault) {
    throw new Error("The Default project cannot be deleted.");
  }
  await prisma.project.delete({ where: { id: projectId } });
}
