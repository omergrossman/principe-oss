"use client";

import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function CheckoutIntroPage() {
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function handleContinue() {
    setSubmitting(true);
    setError("");
    try {
      const res = await fetch("/api/billing/checkout-session", {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Could not start checkout.");
        setSubmitting(false);
        return;
      }
      window.location.href = data.url;
    } catch {
      setError("Network error.");
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <h1 className="text-[28px] font-bold text-ink-900 mb-3 tracking-tight">
          Subscribe your firm
        </h1>
        <p className="text-[14px] text-ink-500 leading-relaxed mb-6">
          Príncipe is billed annually per firm. Your subscription unlocks
          unlimited portco workspaces and synthetic CISO cycles. Includes a
          14-day free trial — cancel anytime.
        </p>
        {error && (
          <div
            role="alert"
            className="mb-4 p-3 rounded-md bg-verdict-fail/10 text-verdict-fail text-[13px]"
          >
            {error}
          </div>
        )}
        <Button
          variant="primary"
          size="lg"
          className="w-full"
          onClick={handleContinue}
          disabled={submitting}
        >
          {submitting ? "Opening Stripe…" : "Continue to checkout"}
        </Button>
        <p className="text-[11px] text-ink-300 mt-3 text-center font-mono">
          Powered by Stripe · You can subscribe later from settings
        </p>
      </Card>
    </main>
  );
}
