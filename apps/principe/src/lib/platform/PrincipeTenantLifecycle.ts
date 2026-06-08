/**
 * PrincipeTenantLifecycle — concrete implementation of the abstract
 * TenantLifecycle interface from @dp/tenant-lifecycle, adapted to
 * Principe's Firm tenancy.
 *
 * Sprint 1 Story 02.1 ships READ + activate paths only.
 * Sprint 1.4-equivalent (teardown + restore + audit-log) lands in EP-12.
 */

import type { PrismaClient, Prisma } from "@prisma/client";
import type {
  TenantLifecycleRouter,
} from "@dp/tenant-lifecycle";

export interface ProvisionVcFirmInput {
  /**
   * If a Firm row already exists (created at /api/auth/signup before
   * the Stripe checkout step), pass its id. Otherwise leave undefined
   * to create a new row keyed by stripeCustomerId.
   */
  firmId?: string;
  name: string;
  region?: "us" | "eu-west" | "eu-central" | "uk" | "apac" | "anz";
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  actorId: string; // stripe event id, for audit
}

export class PrincipeTenantLifecycle {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly router?: TenantLifecycleRouter,
  ) {}

  /**
   * Activate or create a Firm tied to a Stripe customer + subscription.
   *
   * Two paths:
   *   1. Existing Firm (created by /api/auth/signup) → update with
   *      stripeCustomerId + stripeSubscriptionId; status stays ACTIVE.
   *   2. New Firm (signup didn't pre-create) → create with all fields.
   *
   * Both write a TenantLifecycleAuditLog row. Idempotent on
   * stripeCustomerId via @@unique constraint.
   */
  async activateFromStripe(input: ProvisionVcFirmInput): Promise<{
    firmId: string;
    created: boolean;
  }> {
    return this.prisma.$transaction(async (tx) => {
      // Did signup already create the firm?
      let firm = input.firmId
        ? await tx.firm.findUnique({ where: { id: input.firmId } })
        : await tx.firm.findUnique({
            where: { stripeCustomerId: input.stripeCustomerId },
          });

      let created = false;
      if (firm) {
        firm = await tx.firm.update({
          where: { id: firm.id },
          data: {
            status: "ACTIVE",
            stripeCustomerId: input.stripeCustomerId,
            stripeSubscriptionId: input.stripeSubscriptionId,
          },
        });
      } else {
        firm = await tx.firm.create({
          data: {
            name: input.name,
            slug: await this.uniqueSlug(tx, input.name),
            region: input.region ?? "us",
            status: "ACTIVE",
            stripeCustomerId: input.stripeCustomerId,
            stripeSubscriptionId: input.stripeSubscriptionId,
          },
        });
        created = true;
      }

      await tx.tenantLifecycleAuditLog.create({
        data: {
          firmId: firm.id,
          eventType: created ? "tenant.created" : "tenant.activated",
          actorType: "stripe-webhook",
          actorId: input.actorId,
          payload: {
            stripeCustomerId: input.stripeCustomerId,
            stripeSubscriptionId: input.stripeSubscriptionId,
          } as unknown as Prisma.InputJsonValue,
        },
      });

      return { firmId: firm.id, created };
    });
  }

  /**
   * Update subscription metadata on an existing Firm
   * (subscription.updated events). Does not change tenancy status.
   */
  async updateFromStripe(input: {
    stripeCustomerId: string;
    stripeSubscriptionId?: string;
    actorId: string;
  }): Promise<{ firmId: string } | null> {
    const firm = await this.prisma.firm.findUnique({
      where: { stripeCustomerId: input.stripeCustomerId },
    });
    if (!firm) return null;

    await this.prisma.$transaction(async (tx) => {
      await tx.firm.update({
        where: { id: firm.id },
        data: input.stripeSubscriptionId
          ? { stripeSubscriptionId: input.stripeSubscriptionId }
          : {},
      });
      await tx.tenantLifecycleAuditLog.create({
        data: {
          firmId: firm.id,
          eventType: "tenant.updated",
          actorType: "stripe-webhook",
          actorId: input.actorId,
          payload: {
            stripeCustomerId: input.stripeCustomerId,
            stripeSubscriptionId: input.stripeSubscriptionId,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    });
    return { firmId: firm.id };
  }

  private async uniqueSlug(
    tx: Prisma.TransactionClient,
    name: string,
  ): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 48) || "firm";
    const alphabet = "abcdefghijklmnopqrstuvwxyz0123456789";
    for (let i = 0; i < 8; i++) {
      const suffix =
        i === 0
          ? ""
          : "-" +
            Array.from({ length: 4 })
              .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
              .join("");
      const candidate = base + suffix;
      const collision = await tx.firm.findUnique({
        where: { slug: candidate },
      });
      if (!collision) return candidate;
    }
    return (
      base +
      "-" +
      Array.from({ length: 8 })
        .map(() => alphabet[Math.floor(Math.random() * alphabet.length)])
        .join("")
    );
  }
}
