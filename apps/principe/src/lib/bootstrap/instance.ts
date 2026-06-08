import { prisma } from "@/lib/db/prisma";

/**
 * Instance bootstrap.
 *
 * Each Principe deployment is one customer instance (per the Delivery
 * Platform's per-instance model). On first boot, a single Tenant + first
 * Admin must exist so the customer's admin can sign in and start inviting
 * members.
 *
 * For V1 we pull bootstrap config from env vars; DP populates these at
 * deploy time. A future signed-webhook from DP can replace this without
 * touching the user-facing flow.
 *
 *   INSTANCE_TENANT_NAME  e.g. "Acme Capital"
 *   INSTANCE_ADMIN_EMAIL  e.g. "founder@acmecap.com"
 *   INSTANCE_ADMIN_NAME   optional — auto-derived from email if missing
 *
 * Optional trial bootstrap (set by DP master when the customer came in
 * through the marketing-site /trial form):
 *   INSTANCE_IS_TRIAL                 "true"
 *   INSTANCE_TRIAL_QUESTIONS_REMAINING  e.g. "10"
 *
 * The function is idempotent: if a tenant + admin already exist, it
 * returns the existing IDs without writing.
 */

export const MAX_ADMINS_PER_FIRM = 3;

export interface BootstrapResult {
  created: boolean;
  firmId: string | null;
  adminUserId: string | null;
  reason?: "missing-env" | "already-bootstrapped" | "created";
}

function deriveDisplayName(email: string): string {
  const local = email.split("@")[0] ?? email;
  return local
    .split(/[._-]+/)
    .filter(Boolean)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ") || email;
}

function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48) || "firm";
}

let cached: BootstrapResult | null = null;

/**
 * Ensures the instance has a tenant + first admin. Safe to call on every
 * request — first call writes, subsequent calls return a cached pointer.
 */
export async function ensureInstanceBootstrap(): Promise<BootstrapResult> {
  if (cached) return cached;

  const tenantName = process.env.INSTANCE_TENANT_NAME?.trim();
  const adminEmail = process.env.INSTANCE_ADMIN_EMAIL?.trim().toLowerCase();
  const explicitName = process.env.INSTANCE_ADMIN_NAME?.trim();

  // If env vars aren't set, do nothing. The legacy single-user/seed flow
  // remains in place; bootstrap only activates when DP provides config.
  if (!tenantName || !adminEmail) {
    const result: BootstrapResult = {
      created: false,
      firmId: null,
      adminUserId: null,
      reason: "missing-env",
    };
    return result;
  }

  // Already bootstrapped — find by admin email + active membership.
  const existingUser = await prisma.user.findUnique({
    where: { email: adminEmail },
    include: { memberships: { include: { firm: true } } },
  });
  if (existingUser) {
    const adminMembership = existingUser.memberships.find(
      (m) => m.role === "VC_ADMIN" && m.firmId !== null,
    );
    if (adminMembership) {
      cached = {
        created: false,
        firmId: adminMembership.firmId,
        adminUserId: existingUser.id,
        reason: "already-bootstrapped",
      };
      return cached;
    }
  }

  // Fresh bootstrap.
  const slug = slugify(tenantName);
  const displayName = explicitName || deriveDisplayName(adminEmail);

  // Optional trial flags from DP master.
  const isTrial = process.env.INSTANCE_IS_TRIAL?.trim() === "true";
  const trialQuestionsRaw =
    process.env.INSTANCE_TRIAL_QUESTIONS_REMAINING?.trim();
  const trialQuestionsRemaining =
    isTrial && trialQuestionsRaw
      ? Math.max(0, Math.floor(Number(trialQuestionsRaw)))
      : null;

  const result = await prisma.$transaction(async (tx) => {
    const firm = await tx.firm.upsert({
      where: { slug },
      update: {},
      create: {
        name: tenantName,
        slug,
        region: "us",
        isTrial,
        trialQuestionsRemaining,
      },
    });
    const user =
      existingUser ??
      (await tx.user.create({
        data: { email: adminEmail, name: displayName },
      }));
    // Membership has a composite unique on (userId, firmId, portcoId)
    // but portcoId is nullable — and Postgres treats NULLs as distinct
    // under unique constraints — so we can't rely on upsert here.
    const existingMembership = await tx.membership.findFirst({
      where: { userId: user.id, firmId: firm.id, portcoId: null },
    });
    if (!existingMembership) {
      await tx.membership.create({
        data: { userId: user.id, firmId: firm.id, role: "VC_ADMIN" },
      });
    } else if (existingMembership.role !== "VC_ADMIN") {
      await tx.membership.update({
        where: { id: existingMembership.id },
        data: { role: "VC_ADMIN" },
      });
    }
    return { firmId: firm.id, adminUserId: user.id };
  });

  cached = {
    created: true,
    firmId: result.firmId,
    adminUserId: result.adminUserId,
    reason: "created",
  };
  return cached;
}

/** Test-only: clears the bootstrap cache so a new call re-checks the DB. */
export function __resetBootstrapCacheForTesting() {
  cached = null;
}
