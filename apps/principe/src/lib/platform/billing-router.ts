import type { PrismaClient } from "@prisma/client";
import type Stripe from "stripe";
import { BillingRouter, toBillingEvent } from "@dp/billing";
import type { PrincipeTenantLifecycle } from "./PrincipeTenantLifecycle";

/**
 * Wire Principe's BillingRouter handlers for the webhook events we
 * care about in Sprint 1:
 *   - customer.subscription.created → activateFromStripe (provision)
 *   - customer.subscription.updated → updateFromStripe (no-op if unknown)
 *   - customer.subscription.deleted → log + ack (teardown is EP-12)
 *   - invoice.payment_succeeded / failed → log + ack (dashboards EP-12)
 *
 * Pre-warms a synchronous customer cache so toBillingEvent's
 * tenantIdFromCustomer callback can resolve without an async DB hop.
 */

export async function prepareCustomerCache(
  prisma: PrismaClient,
  stripeEvent: Stripe.Event,
): Promise<Map<string, string>> {
  const cache = new Map<string, string>();
  const customerId = extractCustomerId(stripeEvent);
  if (!customerId) return cache;
  const firm = await prisma.firm.findUnique({
    where: { stripeCustomerId: customerId },
    select: { id: true },
  });
  if (firm) cache.set(customerId, firm.id);
  return cache;
}

function extractCustomerId(stripeEvent: Stripe.Event): string | null {
  const obj = stripeEvent.data.object as { customer?: unknown };
  if (typeof obj.customer === "string") return obj.customer;
  if (
    obj.customer &&
    typeof obj.customer === "object" &&
    "id" in obj.customer
  ) {
    return (obj.customer as { id: string }).id;
  }
  return null;
}

/**
 * Process one Stripe event end-to-end. Returns the affected Firm id
 * (for the ProcessedStripeEvent dedupe row) or null.
 */
export async function processStripeEvent(
  stripeEvent: Stripe.Event,
  ctx: { prisma: PrismaClient; lifecycle: PrincipeTenantLifecycle },
): Promise<{ firmId: string | null }> {
  // Subscription.created is a special case — the customer doesn't exist
  // in our DB yet, so toBillingEvent can't normalise it. Handle directly.
  if (stripeEvent.type === "customer.subscription.created") {
    const sub = stripeEvent.data.object as Stripe.Subscription;
    const customerId =
      typeof sub.customer === "string" ? sub.customer : sub.customer?.id;
    if (!customerId) {
      console.warn("[billing] subscription.created without customer id");
      return { firmId: null };
    }
    // Fetch customer for name (Stripe doesn't expand by default).
    const stripe = ctx.lifecycle["prisma"]
      ? null
      : null;
    // We can't easily call Stripe API from inside this helper without
    // threading it in. Caller passes name via metadata when creating
    // checkout; fall back to a placeholder if missing.
    const name =
      (sub.metadata?.firmName as string | undefined) ??
      `Customer ${customerId.slice(-6)}`;
    const result = await ctx.lifecycle.activateFromStripe({
      firmId: sub.metadata?.firmId as string | undefined,
      name,
      stripeCustomerId: customerId,
      stripeSubscriptionId: sub.id,
      actorId: stripeEvent.id,
    });
    return { firmId: result.firmId };
  }

  // Cache for the sync callback.
  const cache = await prepareCustomerCache(ctx.prisma, stripeEvent);
  const customerId = extractCustomerId(stripeEvent);

  const normalised = toBillingEvent(stripeEvent, (cid) =>
    cache.get(cid) ?? undefined,
  );
  if (!normalised) {
    console.log(
      "[billing] unhandled or unknown-customer event",
      stripeEvent.type,
    );
    return { firmId: customerId ? cache.get(customerId) ?? null : null };
  }

  const router = new BillingRouter();
  router.on(async (event) => {
    switch (event.type) {
      case "subscription.updated": {
        await ctx.lifecycle.updateFromStripe({
          stripeCustomerId: customerId ?? "",
          stripeSubscriptionId: event.subscription.stripeSubscriptionId,
          actorId: stripeEvent.id,
        });
        return;
      }
      case "subscription.canceled":
        console.log(
          "[billing] subscription.canceled — teardown lands in EP-12",
          { subscriptionId: event.subscription.stripeSubscriptionId },
        );
        return;
      case "invoice.payment.succeeded":
      case "invoice.payment.failed":
        console.log("[billing] invoice event — dashboards land in EP-12", {
          type: event.type,
          subscriptionId: event.subscriptionId,
        });
        return;
      default:
        return;
    }
  });
  await router.dispatch(normalised);

  return {
    firmId: customerId ? cache.get(customerId) ?? null : null,
  };
}
