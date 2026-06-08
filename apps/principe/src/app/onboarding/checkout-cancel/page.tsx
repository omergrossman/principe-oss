import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function CheckoutCancelPage() {
  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md text-center">
        <h1 className="text-[24px] font-bold text-ink-900 mb-3 tracking-tight">
          Checkout cancelled
        </h1>
        <p className="text-[14px] text-ink-500 leading-relaxed mb-6">
          No charge was made. You can subscribe later from your workspace
          settings, or contact us if you need a different plan.
        </p>
        <div className="space-y-2">
          <Button href="/workspace" variant="primary" size="md" className="w-full">
            Continue to workspace
          </Button>
          <Button href="/onboarding/enroll-passkey" variant="secondary" size="md" className="w-full">
            Enroll passkey first
          </Button>
        </div>
      </Card>
    </main>
  );
}
