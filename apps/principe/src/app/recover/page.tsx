"use client";

import { useState } from "react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function RecoverPage() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await fetch("/api/auth/recover", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: email.trim() }),
    });
    setSubmitted(true);
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <h1 className="text-[28px] font-bold text-ink-900 mb-2 tracking-tight">
          Recover your account
        </h1>
        {submitted ? (
          <>
            <p className="text-[14px] text-ink-500 leading-relaxed mb-6">
              If an account exists for that email, we&apos;ve sent a recovery
              link. Check your inbox — the link expires in 24 hours.
            </p>
            <Button href="/login" variant="secondary" size="md" className="w-full">
              Back to sign in
            </Button>
          </>
        ) : (
          <>
            <p className="text-[14px] text-ink-500 leading-relaxed mb-6">
              Lost your passkey? We&apos;ll email you a recovery link.
            </p>
            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="block">
                <span className="text-[13px] font-medium text-ink-700 mb-1.5 block">
                  Email
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="jamie@firm.com"
                  required
                  className="w-full h-11 px-3 rounded-md border border-ink-100 bg-elevated text-[15px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20"
                />
              </label>
              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
              >
                Send recovery link
              </Button>
              <Link
                href="/login"
                className="block text-center text-[13px] text-ink-300 hover:text-ink-700"
              >
                ← Back to sign in
              </Link>
            </form>
          </>
        )}
      </Card>
    </main>
  );
}
