import { prisma } from "@/lib/db/prisma";
import { MAX_ADMINS_PER_FIRM } from "./instance";

/**
 * Hard cap: at most MAX_ADMINS_PER_FIRM tenant admins per firm. Counts
 * active VC_ADMIN memberships + outstanding (un-accepted, un-expired)
 * VC_ADMIN invitations so we can't blow past the cap by sending too many
 * invites at once.
 */
export interface AdminQuota {
  current: number;
  pending: number;
  remaining: number;
  cap: number;
}

export async function getAdminQuota(firmId: string): Promise<AdminQuota> {
  const now = new Date();
  const [current, pending] = await Promise.all([
    prisma.membership.count({
      where: { firmId: firmId, role: "VC_ADMIN" },
    }),
    prisma.invitation.count({
      where: {
        firmId: firmId,
        role: "VC_ADMIN",
        acceptedAt: null,
        expiresAt: { gt: now },
      },
    }),
  ]);
  const used = current + pending;
  return {
    current,
    pending,
    cap: MAX_ADMINS_PER_FIRM,
    remaining: Math.max(0, MAX_ADMINS_PER_FIRM - used),
  };
}

/** Throws if the firm has no remaining admin slots. Use before creating
 *  an admin-role invite. */
export async function assertAdminSlotAvailable(firmId: string): Promise<void> {
  const quota = await getAdminQuota(firmId);
  if (quota.remaining <= 0) {
    throw new Error(
      `Admin cap reached (${quota.cap}). Revoke a pending invite or remove an existing admin before inviting another.`,
    );
  }
}
