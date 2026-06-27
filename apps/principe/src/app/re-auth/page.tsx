// SPDX-License-Identifier: AGPL-3.0-or-later
"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { startAuthentication } from "@simplewebauthn/browser";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";

export default function ReAuthPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/workspace";

  const [status, setStatus] = useState<"idle" | "running" | "error">("idle");
  const [error, setError] = useState("");

  // Password re-auth (the additive alternative to a passkey assertion).
  const [password, setPassword] = useState("");
  const [pwSubmitting, setPwSubmitting] = useState(false);
  const [pwError, setPwError] = useState("");

  useEffect(() => {
    // Auto-trigger the passkey ceremony on mount when supported — re-auth is
    // friction; minimise it. Falls back to the password form below.
    const hasPasskey =
      typeof window !== "undefined" &&
      typeof window.PublicKeyCredential !== "undefined";
    if (hasPasskey) void handleReAuth();
    else setStatus("error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleReAuth() {
    setStatus("running");
    setError("");
    try {
      const optsRes = await fetch("/api/auth/re-auth", { method: "GET" });
      if (!optsRes.ok) {
        const data = await optsRes.json().catch(() => ({}));
        throw new Error(data.error ?? "Could not start re-auth");
      }
      const options = await optsRes.json();
      const assertion = await startAuthentication({ optionsJSON: options });
      const verifyRes = await fetch("/api/auth/re-auth", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(assertion),
      });
      const data = await verifyRes.json();
      if (!verifyRes.ok || !data.verified) {
        throw new Error(data.error ?? "Verification failed");
      }
      router.push(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Re-auth failed");
      setStatus("error");
    }
  }

  async function handlePasswordReAuth(e: React.FormEvent) {
    e.preventDefault();
    setPwSubmitting(true);
    setPwError("");
    try {
      const res = await fetch("/api/auth/re-auth/password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.verified) {
        throw new Error(data.error ?? "Incorrect password.");
      }
      router.push(next);
    } catch (err) {
      setPwError(err instanceof Error ? err.message : "Incorrect password.");
      setPwSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md">
        <h1 className="text-[24px] font-bold text-ink-900 mb-2 tracking-tight">
          Confirm it&apos;s you
        </h1>
        <p className="text-[14px] text-ink-500 mb-6 leading-relaxed">
          This action requires fresh authentication. Use your passkey, or
          re-enter your password.
        </p>

        {status === "running" && (
          <p className="text-[13px] text-ink-300 font-mono mb-4">
            Waiting for passkey…
          </p>
        )}
        {status === "error" && (
          <>
            {error && (
              <div
                className="mb-3 p-3 rounded-md bg-verdict-fail/10 text-verdict-fail text-[13px]"
                role="alert"
              >
                {error}
              </div>
            )}
            <Button
              variant="secondary"
              size="lg"
              className="w-full mb-4"
              onClick={handleReAuth}
            >
              Try passkey again
            </Button>
          </>
        )}

        <form onSubmit={handlePasswordReAuth} className="space-y-3">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
            autoComplete="current-password"
            className="w-full h-10 px-3 rounded-md border border-ink-100 bg-elevated text-[14px] text-ink-900 placeholder:text-ink-300 focus:border-flare-600 focus:outline-none focus:ring-2 focus:ring-flare-600/20"
          />
          {pwError && (
            <div
              className="p-3 rounded-md bg-verdict-fail/10 text-verdict-fail text-[13px]"
              role="alert"
            >
              {pwError}
            </div>
          )}
          <Button
            type="submit"
            variant="primary"
            size="lg"
            className="w-full"
            disabled={password.length === 0 || pwSubmitting}
          >
            {pwSubmitting ? "Confirming…" : "Confirm with password"}
          </Button>
        </form>
      </Card>
    </main>
  );
}
