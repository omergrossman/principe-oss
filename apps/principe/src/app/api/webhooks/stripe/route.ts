import { NextResponse, type NextRequest } from "next/server";
import { headers } from "next/headers";
import { makeStripeClient, verifyWebhookSignature } from "@dp/billing";
import { TenantLifecycleRouter } from "@dp/tenant-lifecycle";

import { prisma } from "@/lib/db/prisma";
import {
  PrincipeTenantLifecycle,
  processStripeEvent,
} from "@/lib/platform";

/**
 * POST /api/webhooks/stripe
 *
 * Adapted from Fable's pattern (Phase 1 Step 1.3). Pipeline:
 *
 *   Stripe → here → @dp/billing.verifyWebhookSignature →
 *     processStripeEvent → (subscription.created)  activateFromStripe
 *                         (subscription.updated)   updateFromStripe
 *                         (subscription.deleted)   log + ack (EP-12)
 *                         (invoice.*)              log + ack (EP-12)
 *
 * Correctness requirements:
 *   1. Signature verification BEFORE any other read of the payload
 *   2. Idempotency on evt_* id — Stripe delivers at-least-once
 *   3. Don't write the dedupe row if the handler threw (let Stripe retry).
 *      Exception: unknown event types DO get the dedupe row so they
 *      don't retry forever.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const headerList = await headers();
  const signature = headerList.get("stripe-signature");
  if (!signature) {
    return NextResponse.json(
      { error: "missing stripe-signature header" },
      { status: 400 },
    );
  }

  const rawBody = await req.text();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  const stripeApiKey = process.env.STRIPE_SECRET_KEY;
  if (!webhookSecret || !stripeApiKey) {
    console.error(
      "[stripe-webhook] missing STRIPE_WEBHOOK_SECRET or STRIPE_SECRET_KEY",
    );
    return NextResponse.json(
      { error: "server misconfigured" },
      { status: 500 },
    );
  }

  const stripe = makeStripeClient({
    apiKey: stripeApiKey,
    webhookSecret,
  });

  let stripeEvent;
  try {
    stripeEvent = verifyWebhookSignature(
      stripe,
      rawBody,
      signature,
      webhookSecret,
    );
  } catch (err) {
    console.error("[stripe-webhook] signature verification failed", err);
    return NextResponse.json({ error: "invalid signature" }, { status: 401 });
  }

  // Idempotency: have we already processed this event id?
  const already = await prisma.processedStripeEvent.findUnique({
    where: { id: stripeEvent.id },
  });
  if (already) {
    return NextResponse.json({ ok: true, duplicate: true });
  }

  const tenantRouter = new TenantLifecycleRouter();
  const lifecycle = new PrincipeTenantLifecycle(prisma, tenantRouter);

  let firmId: string | null = null;
  try {
    const result = await processStripeEvent(stripeEvent, { prisma, lifecycle });
    firmId = result.firmId;
  } catch (err) {
    console.error("[stripe-webhook] handler failed — letting Stripe retry", {
      eventId: stripeEvent.id,
      eventType: stripeEvent.type,
      err,
    });
    return NextResponse.json({ error: "handler failed" }, { status: 500 });
  }

  await prisma.processedStripeEvent.create({
    data: {
      id: stripeEvent.id,
      eventType: stripeEvent.type,
      firmId,
    },
  });

  return NextResponse.json({ ok: true });
}
