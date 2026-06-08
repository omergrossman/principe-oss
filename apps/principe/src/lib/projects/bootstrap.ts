// SPDX-License-Identifier: AGPL-3.0-or-later
import { prisma } from "@/lib/db/prisma";
import { materialiseProjectAgents } from "./materialise";

/**
 * Ensure a Default project exists for a (firm, owner) pair. Idempotent —
 * runs on every workspace load (cheap: indexed lookup). Returns the
 * project.
 *
 * Phase E (2026-06-06) — per-user Defaults: every user gets their own
 * "Default project" on first sign-in. Admins see everyone's Default in
 * the org view; members only see their own.
 *
 * The Default project:
 *   - Has composition=null (uses deterministic Sprint-1 generator output)
 *   - Cannot be archived or renamed
 *   - Auto-receives any existing firm-wide knowledge sources
 *   - Is the fallback if the user's selected projectId is invalid
 *
 * `ownerUserId` is optional for backwards-compat — legacy single-user
 * callers can omit it and Get the firm-wide default. New callers should
 * always pass it.
 */
export async function ensureDefaultProject(
  firmId: string,
  ownerUserId: string | null = null,
): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.project.findFirst({
    where: {
      firmId,
      isDefault: true,
      ...(ownerUserId ? { ownerUserId } : {}),
    },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  // The Project model has `@@unique([firmId, name])`, so two users
  // can't both have "Default project" as the exact name. Suffix the
  // second-and-onward Defaults with the owner's id-tail.
  const baseName = "Default project";
  let name = baseName;
  if (ownerUserId) {
    const nameCollision = await prisma.project.findFirst({
      where: { firmId, name: baseName },
      select: { id: true },
    });
    if (nameCollision) {
      name = `${baseName} · ${ownerUserId.slice(-4)}`;
    }
  }

  const project = await prisma.project.create({
    data: {
      firmId,
      ownerUserId,
      name,
      isDefault: true,
      status: "ACTIVE",
      composition: undefined as never, // NULL = deterministic default
    },
    select: { id: true },
  });

  // Materialise the 100 agents for this project. Default uses the
  // Sprint-1 generator seed (project id is ignored for the default).
  await materialiseProjectAgents(project.id, null);

  return { id: project.id, created: true };
}

/**
 * Resolve the current project for a session. Reads from a cookie when
 * present and the project belongs to the firm; otherwise returns the
 * Default project for the given owner (Phase E — per-user Defaults).
 * Cookie writes happen elsewhere (project switcher UI).
 *
 * `ownerUserId` is optional for backwards-compat; new callers should
 * always pass session.userId so the per-user Default is created/found.
 */
export async function resolveCurrentProject(
  firmId: string,
  requestedProjectId: string | null,
  ownerUserId: string | null = null,
): Promise<{
  id: string;
  isDefault: boolean;
  composition: unknown;
  panelSize: number;
}> {
  if (requestedProjectId) {
    const project = await prisma.project.findFirst({
      where: { id: requestedProjectId, firmId, status: "ACTIVE" },
      select: { id: true, isDefault: true, composition: true, panelSize: true },
    });
    if (project) return project;
  }
  const def = await ensureDefaultProject(firmId, ownerUserId);
  const project = await prisma.project.findUnique({
    where: { id: def.id },
    select: { id: true, isDefault: true, composition: true, panelSize: true },
  });
  return project!;
}
