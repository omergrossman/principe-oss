import { NextResponse, type NextRequest } from "next/server";
import { makeStripeClient, createCheckoutSession } from "@dp/billing";
import { getSession } from "@/lib/session";
import { prisma } from "@/lib/db/prisma";

/**
 * POST /api/billing/checkout-session
 *
 * Called by the post-signup onboarding flow to create a Stripe Checkout
 * Session for the current VC firm. Stripe redirects back to
 * /onboarding/checkout-success on success and /onboarding/checkout-cancel
 * on cancel.
 *
 * Returns { url } — the client redirects to it.
 *
 * Production guard: requires STRIPE_SECRET_KEY + STRIPE_PRICE_ID_VC_FIRM.
 * V1 design partners can be onboarded without Stripe (signup creates
 * a Firm directly via /api/auth/signup); this endpoint is the path
 * once billing is live.
 */

export const runtime = "nodejs";

export async function POST(req: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in first" }, { status: 401 });
  }
  if (session.role !== "VC_ADMIN") {
    return NextResponse.json(
      { error: "Only VC admins can subscribe" },
      { status: 403 },
    );
  }

  const stripeApiKey = process.env.STRIPE_SECRET_KEY;
  const priceId = process.env.STRIPE_PRICE_ID_VC_FIRM;
  if (!stripeApiKey || !priceId) {
    return NextResponse.json(
      {
        error:
          "Billing isn't configured yet. Contact Omer for a manual workspace.",
      },
      { status: 503 },
    );
  }

  const firm = await prisma.firm.findUnique({
    where: { id: session.firmId },
    select: { id: true, name: true, stripeCustomerId: true },
  });
  if (!firm) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    select: { email: true },
  });
  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const stripe = makeStripeClient({
    apiKey: stripeApiKey,
    webhookSecret: process.env.STRIPE_WEBHOOK_SECRET ?? "unused-here",
  });
  const origin = process.env.WEBAUTHN_ORIGIN ?? "http://localhost:3001";

  const checkoutSession = await createCheckoutSession(stripe, {
    customerId: firm.stripeCustomerId ?? undefined,
    customerEmail: firm.stripeCustomerId ? undefined : user.email,
    priceId,
    successUrl: `${origin}/onboarding/checkout-success?session_id={CHECKOUT_SESSION_ID}`,
    cancelUrl: `${origin}/onboarding/checkout-cancel`,
    metadata: {
      firmId: firm.id,
      firmName: firm.name,
      userEmail: user.email,
    },
    trialPeriodDays: 14,
  });

  if (!checkoutSession.url) {
    return NextResponse.json(
      { error: "Stripe didn't return a checkout URL" },
      { status: 502 },
    );
  }
  return NextResponse.json({ url: checkoutSession.url });
}
