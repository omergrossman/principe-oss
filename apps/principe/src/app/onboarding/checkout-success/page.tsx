import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { requireAuth } from "@/lib/auth/require-auth";

/**
 * /onboarding/checkout-success
 *
 * Stripe redirects here after a successful Checkout completion. The
 * subscription.created webhook fires asynchronously — it may or may not
 * have hit by the time the user lands here. So this page does NOT rely
 * on the webhook having run. It just:
 *   1. Confirms the user is authenticated
 *   2. Sends them onward to enroll a passkey (if they haven't)
 *
 * The webhook handles Firm.stripeCustomerId linkage independently.
 */

export default async function CheckoutSuccessPage() {
  await requireAuth("/onboarding/checkout-success");

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md text-center">
        <p className="text-[12px] text-flare-600 uppercase tracking-wide font-semibold mb-2">
          subscription active
        </p>
        <h1 className="text-[28px] font-bold text-ink-900 mb-3 tracking-tight">
          Welcome to Principe
        </h1>
        <p className="text-[14px] text-ink-500 leading-relaxed mb-6">
          Your firm subscription is live. The next step is enrolling a passkey
          so you can sign in without a password.
        </p>
        <Button href="/onboarding/enroll-passkey" variant="primary" size="lg" className="w-full">
          Register a passkey →
        </Button>
      </Card>
    </main>
  );
}
